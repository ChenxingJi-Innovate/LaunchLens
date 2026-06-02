import { runJson, resolveModel } from '@/lib/llm'
import { langInstruction } from '@/lib/i18n'
import type {
  DemandStats,
  EvidenceBundle,
  IdeaInput,
  PanelResult,
  PersonaResponse,
} from '@/lib/types'

// ============================================================================
// (B+C) PANEL — demand-side synthetic customer simulation, TinyTroupe-style.
//
// This mirrors TinyTroupe's actual architecture rather than collapsing it:
//   Phase 1 (factory)  — one planning call samples a diverse population of N
//                        persona SPECS (TinyPersonFactory.generate_people),
//                        oversampling extremes for fringe objections.
//   Phase 2 (acting)   — each persona then answers on its OWN independent LLM
//                        call (TinyPerson.act in survey mode, broadcast=False):
//                        it sees only its own spec + the market evidence, never
//                        the other personas. Calls run in parallel.
// Each persona self-reports a believability score (TinyPersonValidator-style
// coherence gate). The result is genuinely separate agents, not one generation.
// ============================================================================

// Phase 1: the factory plans and instantiates a representative population.
const FACTORY_SYSTEM = `你是 TinyTroupe 式的人群工厂 (TinyPersonFactory)。
根据市场证据，规划并生成一组彼此不同、覆盖目标市场主要细分的潜在客户人物档案 (persona spec)。
原则：
- 人群构成应大体反映真实市场比例：主流细分占多数；仅纳入 1-2 个极端样本（如价格极敏感者或明确非目标用户）用于暴露边缘意见，不要让极端/负面样本占多数。
- 每个档案要具体可信：有姓名、一句话人设、所属细分，以及 2-3 句人物小传（性格、消费/使用习惯、对该品类的既有态度与处境）。
- 只产出人物档案，不要让他们现在就作答。`

// Phase 2: a single persona acts on its own, independent of the others.
const ACT_SYSTEM = `你现在就【是】下面这位潜在客户本人，用第一人称思考。
你只代表你自己，独立判断，并不知道其他人怎么想。
基于你的人设处境 + 给定的真实市场情况，诚实决定你会不会采用/购买这个产品。
诚实打分：既不要为讨好而抬高，也不要刻意唱衰；完全按你这个人的真实处境与偏好给分。要引用你自己的处境和市场事实来解释。`

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

interface PersonaSpec {
  name: string
  archetype: string
  segment: string
  persona: string // 2-3 sentence bio: traits, habits, prior attitude to the category
}

interface ActAnswer {
  score: number
  justification: string
  objection: string
  believability: number
}

// Run async tasks with bounded concurrency (so N personas don't all hit the API at once).
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const cur = idx++
      out[cur] = await fn(items[cur], cur)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const CONCURRENCY = 8

export async function POST(req: Request) {
  try {
    const { input, bundle } = (await req.json()) as {
      input: IdeaInput
      bundle: EvidenceBundle
    }
    if (!input?.idea?.trim() || !bundle) return new Response('Missing input/bundle', { status: 400 })

    const size = Math.max(6, Math.min(24, input.panelSize || 12))
    const model = resolveModel(input.model)
    const lang = input.lang === 'en' ? 'en' : 'zh'
    const evidence = evidenceToMarkdown(bundle)

    // ---- Phase 1: factory plans the population (one call) ----
    const factoryUser = `产品想法：${input.idea}
目标市场：${input.market}（范围：${input.scope}）
${input.icpHints ? `目标客户线索：${input.icpHints}` : ''}

===== 市场证据（用于规划贴近真实的人群）=====
${evidence}
===========================================

请规划并生成恰好 ${size} 位潜在客户的人物档案。严格输出 JSON：
{
  "personas": [
    { "name": "姓名", "archetype": "一句话人设标签", "segment": "所属细分市场", "persona": "2-3句人物小传：性格、消费/使用习惯、对该品类的既有态度与处境" }
  ]
}
要求：恰好 ${size} 条；彼此差异明显；覆盖主要细分并包含极端样本。
${langInstruction(lang)}`

    const factory = await runJson<{ personas: PersonaSpec[] }>(FACTORY_SYSTEM, factoryUser, 4000, 0.9, model)
    const specs = (factory.personas ?? []).slice(0, size)
    if (specs.length === 0) return new Response('factory produced no personas', { status: 502 })

    // ---- Phase 2: each persona acts independently (parallel, bounded) ----
    const answered = await mapLimit(specs, CONCURRENCY, async (spec) => {
      const actUser = `【你的人设】
姓名：${spec.name}
人设：${spec.archetype}
细分：${spec.segment}
小传：${spec.persona}

【你了解到的市场情况】
${evidence}

【产品想法】${input.idea}（目标市场：${input.market}）

作为这位客户本人，独立决定你会不会采用/购买。严格输出 JSON：
{
  "score": 1,
  "justification": "第一人称解释你为什么给这个分，引用你的处境和市场事实",
  "objection": "你最大的单一不买理由（即使打高分也要写）",
  "believability": 0.0
}
要求：score 为 1-5 整数；believability(0-1) 是你对这个人设/回答自洽可信度的自评。
${langInstruction(lang)}`
      try {
        const a = await runJson<ActAnswer>(ACT_SYSTEM, actUser, 900, 0.85, model)
        const r: PersonaResponse = {
          name: spec.name,
          archetype: spec.archetype,
          segment: spec.segment,
          score: Math.max(1, Math.min(5, Math.round(a.score))) as PersonaResponse['score'],
          justification: a.justification ?? '',
          objection: a.objection ?? '',
          believability: Math.max(0, Math.min(1, a.believability ?? 0.6)),
        }
        return r
      } catch {
        return null // a single agent failing must not sink the whole panel
      }
    })

    const all = answered.filter((r): r is PersonaResponse => r !== null)
    if (all.length === 0) return new Response('all personas failed to respond', { status: 502 })

    // believability gate (TinyPersonValidator-style): drop incoherent personas < 0.5,
    // but never collapse the panel below a usable floor.
    const gated = all.filter((r) => r.believability >= 0.5)
    const responses = gated.length >= Math.ceil(all.length * 0.6) ? gated : all

    const result: PanelResult = { responses, stats: computeStats(responses) }
    return Response.json(result)
  } catch (e: any) {
    return new Response(e?.message ?? 'panel failed', { status: 500 })
  }
}

export const dynamic = "force-dynamic"

export const maxDuration = 300
