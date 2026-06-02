import { runJson, resolveModel } from '@/lib/llm'
import type {
  DemandStats,
  EvidenceBundle,
  IdeaInput,
  PanelResult,
  PersonaResponse,
} from '@/lib/types'

// ============================================================================
// (B+C) PANEL — demand-side synthetic customer simulation.
//
// This is LaunchLens's TinyTroupe half, condensed. The full TinyTroupe samples a
// population via TinyPersonFactory, gates each persona with TinyPersonValidator,
// runs them in a TinyWorld, then mines answers with ResultsExtractor. Here we do
// the equivalent in one grounded structured pass: derive a representative panel
// from the market read, oversample extremes for fringe objections, and have each
// persona privately rate adoption propensity (survey mode, broadcast=False) while
// reasoning over the supply-side evidence bundle.
//
// THE KEY MOVE: every persona reads the evidence bundle before answering, so the
// demand signal is grounded in the real market read, not imagined in a vacuum.
// ============================================================================

const SYSTEM = `你是 LaunchLens 的需求侧合成客群引擎，等价于 TinyTroupe 的人群工厂 + 调研提取。
你要"召唤"一组真实可信、彼此不同的潜在客户人物（persona），让他们针对一个产品想法独立打分。
原则：
- 覆盖目标市场的主要细分，并刻意纳入极端样本（价格极敏感者、重度老玩家、完全不感兴趣者），以暴露边缘反对意见。
- 每个 persona 必须先读"市场证据"，其打分理由应尽量引用其中的真实情况，而不是凭空想象。
- 打分要分散、真实，允许出现低分。不要让所有人都给高分。
- believability 表示这个 persona 是否自洽可信（0-1），明显套路化/不可信的给低分。
全部用中文。`

function evidenceToMarkdown(b: EvidenceBundle): string {
  const experts = b.experts
    .map((e) => `- [${e.lens}] ${e.headline}\n  ${e.bullets.join('；')}`)
    .join('\n')
  const sources = b.sources
    .map((s) => `- (${s.tier}, 可靠度${s.reliability.toFixed(2)}) ${s.claim} — ${s.origin}`)
    .join('\n')
  return `市场总判断：${b.marketRead}\n供给侧结论：${b.supplyVerdict} (信心${b.supplyConfidence.toFixed(2)})\n\n四方视角：\n${experts}\n\n带可靠度的证据：\n${sources}`
}

function computeStats(rs: PersonaResponse[]): DemandStats {
  const n = rs.length || 1
  const histogram = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as DemandStats['histogram']
  let sum = 0
  for (const r of rs) {
    histogram[String(r.score) as '1'] = (histogram[String(r.score) as '1'] ?? 0) + 1
    sum += r.score
  }
  const positive = histogram['4'] + histogram['5']
  const neutral = histogram['3']
  const negative = histogram['1'] + histogram['2']

  // top objections, naive normalization by trimmed text
  const objMap = new Map<string, number>()
  for (const r of rs) {
    const key = (r.objection || '').trim().slice(0, 40)
    if (key) objMap.set(key, (objMap.get(key) ?? 0) + 1)
  }
  const topObjections = Array.from(objMap.entries())
    .map(([objection, count]) => ({ objection, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // per-segment breakdown
  const segMap = new Map<string, PersonaResponse[]>()
  for (const r of rs) {
    const k = r.segment || '未分类'
    if (!segMap.has(k)) segMap.set(k, [])
    segMap.get(k)!.push(r)
  }
  const bySegment = Array.from(segMap.entries()).map(([segment, arr]) => {
    const sn = arr.length
    const sMean = arr.reduce((a, b) => a + b.score, 0) / sn
    const sPos = arr.filter((x) => x.score >= 4).length / sn
    return { segment, mean: +sMean.toFixed(2), positivePct: +(sPos * 100).toFixed(1), n: sn }
  })

  return {
    n: rs.length,
    mean: +(sum / n).toFixed(2),
    positivePct: +((positive / n) * 100).toFixed(1),
    neutralPct: +((neutral / n) * 100).toFixed(1),
    negativePct: +((negative / n) * 100).toFixed(1),
    histogram,
    topObjections,
    bySegment,
  }
}

export async function POST(req: Request) {
  try {
    const { input, bundle } = (await req.json()) as {
      input: IdeaInput
      bundle: EvidenceBundle
    }
    if (!input?.idea?.trim() || !bundle) return new Response('Missing input/bundle', { status: 400 })

    const size = Math.max(6, Math.min(24, input.panelSize || 12))

    const user = `产品想法：${input.idea}
目标市场：${input.market}（范围：${input.scope}）
${input.icpHints ? `目标客户线索：${input.icpHints}` : ''}

===== 市场证据（每个 persona 必须基于此作答）=====
${evidenceToMarkdown(bundle)}
===============================================

请生成 ${size} 位潜在客户 persona，并让每人对"是否会采用/购买这个产品"打分。
严格输出 JSON：
{
  "responses": [
    {
      "name": "中文名",
      "archetype": "一句话人设标签，如 '价格敏感的休闲手游玩家'",
      "segment": "所属细分市场，如 '东南亚学生党'",
      "believability": 0.0,
      "score": 1,
      "justification": "为什么给这个分，尽量引用上面的市场证据",
      "objection": "他/她不买的最大单一理由（即使打高分也要写）"
    }
  ]
}
要求：恰好 ${size} 条；score 为 1-5 的整数；分数要真实分散；believability 在 0-1。`

    const raw = await runJson<{ responses: PersonaResponse[] }>(SYSTEM, user, 6000, 0.8, resolveModel(input.model))

    // believability gate (TinyPersonValidator-style): drop incoherent personas < 0.5,
    // but never collapse the panel below a usable floor.
    const all = (raw.responses ?? []).map((r) => ({
      ...r,
      score: Math.max(1, Math.min(5, Math.round(r.score))) as PersonaResponse['score'],
      believability: Math.max(0, Math.min(1, r.believability ?? 0.6)),
    }))
    const gated = all.filter((r) => r.believability >= 0.5)
    const responses = gated.length >= Math.ceil(size * 0.6) ? gated : all

    const result: PanelResult = { responses, stats: computeStats(responses) }
    return Response.json(result)
  } catch (e: any) {
    return new Response(e?.message ?? 'panel failed', { status: 500 })
  }
}

export const dynamic = "force-dynamic"
