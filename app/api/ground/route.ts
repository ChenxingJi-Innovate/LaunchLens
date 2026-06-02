import { runJson, clampReliability, resolveModel } from '@/lib/llm'
import { langInstruction } from '@/lib/i18n'
import type { EvidenceBundle, IdeaInput } from '@/lib/types'

// ============================================================================
// (A) GROUND — supply-side market evidence.
//
// This is LaunchLens's StratSquad half, condensed. Where the full StratSquad runs a
// LangGraph fan-out of four ReAct experts over live trend feeds + a BGE-M3 RAG
// corpus, here we reason the same four lenses (competitor / trend / market / risk)
// in one structured pass and tier every cited source by credibility.
//
// The output evidence_bundle is the seam of the whole product: it is fed into the
// synthetic panel (/api/panel) so simulated customers reason over a real market read
// instead of stale imagination. If STRATSQUAD_BACKEND_URL is set, we enrich the
// prompt with live tool results first (best-effort, never fatal).
// ============================================================================

const SYSTEM = `你是 LaunchLens 的供给侧市场情报引擎。你扮演四位资深游戏/消费产品分析师：
- competitor（竞争与差异化）
- trend（品类趋势与玩家迁移）
- market（市场规模、分区、变现）
- risk（政策、IP、执行与上线风险）

基于产品想法与目标市场，给出有证据感、可执行的判断。为每一条关键事实标注来源层级与可靠度。
要点：不要编造精确数字或价格；不确定时用区间或定性表述，并把可靠度调低。`

interface RawBundle extends Omit<EvidenceBundle, 'sources'> {
  sources: { claim: string; origin: string; tier: string; reliability: number }[]
}

// Best-effort live enrichment via StratSquad's HTTP backend. Returns a markdown
// digest to prepend as grounding, or '' if the backend is not configured/unreachable.
async function fetchLiveEvidence(input: IdeaInput): Promise<string> {
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
        question: `针对「${input.idea}」面向「${input.market}」(${input.scope})，给出竞争、趋势、市场规模与风险的关键事实与数据点。`,
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
    const input = (await req.json()) as IdeaInput
    if (!input?.idea?.trim()) return new Response('Missing idea', { status: 400 })

    const live = await fetchLiveEvidence(input)

    const user = `产品想法：${input.idea}
目标市场：${input.market}
市场范围：${input.scope}
${input.icpHints ? `目标客户线索：${input.icpHints}` : ''}${live}

请输出严格 JSON，schema：
{
  "marketRead": "2-3 句话，概括这个品类/市场正在往哪走",
  "experts": [
    {"lens":"competitor","headline":"一句话结论","bullets":["要点1","要点2","要点3"]},
    {"lens":"trend","headline":"...","bullets":["..."]},
    {"lens":"market","headline":"...","bullets":["..."]},
    {"lens":"risk","headline":"...","bullets":["..."]}
  ],
  "sources": [
    {"claim":"被支撑的具体事实","origin":"来源（平台/报告/媒体）","tier":"official|academic|industry|community|ugc|unknown","reliability":0.0}
  ],
  "supplyVerdict": "tailwind|mixed|headwind",
  "supplyConfidence": 0.0
}
要求：experts 必须四个 lens 各一条；sources 给 4-7 条；reliability 0-1 之间，与 tier 相符。
lens 字段保持英文枚举值 (competitor/trend/market/risk)；其余文本字段用目标语言。
${langInstruction(input.lang === 'en' ? 'en' : 'zh')}`

    const raw = await runJson<RawBundle>(SYSTEM, user, 3500, 0.5, resolveModel(input.model))

    // Server-side credibility clamping so the UI/verdict trust one honest band per tier.
    const bundle: EvidenceBundle = {
      marketRead: raw.marketRead,
      experts: raw.experts,
      supplyVerdict: raw.supplyVerdict,
      supplyConfidence: Math.max(0, Math.min(1, raw.supplyConfidence ?? 0.5)),
      sources: (raw.sources ?? []).map((s) => ({
        claim: s.claim,
        origin: s.origin,
        tier: (['official', 'academic', 'industry', 'community', 'ugc', 'unknown'].includes(s.tier)
          ? s.tier
          : 'unknown') as EvidenceBundle['sources'][number]['tier'],
        reliability: clampReliability(s.tier, s.reliability),
      })),
    }

    return Response.json({ bundle, live: live.length > 0 })
  } catch (e: any) {
    return new Response(e?.message ?? 'ground failed', { status: 500 })
  }
}

export const dynamic = "force-dynamic"
