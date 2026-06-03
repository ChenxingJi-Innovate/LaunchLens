// Customer Jury bilingual strings (中文 default, English toggle) per workspace house style.
// UI strings live here; the `lang` is also sent to the API so the LLM output language matches.
import type { DeepSeekModel, MarketScope, EvidenceBundle, Verdict, SolutionDraft } from './types'

export type Lang = 'zh' | 'en'

export interface Dict {
  // header
  tagline: string
  intro1: string
  marketResearch: string // emphasised
  intro2: string
  customerVote: string // emphasised
  intro3: string
  introEmph: string // italic accent
  langToggle: string // label shown on the toggle to switch to the OTHER language
  // input — situation & problem
  situationLabel: string
  situationPlaceholder: string
  problemLabel: string
  problemPlaceholder: string
  // input — solutions
  solutionsLabel: string
  solutionsHint: string
  solutionTitlePlaceholder: string
  solutionDetailPlaceholder: string
  addSolution: string
  removeSolution: string
  genSolutions: string
  genningSolutions: string
  genCountTitle: string
  optionLetter: (i: number) => string
  // input — audience & rest
  audienceLabel: string
  audiencePlaceholder: string
  scopeLabel: string
  icpLabel: string
  icpPlaceholder: string
  // one-click sample
  sampleLabel: string
  sampleChip: string
  sample: {
    situation: string
    problem: string
    solutions: SolutionDraft[]
    audience: string
    scope: MarketScope
    icpHints: string
  }
  panelLabel: (n: number) => string
  modelLabel: string
  // knowledge base (RAG)
  kbLabel: string
  kbPlaceholder: string
  kbAdd: string
  kbAdding: string
  kbEmpty: string
  kbChunks: (n: number) => string
  kbClear: string
  kbBadge: string
  kbErrEmpty: string
  kbErrFail: string
  runBtn: string
  runningBtn: string
  errFill: string
  errSolutions: string
  errRun: string
  errGen: string
  errMaxSolutions: string
  scope: Record<MarketScope, string>
  modelHint: Record<DeepSeekModel, string>
  // stage rail
  stageGround: string
  stagePanel: string
  stageJudge: string
  // empty
  empty1: string
  empty2: string
  // research card
  researchTitle: string
  researchSub: string
  confidence: string
  sourceReliability: string
  climate: Record<EvidenceBundle['climate'], string>
  lens: Record<'competitor' | 'trend' | 'market' | 'risk', string>
  // vote card
  voteTitle: string
  voteSub: (n: number) => string
  winnerBadge: string
  votesLabel: string
  meanLabel: string
  agentsToggle: (n: number) => string
  agentPick: string
  // decision card
  decisionTitle: string
  decisionSub: string
  recommendLabel: string
  decisiveness: Record<Verdict['decisiveness'], string>
  tradeoffLabel: string
  runnerUpLabel: string
  cheapestLabel: string
  planLabel: string
  exportBtn: string
  // export payload
  exportSys: string
  exportSituation: (situation: string, problem: string, audience: string, scope: string) => string
  exportSolutions: (list: string) => string
  exportVote: (summary: string) => string
  exportDecision: (title: string, decisiveness: string) => string
  exportReason: (r: string) => string
  exportTradeoff: (t: string) => string
  exportCheapest: (e: string) => string
  exportPlan: (p: string) => string
}

