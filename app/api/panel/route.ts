import { runJson, resolveModel } from '@/lib/llm'
import { langInstruction } from '@/lib/i18n'
import type {
  AgentVote,
  DecisionInput,
  EvidenceBundle,
  PanelResult,
  Solution,
  SolutionScore,
  SolutionTally,
} from '@/lib/types'

// ============================================================================
// (B+C) PANEL — the imagined customers, TinyTroupe-style, turned into a vote.
//
// This mirrors TinyTroupe's actual architecture rather than collapsing it:
//   Phase 1 (factory)  — one planning call samples a diverse population of N
//                        customer SPECS (TinyPersonFactory.generate_people),
//                        oversampling extremes for fringe reactions.
//   Phase 2 (voting)   — each customer then votes on its OWN independent LLM
//                        call (TinyPerson.act in survey mode, broadcast=False):
//                        it sees only its own spec + the market research + the
//                        candidate solutions, scores EVERY solution 1-5, and
//                        picks the one move it would choose. Calls run in parallel.
//
// The panel never decides on its own; it produces a vote. The tally (who picked
// what, mean score per solution, per-segment splits) is computed server-side so
// the UI and the decision judge trust one source of truth.
// ============================================================================

// Phase 1: the factory plans and instantiates a representative population.
const FACTORY_SYSTEM = `你是 TinyTroupe 式的人群工厂 (TinyPersonFactory)。
根据市场调研，规划并生成一组彼此不同、覆盖目标客户群主要细分的客户人物档案 (persona spec)。
原则：
- 人群构成应大体反映真实市场比例：主流细分占多数；仅纳入 1-2 个极端样本（如价格极敏感者或明确非目标用户）用于暴露边缘意见，不要让极端/负面样本占多数。
- 每个档案要具体可信：有姓名、一句话人设、所属细分，以及 2-3 句人物小传（性格、消费/使用习惯、对该品类的既有态度与处境）。
- 只产出人物档案，不要让他们现在就投票。`

// Phase 2: a single customer votes on its own, independent of the others.
const VOTE_SYSTEM = `你现在就【是】下面这位客户本人，用第一人称思考。
你只代表你自己，独立判断，并不知道其他人怎么想。
有人给你看了几个候选方案，请你站在自己的处境和偏好上，给每个方案打分（1-5，5=我会非常买账），
然后选出你本人最希望商家采用的那一个方案。诚实判断：既不讨好也不刻意唱衰，引用你的处境和市场事实来解释。`

function evidenceToMarkdown(b: EvidenceBundle): string {
  const experts = b.experts
    .map((e) => `- [${e.lens}] ${e.headline}\n  ${e.bullets.join('；')}`)
    .join('\n')
  const sources = b.sources
    .map((s) => `- (${s.tier}, 可靠度${s.reliability.toFixed(2)}) ${s.claim} — ${s.origin}`)
    .join('\n')
  return `市场总判断：${b.marketRead}\n市场气候：${b.climate} (信心${b.confidence.toFixed(2)})\n\n四方视角：\n${experts}\n\n带可靠度的证据：\n${sources}`
}

function solutionsToMarkdown(solutions: Solution[]): string {
  return solutions.map((s) => `[${s.id}] ${s.title}${s.detail ? `：${s.detail}` : ''}`).join('\n')
}

// Tally the panel: per-solution mean score, first-choice votes, per-segment splits.
function computeTally(solutions: Solution[], agents: AgentVote[]): SolutionTally[] {
  const segmentsOf = (sid: string) => {
    const map = new Map<string, { sum: number; n: number; firsts: number }>()
    for (const a of agents) {
      const sc = a.scores.find((s) => s.solutionId === sid)?.score ?? 3
      const seg = a.segment || '未分类'
      const cur = map.get(seg) ?? { sum: 0, n: 0, firsts: 0 }
      cur.sum += sc
      cur.n += 1
      if (a.pick === sid) cur.firsts += 1
      map.set(seg, cur)
    }
    return Array.from(map.entries()).map(([segment, v]) => ({
      segment,
      meanScore: +(v.sum / v.n).toFixed(2),
      firstChoiceVotes: v.firsts,
      n: v.n,
    }))
  }

  const n = agents.length || 1
  const tally = solutions.map((sol) => {
    const scores = agents.map((a) => a.scores.find((s) => s.solutionId === sol.id)?.score ?? 3)
    const sum = scores.reduce((a, b) => a + b, 0)
    const positive = scores.filter((s) => s >= 4).length
    const firstChoiceVotes = agents.filter((a) => a.pick === sol.id).length
    return {
      solutionId: sol.id,
      title: sol.title,
      firstChoiceVotes,
      votePct: +((firstChoiceVotes / n) * 100).toFixed(1),
      meanScore: +(sum / (scores.length || 1)).toFixed(2),
      positivePct: +((positive / (scores.length || 1)) * 100).toFixed(1),
      bySegment: segmentsOf(sol.id),
    }
  })

  // Winner-first: most first-choice votes, tie broken by mean score.
  tally.sort((a, b) => b.firstChoiceVotes - a.firstChoiceVotes || b.meanScore - a.meanScore)
  return tally
}

