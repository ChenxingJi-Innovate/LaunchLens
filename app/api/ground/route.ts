import { runJson, clampReliability, resolveModel } from '@/lib/llm'
import { langInstruction } from '@/lib/i18n'
import { retrieve } from '@/lib/rag'
import type { DecisionInput, EvidenceBundle, UserChunk } from '@/lib/types'

// ============================================================================
// (A) RESEARCH — the grounded market read the customer panel votes against.
//
// This is Customer Jury's StratSquad half, condensed. Where the full StratSquad runs a
// LangGraph fan-out of four ReAct experts over live trend feeds + a BGE-M3 RAG
// corpus, here we reason the same four lenses (competitor / trend / market / risk)
// in one structured pass over the user's SITUATION, the PROBLEM they face, and the
// candidate SOLUTIONS, and tier every cited source by credibility.
//
// The output evidence_bundle is the seam of the whole product: it is handed to the
// customer agents (/api/panel) so their vote is grounded in a real market read
// instead of stale imagination. If STRATSQUAD_BACKEND_URL is set, we enrich the
// prompt with live tool results first (best-effort, never fatal).
// ============================================================================

const SYSTEM = `你是 Customer Jury 的市场调研引擎。你扮演四位资深商业/消费分析师：
- competitor（竞争对手会如何反应、各方案的差异化）
- trend（品类与用户行为趋势）
- market（市场规模、分区、变现与价格弹性）
- risk（政策、执行、声誉与现金流风险）

用户会给你一个经营处境、要做的决策，以及几个候选方案。请围绕"这些方案各自在当前市场里成立吗"
给出有证据感、可执行的判断。为每一条关键事实标注来源层级与可靠度。
要点：不要编造精确数字或价格；不确定时用区间或定性表述，并把可靠度调低。`

interface RawBundle {
  marketRead: string
  experts: EvidenceBundle['experts']
  climate: EvidenceBundle['climate']
  confidence: number
  sources: { claim: string; origin: string; tier: string; reliability: number }[]
}

function solutionsBlock(solutions: DecisionInput['solutions']): string {
  if (!solutions?.length) return ''
  return solutions.map((s) => `  [${s.id}] ${s.title}${s.detail ? ` — ${s.detail}` : ''}`).join('\n')
}