const zh: Dict = {
  tagline: '让 AI 扮演你的客户，投票选出最该做的那个商业决策',
  intro1: '描述你的处境与难题，给几个方案（或让 AI 生成），引擎先做一轮',
  marketResearch: '市场调研',
  intro2: '，再生成一群想象中的',
  customerVote: '客户来投票',
  intro3: '，最后替你选出',
  introEmph: ' 最划算的那一步。',
  langToggle: 'EN',
  situationLabel: '你的处境 (Situation)',
  situationPlaceholder: '例：我们是区域连锁奶茶品牌，门店还在增长但单店复购和客单价在下滑……',
  problemLabel: '面临的决策 / 问题 (Problem)',
  problemPlaceholder: '例：这个季度有限的预算，应该押在哪个增长动作上？',
  solutionsLabel: '候选方案 (Solutions)',
  solutionsHint: '至少 2 个方案，客户会逐一打分并选出最优。可手动填写，或让 AI 生成。',
  solutionTitlePlaceholder: '方案名（如：全线降价走量）',
  solutionDetailPlaceholder: '一句话说明这个方案具体做什么（可选）',
  addSolution: '加一个方案',
  removeSolution: '删除',
  genSolutions: 'AI 生成方案',
  genningSolutions: '生成中…',
  genCountTitle: '生成条数 1-5',
  optionLetter: (i) => String.fromCharCode(65 + i),
  audienceLabel: '客户群体 (Audience)',
  audiencePlaceholder: '例：18-30 岁城市白领与学生',
  scopeLabel: '市场范围 (Scope)',
  icpLabel: '目标客户线索 (可选)',
  icpPlaceholder: '例：高频外卖、重度社交媒体、对联名敏感',
  sampleLabel: '试试示例',
  sampleChip: '奶茶连锁 · 增长抉择',
  sample: {
    situation:
      '我们是一个区域连锁奶茶品牌，有 40 家门店。过去一年门店数还在涨，但单店复购和客单价都在下滑，毛利被外卖补贴和原料涨价两头挤压。',
    problem: '接下来这个季度，应该把有限的预算押在哪个增长动作上？',
    solutions: [
      { title: '全线降价走量', detail: '招牌产品降价 20-30%，靠外卖平台冲单量和曝光' },
      { title: '上新高端联名', detail: '推出与本地 IP 联名的高价新品线，主打到店打卡与社交分享' },
      { title: '做会员订阅', detail: '推出月卡订阅，锁定高频用户的复购，换取更稳定的现金流' },
    ],
    audience: '18-30 岁城市白领与学生，价格敏感但愿意为社交货币买单',
    scope: 'china',
    icpHints: '高频外卖用户、重度社交媒体、对联名与限定款敏感',
  },
  panelLabel: (n) => `客户投票人数：${n} 人`,
  modelLabel: '推理模型 (DeepSeek)',
  kbLabel: '知识库 (RAG · 可选)',
  kbPlaceholder: '粘贴文档文本，或输入网址 URL',
  kbAdd: '添加',
  kbAdding: '处理中…',
  kbEmpty: '上传经营数据、竞品资料或调研，作为最高可信(internal)证据接入。',
  kbChunks: (n) => `${n} 段`,
  kbClear: '清空',
  kbBadge: '已挂载知识库',
  kbErrEmpty: '请先粘贴文本或输入网址',
  kbErrFail: '知识库添加失败',
  runBtn: '开始投票',
  runningBtn: '运行中…',
  errFill: '请填写你的处境和面临的问题',
  errSolutions: '请至少给出 2 个候选方案（可让 AI 生成）',
  errRun: '运行失败',
  errGen: '方案生成失败',
  errMaxSolutions: '最多保存 10 个方案，先删掉一些再生成',
  scope: { china: '中国', global: '全球', overseas: '海外' },
  modelHint: { 'deepseek-v4-flash': '更快 · 推荐', 'deepseek-v4-pro': '更细致 · 较慢' },
  stageGround: '市场调研',
  stagePanel: '客户投票',
  stageJudge: '最终决策',
  empty1: '在左侧描述处境、写下难题、给几个方案，开始一次投票。',
  empty2: '市场调研 → 想象中的客户逐一打分投票 → 决策官给出最划算的一步，并导出可微调的 JSONL。',
  researchTitle: '市场调研',
  researchSub: '当前市场对解决这个问题是顺风还是逆风？',
  confidence: '信心',
  sourceReliability: '来源可靠度',
  climate: { tailwind: '市场顺风', mixed: '喜忧参半', headwind: '市场逆风' },
  lens: { competitor: '竞争', trend: '趋势', market: '市场', risk: '风险' },
  voteTitle: '客户投票',
  voteSub: (n) => `${n} 位想象中的客户独立打分并投票（已读市场调研）`,
  winnerBadge: '客户最青睐',
  votesLabel: '首选票',
  meanLabel: '均分',
  agentsToggle: (n) => `展开 ${n} 位客户的逐条投票`,
  agentPick: '选了',
  decisionTitle: '最终决策',
  decisionSub: '把客户投票变成对生意最有利的一步',
  recommendLabel: '推荐决策',
  decisiveness: { clear: '一边倒', narrow: '险胜', split: '严重分歧' },
  tradeoffLabel: '你要承受的代价',
  runnerUpLabel: '值得保留观察',
  cheapestLabel: '最便宜的真实验证',
  planLabel: '90 天落地动作',
  exportBtn: '导出决策结论 JSONL（SFT）',
  exportSys: '你是一个商业决策助手，基于市场调研与客户投票，给出最该采用的方案与理由。',
  exportSituation: (situation, problem, audience, scope) =>
    `处境：${situation}\n要决策：${problem}\n客户群体：${audience}（${scope}）\n`,
  exportSolutions: (list) => `\n候选方案：\n${list}\n`,
  exportVote: (summary) => `\n客户投票：${summary}\n`,
  exportDecision: (title, decisiveness) => `决策：采用「${title}」（${decisiveness}）\n`,
  exportReason: (r) => `理由：${r}\n`,
  exportTradeoff: (t) => `代价：${t}\n`,
  exportCheapest: (e) => `最便宜的验证：${e}\n`,
  exportPlan: (p) => `90天计划：${p}`,
}

