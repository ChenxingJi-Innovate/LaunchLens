import { runJson, resolveModel } from '@/lib/llm'
import { langInstruction } from '@/lib/i18n'
import type { DecisionInput, SolutionDraft } from '@/lib/types'

// ============================================================================
// SOLUTIONS — optional pre-step. When the user has a situation and a problem but
// no candidate moves of their own, this drafts a few genuinely different options
// for the customer panel to vote on. The user can edit, delete or add to them
// before running the decision; this route only seeds the list.
//
// The goal is spread, not polish: three options that sit on different strategic
// axes (e.g. price vs. positioning vs. distribution) so the vote is meaningful.
// ============================================================================

const SYSTEM = `你是一位资深商业策略顾问。用户给你一个经营处境和一个要做的决策，
请提出几个【彼此差异明显】的候选方案，覆盖不同的策略方向（例如价格 / 定位 / 渠道 / 产品 / 节奏），
而不是同一思路的三种说法。每个方案要具体、可执行、能被客户直观感知到差别。
不要编造精确数字或价格；用定性或区间表述。`

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<DecisionInput> & { count?: number }
    const situation = body.situation?.trim()
    const problem = body.problem?.trim()
    if (!situation || !problem) return new Response('Missing situation/problem', { status: 400 })

    const lang = body.lang === 'en' ? 'en' : 'zh'
    const count = Math.max(1, Math.min(5, body.count ?? 3))

    const user = `经营处境：${situation}
要做的决策 / 面临的问题：${problem}
${body.audience ? `客户群体：${body.audience}` : ''}
${body.icpHints ? `客户线索：${body.icpHints}` : ''}

请提出恰好 ${count} 个差异明显的候选方案。严格输出 JSON：
{
  "solutions": [
    { "title": "一句话方案名（≤12字）", "detail": "1-2句说明这个方案具体是做什么、和别的方案差在哪" }
  ]
}
要求：恰好 ${count} 条；策略方向彼此不同；title 简短，detail 具体。
${langInstruction(lang)}`

    const raw = await runJson<{ solutions: SolutionDraft[] }>(SYSTEM, user, 1600, 0.8, resolveModel(body.model))
    const solutions = (raw.solutions ?? [])
      .filter((s) => s?.title?.trim())
      .slice(0, count)
      .map((s) => ({ title: s.title.trim(), detail: (s.detail ?? '').trim() }))
    if (solutions.length === 0) return new Response('no solutions generated', { status: 502 })

    return Response.json({ solutions })
  } catch (e: any) {
    return new Response(e?.message ?? 'solutions failed', { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

export const maxDuration = 300
