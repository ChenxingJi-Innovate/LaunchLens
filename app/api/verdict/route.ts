import { runJson, resolveModel } from '@/lib/llm'
import { langInstruction } from '@/lib/i18n'
import type { DecisionInput, EvidenceBundle, SolutionTally, Verdict } from '@/lib/types'

// ============================================================================
// (D) DECISION — the judge that turns the customer vote into one business move.
//
// The panel produced a vote (first-choice tally + mean score per solution). The
// market research produced a climate read. This judge reconciles the two: it
// normally recommends the vote winner, but it is allowed to override when the
// runner-up is the sounder business decision (e.g. the winner is loved but the
// market climate makes it ruinous), and it must justify any override. It names
// the trade-off you accept, the close contender to keep on the table, the
// cheapest real test before committing, and a 90-day plan.
// ============================================================================

const SYSTEM = `你是 LaunchLens 的"决策官"（decision judge）。
你拿到三样东西：市场调研（气候 + 风险）、几个候选方案、以及一群想象中的客户对这些方案的投票结果。
你的职责：把客户投票转化为一个【对生意最有利】的最终决策。
原则：
- 默认采用得票最高的方案；但如果票数最高的方案在市场气候/风险下明显是坏生意，你可以改推次优方案，并必须在 rationale 里说清为什么推翻民意。
- 诚实说明这个决策的代价（tradeoff）和值得保留观察的次优选项（runner-up）。
- 给出"最便宜的一个真实验证实验"和一个 90 天落地计划。
不要编造精确数字。`

export async function POST(req: Request) {
  try {
    const { input, bundle, tally } = (await req.json()) as {
      input: DecisionInput
      bundle: EvidenceBundle
      tally: SolutionTally[]
    }
    if (!input?.problem?.trim() || !bundle || !Array.isArray(tally) || tally.length === 0)
      return new Response('Missing input/bundle/tally', { status: 400 })

    const validIds = new Set(tally.map((t) => t.solutionId))

    const voteSummary = tally
      .map(
        (t) =>
          `[${t.solutionId}] ${t.title} — 首选票 ${t.firstChoiceVotes} (${t.votePct}%)，均分 ${t.meanScore}/5，正面 ${t.positivePct}%；分细分：${t.bySegment
            .map((s) => `${s.segment}(均分${s.meanScore}/首选${s.firstChoiceVotes}/n${s.n})`)
            .join('、')}`,
      )
      .join('\n')

    const climateSummary = `市场气候：${bundle.climate}（信心 ${bundle.confidence.toFixed(2)}）
市场总览：${bundle.marketRead}
关键风险：${bundle.experts.find((e) => e.lens === 'risk')?.bullets.join('；') ?? '未列出'}`

    const user = `经营处境：${input.situation}
要决策的问题：${input.problem}
客户群体：${input.audience}（${input.scope}）

===== 市场调研 =====
${climateSummary}

===== 客户投票（按首选票从高到低）=====
${voteSummary}

请综合投票与市场气候，严格输出 JSON：
{
  "recommendedId": "你最终推荐的方案 id（必须是上面出现过的 id）",
  "decisiveness": "clear|narrow|split",
  "rationale": "为什么这是对生意最有利的决策；若你推翻了得票第一的方案，必须说清原因",
  "runnerUpId": "值得保留观察的次优方案 id；若没有则填 null",
  "tradeoff": "选择这个方案你要承受的代价；若几乎没有则填 null",
  "cheapestExperiment": "在全力投入前，最便宜的一个真实验证动作（如落地页冒烟测试、预售、48 小时客户访谈）",
  "ninetyDayPlan": [
    {"week":"第1-2周","action":"...","kpi":"..."},
    {"week":"第3-6周","action":"...","kpi":"..."},
    {"week":"第7-12周","action":"...","kpi":"..."}
  ]
}
decisiveness 表示投票有多决定性：clear（一边倒）/ narrow（险胜，与次优很接近）/ split（严重分歧/票数分散）。
recommendedId 与 runnerUpId 必须是候选方案 id；decisiveness 保持英文枚举值；其余文本字段用目标语言。
${langInstruction(input.lang === 'en' ? 'en' : 'zh')}`

    const raw = await runJson<Verdict>(SYSTEM, user, 2600, 0.45, resolveModel(input.model))

    const winnerId = tally[0].solutionId
    const verdict: Verdict = {
      recommendedId: validIds.has(raw.recommendedId) ? raw.recommendedId : winnerId,
      decisiveness: (['clear', 'narrow', 'split'].includes(raw.decisiveness) ? raw.decisiveness : 'narrow') as Verdict['decisiveness'],
      rationale: raw.rationale ?? '',
      runnerUpId: raw.runnerUpId && validIds.has(raw.runnerUpId) ? raw.runnerUpId : null,
      tradeoff: raw.tradeoff ?? null,
      cheapestExperiment: raw.cheapestExperiment ?? '',
      ninetyDayPlan: Array.isArray(raw.ninetyDayPlan) ? raw.ninetyDayPlan : [],
    }
    return Response.json({ verdict })
  } catch (e: any) {
    return new Response(e?.message ?? 'verdict failed', { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

export const maxDuration = 300
