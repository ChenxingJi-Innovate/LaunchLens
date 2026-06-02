import { runJson, resolveModel } from '@/lib/llm'
import type { DemandStats, EvidenceBundle, IdeaInput, Verdict } from '@/lib/types'

// ============================================================================
// (D) VERDICT — the contradiction meta-judge.
//
// This is the one net-new agent in LaunchLens (it exists in neither StratSquad nor
// TinyTroupe). It reads the SUPPLY verdict (is the market moving toward this?)
// and the DEMAND signal (would real customers buy it?) and forces a single
// honest call. Its whole job is to surface the dangerous case where the two
// disagree (market tailwind but customers reject on price, or vice-versa) and
// to name the cheapest real-world experiment that would settle the doubt.
// ============================================================================

const SYSTEM = `你是 LaunchLens 的"矛盾仲裁官"（contradiction meta-judge）。
你拿到两份相互独立的判断：
1) 供给侧：市场是否在朝这个方向走（来自市场情报引擎）。
2) 需求侧：真实潜在客户是否愿意买（来自合成客群打分）。

你的职责不是讨好任何一方，而是给出一个诚实的最终结论，并特别警惕两侧"打架"的情况：
- 市场顺风但客户拒绝（常因价格/信任/替代品）→ 往往是 conditional 或 kill。
- 市场逆风但客户买账 → 可能是早期机会，但要点明风险。
最终 call 取值：validated（值得做）/ conditional（有条件做，需先验证关键假设）/ kill（不建议做）。
还要给出"最便宜的一个真实验证实验"，以及一个 90 天落地计划。
不要编造精确数字。全部用中文。`

export async function POST(req: Request) {
  try {
    const { input, bundle, stats } = (await req.json()) as {
      input: IdeaInput
      bundle: EvidenceBundle
      stats: DemandStats
    }
    if (!input?.idea?.trim() || !bundle || !stats)
      return new Response('Missing input/bundle/stats', { status: 400 })

    const demandSummary = `需求侧打分（n=${stats.n}）：均值 ${stats.mean}/5，正面 ${stats.positivePct}%，中立 ${stats.neutralPct}%，负面 ${stats.negativePct}%。
分布：${JSON.stringify(stats.histogram)}
主要反对意见：${stats.topObjections.map((o) => `${o.objection}(${o.count})`).join('；') || '无'}
分细分：${stats.bySegment.map((s) => `${s.segment} 均值${s.mean} 正面${s.positivePct}% (n=${s.n})`).join('；')}`

    const supplySummary = `供给侧判断：${bundle.supplyVerdict}（信心 ${bundle.supplyConfidence.toFixed(2)}）
市场总览：${bundle.marketRead}
关键风险：${bundle.experts.find((e) => e.lens === 'risk')?.bullets.join('；') ?? '未列出'}`

    const user = `产品想法：${input.idea}
目标市场：${input.market}（${input.scope}）

===== 供给侧 =====
${supplySummary}

===== 需求侧 =====
${demandSummary}

请综合两侧，严格输出 JSON：
{
  "call": "validated|conditional|kill",
  "rationale": "为什么是这个结论，明确点出供给与需求是一致还是冲突",
  "contradiction": "若两侧存在冲突，用一句话描述；若一致则填 null",
  "cheapestExperiment": "最便宜的一个真实验证动作（如落地页冒烟测试、预售、48 小时玩家访谈）",
  "ninetyDayPlan": [
    {"week":"第1-2周","action":"...","kpi":"..."},
    {"week":"第3-6周","action":"...","kpi":"..."},
    {"week":"第7-12周","action":"...","kpi":"..."}
  ]
}`

    const raw = await runJson<Verdict>(SYSTEM, user, 2500, 0.45, resolveModel(input.model))
    const verdict: Verdict = {
      call: (['validated', 'conditional', 'kill'].includes(raw.call) ? raw.call : 'conditional') as Verdict['call'],
      rationale: raw.rationale ?? '',
      contradiction: raw.contradiction ?? null,
      cheapestExperiment: raw.cheapestExperiment ?? '',
      ninetyDayPlan: Array.isArray(raw.ninetyDayPlan) ? raw.ninetyDayPlan : [],
    }
    return Response.json({ verdict })
  } catch (e: any) {
    return new Response(e?.message ?? 'verdict failed', { status: 500 })
  }
}

export const dynamic = "force-dynamic"