const en: Dict = {
  tagline: 'Let AI play your customers and vote for the business decision you should actually make',
  intro1: 'Describe your situation and the problem, give a few options (or let AI draft them); the engine runs a round of',
  marketResearch: 'market research',
  intro2: ', spins up a panel of imagined',
  customerVote: 'customers who vote',
  intro3: ', and picks the',
  introEmph: ' smartest next move for you.',
  langToggle: '中',
  situationLabel: 'Your situation',
  situationPlaceholder: 'e.g. We run a regional bubble-tea chain; stores still growing but repeat orders and ticket size are sliding…',
  problemLabel: 'The decision / problem',
  problemPlaceholder: 'e.g. Where should this quarter’s limited budget go for growth?',
  solutionsLabel: 'Candidate solutions',
  solutionsHint: 'At least 2 options; customers score each and pick one. Fill them in, or let AI draft them.',
  solutionTitlePlaceholder: 'Option name (e.g. Cut prices for volume)',
  solutionDetailPlaceholder: 'One line on what this option actually does (optional)',
  addSolution: 'Add an option',
  removeSolution: 'Remove',
  genSolutions: 'AI draft options',
  genningSolutions: 'Drafting…',
  genCountTitle: 'Draft how many (1-5)',
  optionLetter: (i) => String.fromCharCode(65 + i),
  audienceLabel: 'Audience',
  audiencePlaceholder: 'e.g. Urban white-collar workers and students, ages 18-30',
  scopeLabel: 'Market scope',
  icpLabel: 'Ideal-customer hints (optional)',
  icpPlaceholder: 'e.g. heavy delivery users, social-media native, collab-sensitive',
  sampleLabel: 'Try an example',
  sampleChip: 'Bubble-tea chain · growth call',
  sample: {
    situation:
      'We run a regional bubble-tea chain with 40 stores. Over the past year the store count kept growing, but per-store repeat orders and average ticket are both sliding, with margins squeezed by delivery subsidies and rising ingredient costs.',
    problem: 'Where should this quarter’s limited budget go to drive growth?',
    solutions: [
      { title: 'Cut prices for volume', detail: 'Drop signature drinks 20-30% and chase order volume + exposure on delivery apps' },
      { title: 'Launch a premium collab', detail: 'Release a higher-priced line co-branded with a local IP, built for in-store check-ins and social sharing' },
      { title: 'Membership subscription', detail: 'Offer a monthly pass that locks in repeat orders from frequent users for steadier cash flow' },
    ],
    audience: 'Urban white-collar workers and students aged 18-30; price-sensitive but happy to pay for social currency',
    scope: 'china',
    icpHints: 'heavy delivery users, social-media native, sensitive to collabs and limited editions',
  },
  panelLabel: (n) => `Voting customers: ${n}`,
  modelLabel: 'Reasoning model (DeepSeek)',
  kbLabel: 'Knowledge base (RAG · optional)',
  kbPlaceholder: 'Paste document text, or enter a URL',
  kbAdd: 'Add',
  kbAdding: 'Processing…',
  kbEmpty: 'Add operating data, competitor research or surveys as highest-trust (internal) evidence.',
  kbChunks: (n) => `${n} chunks`,
  kbClear: 'Clear',
  kbBadge: 'Knowledge base attached',
  kbErrEmpty: 'Paste some text or enter a URL first',
  kbErrFail: 'Failed to add to the knowledge base',
  runBtn: 'Run the vote',
  runningBtn: 'Running…',
  errFill: 'Please fill in your situation and the problem',
  errSolutions: 'Please give at least 2 candidate solutions (AI can draft them)',
  errRun: 'Run failed',
  errGen: 'Drafting options failed',
  errMaxSolutions: 'You can store up to 10 solutions; remove some first',
  scope: { china: 'China', global: 'Global', overseas: 'Overseas' },
  modelHint: { 'deepseek-v4-flash': 'Faster · recommended', 'deepseek-v4-pro': 'More detailed · slower' },
  stageGround: 'Market research',
  stagePanel: 'Customer vote',
  stageJudge: 'Final decision',
  empty1: 'Describe your situation, write the problem and give a few options on the left to start a vote.',
  empty2: 'Market research → imagined customers score and vote → the judge picks the smartest move, then export fine-tuning JSONL.',
  researchTitle: 'Market research',
  researchSub: 'Is the market a tailwind or headwind for solving this?',
  confidence: 'confidence',
  sourceReliability: 'Source reliability',
  climate: { tailwind: 'Tailwind', mixed: 'Mixed', headwind: 'Headwind' },
  lens: { competitor: 'Competitor', trend: 'Trend', market: 'Market', risk: 'Risk' },
  voteTitle: 'Customer vote',
  voteSub: (n) => `${n} imagined customers scored and voted independently (after reading the research)`,
  winnerBadge: 'Customer favourite',
  votesLabel: 'first-choice votes',
  meanLabel: 'mean',
  agentsToggle: (n) => `Show all ${n} customer votes`,
  agentPick: 'picked',
  decisionTitle: 'Final decision',
  decisionSub: 'Turning the vote into the best move for the business',
  recommendLabel: 'Recommended move',
  decisiveness: { clear: 'Decisive', narrow: 'Narrow win', split: 'Split' },
  tradeoffLabel: 'The trade-off you accept',
  runnerUpLabel: 'Worth keeping on the table',
  cheapestLabel: 'Cheapest real test',
  planLabel: '90-day action plan',
  exportBtn: 'Export decision as JSONL (SFT)',
  exportSys: 'You are a business-decision assistant. Given market research and a customer vote, recommend the move to make and why.',
  exportSituation: (situation, problem, audience, scope) =>
    `Situation: ${situation}\nDecision: ${problem}\nAudience: ${audience} (${scope})\n`,
  exportSolutions: (list) => `\nCandidate options:\n${list}\n`,
  exportVote: (summary) => `\nCustomer vote: ${summary}\n`,
  exportDecision: (title, decisiveness) => `Decision: go with "${title}" (${decisiveness})\n`,
  exportReason: (r) => `Rationale: ${r}\n`,
  exportTradeoff: (t) => `Trade-off: ${t}\n`,
  exportCheapest: (e) => `Cheapest test: ${e}\n`,
  exportPlan: (p) => `90-day plan: ${p}`,
}

export const STRINGS: Record<Lang, Dict> = { zh, en }

// The instruction appended to every LLM prompt to fix its output language.
export function langInstruction(lang: Lang): string {
  return lang === 'en'
    ? 'Respond entirely in English. All generated fields must be in natural English.'
    : '全部用中文输出。'
}