// Best-effort live enrichment via StratSquad's HTTP backend. Returns a markdown
// digest to prepend as grounding, or '' if the backend is not configured/unreachable.
async function fetchLiveEvidence(input: DecisionInput): Promise<string> {
  const base = process.env.STRATSQUAD_BACKEND_URL
  if (!base) return ''
  try {
    const token = process.env.STRATSQUAD_MCP_TOKEN
    const res = await fetch(`${base.replace(/\/$/, '')}/api/qa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        question: `经营处境「${input.situation}」，要决策「${input.problem}」，面向「${input.audience}」(${input.scope})。给出竞争、趋势、市场规模与风险的关键事实与数据点。`,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return ''
    const data = await res.json().catch(() => null)
    const text = typeof data === 'string' ? data : data?.answer ?? data?.brief ?? ''
    return text ? `\n\n【StratSquad 实时情报（仅供参考，请甄别）】\n${text}` : ''
  } catch {
    return ''
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DecisionInput & { userChunks?: UserChunk[] }
    const input = body
    if (!input?.situation?.trim() || !input?.problem?.trim())
      return new Response('Missing situation/problem', { status: 400 })

    const live = await fetchLiveEvidence(input)

    // RAG: retrieve the most relevant slices of the attached knowledge base, so the
    // four-lens reasoning is grounded in the user's own documents, not just the model's prior.
    let kbHits: UserChunk[] = []
    if (body.userChunks && body.userChunks.length > 0) {
      try {
        const query = `${input.problem}. 处境: ${input.situation}. 客户: ${input.audience}. ${input.icpHints ?? ''}`
        kbHits = await retrieve(query, body.userChunks, 5)
      } catch {
        kbHits = [] // KB retrieval is best-effort; never block the run
      }
    }
    const kbBlock = kbHits.length
      ? `\n\n【知识库证据 / Knowledge base (来自用户上传，最高可信，优先采用)】\n` +
        kbHits.map((h, i) => `[KB${i + 1}|${h.source}] ${h.text}`).join('\n')
      : ''

    const user = `经营处境：${input.situation}
要做的决策 / 面临的问题：${input.problem}
客户群体：${input.audience}
市场范围：${input.scope}
${input.icpHints ? `客户线索：${input.icpHints}` : ''}

候选方案：
${solutionsBlock(input.solutions)}${live}${kbBlock}

请输出严格 JSON，schema：
{
  "marketRead": "2-3 句话，概括这个品类/市场正在往哪走，以及它对上述决策意味着什么",
  "experts": [
    {"lens":"competitor","headline":"一句话结论","bullets":["要点1","要点2","要点3"]},
    {"lens":"trend","headline":"...","bullets":["..."]},
    {"lens":"market","headline":"...","bullets":["..."]},
    {"lens":"risk","headline":"...","bullets":["..."]}
  ],
  "sources": [
    {"claim":"被支撑的具体事实","origin":"来源（平台/报告/媒体）","tier":"internal|official|academic|industry|community|ugc|unknown","reliability":0.0}
  ],
  "climate": "tailwind|mixed|headwind",
  "confidence": 0.0
}
要求：experts 必须四个 lens 各一条；sources 给 4-7 条；reliability 0-1 之间，与 tier 相符。
climate 表示当前市场对解决这个问题整体是顺风、喜忧参半还是逆风。
若上文提供了"知识库证据"，必须优先采用它，并在结论与 sources 中体现；引用知识库的条目 tier 用 "internal"。
lens 与 climate 字段保持英文枚举值；其余文本字段用目标语言。
${langInstruction(input.lang === 'en' ? 'en' : 'zh')}`

    const raw = await runJson<RawBundle>(SYSTEM, user, 3500, 0.5, resolveModel(input.model))

    // Server-side credibility clamping so the UI/verdict trust one honest band per tier.
    const bundle: EvidenceBundle = {
      marketRead: raw.marketRead,
      experts: raw.experts,
      climate: (['tailwind', 'mixed', 'headwind'].includes(raw.climate) ? raw.climate : 'mixed') as EvidenceBundle['climate'],
      confidence: Math.max(0, Math.min(1, raw.confidence ?? 0.5)),
      sources: (raw.sources ?? []).map((s) => ({
        claim: s.claim,
        origin: s.origin,
        tier: (['internal', 'official', 'academic', 'industry', 'community', 'ugc', 'unknown'].includes(s.tier)
          ? s.tier
          : 'unknown') as EvidenceBundle['sources'][number]['tier'],
        reliability: clampReliability(s.tier, s.reliability),
      })),
    }

    // Guarantee the retrieved KB chunks appear as internal-tier sources, even if the
    // model failed to echo them, so the UI always shows the knowledge base was used.
    if (kbHits.length) {
      const seen = new Set(bundle.sources.filter((s) => s.tier === 'internal').map((s) => s.origin))
      const kbSources = kbHits
        .filter((h) => !seen.has(h.source) || bundle.sources.filter((s) => s.tier === 'internal').length === 0)
        .slice(0, 3)
        .map((h) => ({
          claim: h.text.slice(0, 80),
          origin: h.source,
          tier: 'internal' as const,
          reliability: clampReliability('internal', 0.9),
        }))
      const existing = new Set(bundle.sources.map((s) => s.claim))
      bundle.sources = [...kbSources.filter((s) => !existing.has(s.claim)), ...bundle.sources]
    }

    return Response.json({ bundle, live: live.length > 0, kbUsed: kbHits.length })
  } catch (e: any) {
    return new Response(e?.message ?? 'research failed', { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

export const maxDuration = 300