interface PersonaSpec {
  name: string
  archetype: string
  segment: string
  persona: string // 2-3 sentence bio
}

interface RawVote {
  scores: { solutionId: string; score: number }[]
  pick: string
  reasoning: string
  objection: string
  believability: number
}

// Run async tasks with bounded concurrency (so N customers don't all hit the API at once).
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
    const { input, bundle } = (await req.json()) as { input: DecisionInput; bundle: EvidenceBundle }
    if (!input?.problem?.trim() || !bundle) return new Response('Missing input/bundle', { status: 400 })

    const solutions = (input.solutions ?? []).filter((s) => s?.id && s?.title?.trim())
    if (solutions.length < 2) return new Response('need at least 2 solutions', { status: 400 })
    const validIds = new Set(solutions.map((s) => s.id))

    const size = Math.max(6, Math.min(24, input.panelSize || 12))
    const model = resolveModel(input.model)
    const lang = input.lang === 'en' ? 'en' : 'zh'
    const evidence = evidenceToMarkdown(bundle)
    const solList = solutionsToMarkdown(solutions)

    // ---- Phase 1: factory plans the population (one call) ----
    const factoryUser = `经营处境：${input.situation}
要决策的问题：${input.problem}
客户群体：${input.audience}（范围：${input.scope}）
${input.icpHints ? `客户线索：${input.icpHints}` : ''}

===== 市场调研（用于规划贴近真实的人群）=====
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

    // ---- Phase 2: each customer votes independently (parallel, bounded) ----
    const answered = await mapLimit(specs, CONCURRENCY, async (spec) => {
      const voteUser = `【你的人设】
姓名：${spec.name}
人设：${spec.archetype}
细分：${spec.segment}
小传：${spec.persona}

【你了解到的市场情况】
${evidence}

【商家面临的决策】${input.problem}

【候选方案（请逐一打分，并选出你最希望商家采用的一个）】
${solList}

作为这位客户本人，独立投票。严格输出 JSON：
{
  "scores": [ { "solutionId": "A", "score": 1 } ],
  "pick": "你最希望采用的方案 id（只能是上面列出的字母之一）",
  "reasoning": "第一人称解释你为什么这样选，引用你的处境和市场事实",
  "objection": "你对你所选方案最大的单一顾虑",
  "believability": 0.0
}
要求：scores 必须为每一个候选方案各给一条，score 是 1-5 整数（5=我会非常买账）；
pick 必须是某个候选方案的 id；believability(0-1) 是你对这个人设/回答自洽可信度的自评。
${langInstruction(lang)}`
      try {
        const a = await runJson<RawVote>(VOTE_SYSTEM, voteUser, 1100, 0.85, model)

        // Coerce scores: one entry per known solution, clamped 1-5, missing → 3 (neutral).
        const byId = new Map<string, number>()
        for (const s of a.scores ?? []) {
          if (validIds.has(s.solutionId)) byId.set(s.solutionId, Math.max(1, Math.min(5, Math.round(s.score))))
        }
        const scores: SolutionScore[] = solutions.map((sol) => ({
          solutionId: sol.id,
          score: (byId.get(sol.id) ?? 3) as SolutionScore['score'],
        }))

        // Pick: honour the agent's choice if valid, else fall back to its own highest score.
        let pick = validIds.has(a.pick) ? a.pick : ''
        if (!pick) pick = [...scores].sort((x, y) => y.score - x.score)[0].solutionId

        const vote: AgentVote = {
          name: spec.name,
          archetype: spec.archetype,
          segment: spec.segment,
          believability: Math.max(0, Math.min(1, a.believability ?? 0.6)),
          scores,
          pick,
          reasoning: a.reasoning ?? '',
          objection: a.objection ?? '',
        }
        return vote
      } catch {
        return null // a single agent failing must not sink the whole panel
      }
    })

    // Keep every agent that voted so the panel size matches what the user asked for.
    // believability is still recorded per agent (a self-rated coherence score) but no longer
    // drops anyone: silently shrinking 12 -> 11 was confusing. Only a hard vote failure (null)
    // can reduce the count now.
    const agents = answered.filter((r): r is AgentVote => r !== null)
    if (agents.length === 0) return new Response('all agents failed to vote', { status: 502 })

    const tally = computeTally(solutions, agents)
    const result: PanelResult = { agents, tally, winnerId: tally[0]?.solutionId ?? solutions[0].id, n: agents.length }
    return Response.json(result)
  } catch (e: any) {
    return new Response(e?.message ?? 'panel failed', { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

export const maxDuration = 300
