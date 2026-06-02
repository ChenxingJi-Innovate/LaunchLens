// LaunchLens bilingual strings (中文 default, English toggle) per workspace house style.
// UI strings live here; the `lang` is also sent to the API so the LLM output language matches.
import type { DeepSeekModel, MarketScope, EvidenceBundle, Verdict } from './types'

export type Lang = 'zh' | 'en'

export interface Dict {
  // header
  tagline: string
  intro1: string
  marketIntel: string
  intro2: string
  synthPanel: string
  intro3: string
  introEmph: string
  langToggle: string // label shown on the toggle to switch to the OTHER language
  // input
  ideaLabel: string
  ideaPlaceholder: string
  marketLabel: string
  marketPlaceholder: string
  scopeLabel: string
  icpLabel: string
  icpPlaceholder: string
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
  runBtn: string
  runningBtn: string
  errFill: string
  errRun: string
  scope: Record<MarketScope, string>
  modelHint: Record<DeepSeekModel, string>
  // stage rail
  stageGround: string
  stagePanel: string
  stageJudge: string
  // empty
  empty1: string
  empty2: string
  // supply card
  supplyTitle: string
  supplySub: string
  confidence: string
  sourceReliability: string
  supplyVerdict: Record<EvidenceBundle['supplyVerdict'], string>
  lens: Record<'competitor' | 'trend' | 'market' | 'risk', string>
  // demand card
  demandTitle: string
  demandSub: (n: number) => string
  statMean: string
  statPos: string
  statNeg: string
  segTitle: string
  objTitle: string
  personaToggle: (n: number) => string
  // verdict card
  verdictTitle: string
  verdictSub: string
  call: Record<Verdict['call'], string>
  contradictionLabel: string
  cheapestLabel: string
  planLabel: string
  exportBtn: string
  // export payload
  exportSys: string
  exportIdea: (idea: string, market: string, scope: string) => string
  exportMarket: (read: string, v: string) => string
  exportDemand: (mean: number, pos: number, obj: string) => string
  exportConclusion: (call: string) => string
  exportReason: (r: string) => string
  exportConflict: (c: string) => string
  exportCheapest: (e: string) => string
  exportPlan: (p: string) => string
}

const zh: Dict = {
  tagline: '市场视角 + 用户视角，上线前一次看清你的产品想法',
  intro1: '供给侧的',
  marketIntel: '市场情报',
  intro2: '（StratSquad 式）与需求侧的',
  synthPanel: '合成客群',
  intro3: '（TinyTroupe 式）合并为一个判断：',
  introEmph: ' 这个产品到底该不该做。',
  langToggle: 'EN',
  ideaLabel: '产品想法 (Idea)',
  ideaPlaceholder: '例：面向东南亚学生的轻量 AI 错题本 App',
  marketLabel: '目标市场 (Market)',
  marketPlaceholder: '例：东南亚 K12 学生与家长',
  scopeLabel: '市场范围 (Scope)',
  icpLabel: '目标客户线索 (可选)',
  icpPlaceholder: '例：价格敏感、重度使用短视频',
  panelLabel: (n) => `合成客群规模：${n} 人`,
  modelLabel: '推理模型 (DeepSeek)',
  kbLabel: '知识库 (RAG · 可选)',
  kbPlaceholder: '粘贴文档文本，或输入网址 URL',
  kbAdd: '添加',
  kbAdding: '处理中…',
  kbEmpty: '上传产品文档、竞品资料或调研，作为最高可信(internal)证据接入。',
  kbChunks: (n) => `${n} 段`,
  kbClear: '清空',
  kbBadge: '已挂载知识库',
  runBtn: '开始验证',
  runningBtn: '验证中…',
  errFill: '请填写产品想法和目标市场',
  errRun: '运行失败',
  scope: { china: '中国', global: '全球', overseas: '海外' },
  modelHint: { 'deepseek-v4-flash': '更快 · 推荐', 'deepseek-v4-pro': '更细致 · 较慢' },
  stageGround: '供给侧 · 市场情报',
  stagePanel: '需求侧 · 合成客群',
  stageJudge: '仲裁 · 最终结论',
  empty1: '填写左侧产品想法，开始一次端到端验证。',
  empty2: '市场情报 → 合成客群打分 → 矛盾仲裁，最后导出可用于微调的 JSONL。',
  supplyTitle: '供给侧 · 市场情报',
  supplySub: '市场在朝这个方向走吗？',
  confidence: '信心',
  sourceReliability: '来源可靠度',
  supplyVerdict: { tailwind: '市场顺风', mixed: '喜忧参半', headwind: '市场逆风' },
  lens: { competitor: '竞争', trend: '趋势', market: '市场', risk: '风险' },
  demandTitle: '需求侧 · 合成客群',
  demandSub: (n) => `${n} 位潜在客户独立打分（已读市场证据）`,
  statMean: '采用倾向均值',
  statPos: '正面 (4-5星)',
  statNeg: '负面 (1-2星)',
  segTitle: '分细分市场',
  objTitle: '主要反对意见',
  personaToggle: (n) => `展开 ${n} 位 persona 的逐条回答`,
  verdictTitle: '矛盾仲裁 · 最终结论',
  verdictSub: '供给与需求是否一致？',
  call: { validated: '值得做 · Validated', conditional: '有条件做 · Conditional', kill: '不建议做 · Kill' },
  contradictionLabel: '供需冲突',
  cheapestLabel: '最便宜的真实验证',
  planLabel: '90 天落地动作',
  exportBtn: '导出验证结论 JSONL（SFT）',
  exportSys: '你是一个产品想法验证助手，基于供给侧市场情报与需求侧客群反馈，给出验证结论。',
  exportIdea: (idea, market, scope) => `产品想法：${idea}\n目标市场：${market}（${scope}）\n`,
  exportMarket: (read, v) => `\n市场判断：${read}（供给侧：${v}）\n`,
  exportDemand: (mean, pos, obj) => `需求侧：均值${mean}/5，正面${pos}%，主要反对：${obj}`,
  exportConclusion: (call) => `结论：${call}\n`,
  exportReason: (r) => `理由：${r}\n`,
  exportConflict: (c) => `供需冲突：${c}\n`,
  exportCheapest: (e) => `最便宜的验证：${e}\n`,
  exportPlan: (p) => `90天计划：${p}`,
}

const en: Dict = {
  tagline: 'Two lenses, market and customer, to see your product idea clearly before you build',
  intro1: 'Supply-side ',
  marketIntel: 'market intelligence',
  intro2: ' (StratSquad-style) fused with a demand-side ',
  synthPanel: 'synthetic customer panel',
  intro3: ' (TinyTroupe-style) into one call:',
  introEmph: ' should you build this product?',
  langToggle: '中',
  ideaLabel: 'Product idea',
  ideaPlaceholder: 'e.g. A lightweight AI mistake-notebook app for SEA students',
  marketLabel: 'Target market',
  marketPlaceholder: 'e.g. K12 students and parents in Southeast Asia',
  scopeLabel: 'Market scope',
  icpLabel: 'Ideal-customer hints (optional)',
  icpPlaceholder: 'e.g. price-sensitive, heavy short-video users',
  panelLabel: (n) => `Panel size: ${n} people`,
  modelLabel: 'Reasoning model (DeepSeek)',
  kbLabel: 'Knowledge base (RAG · optional)',
  kbPlaceholder: 'Paste document text, or enter a URL',
  kbAdd: 'Add',
  kbAdding: 'Processing…',
  kbEmpty: 'Add product docs, competitor research or surveys as highest-trust (internal) evidence.',
  kbChunks: (n) => `${n} chunks`,
  kbClear: 'Clear',
  kbBadge: 'Knowledge base attached',
  runBtn: 'Validate',
  runningBtn: 'Validating…',
  errFill: 'Please fill in the product idea and target market',
  errRun: 'Run failed',
  scope: { china: 'China', global: 'Global', overseas: 'Overseas' },
  modelHint: { 'deepseek-v4-flash': 'Faster · recommended', 'deepseek-v4-pro': 'More detailed · slower' },
  stageGround: 'Supply · Market intel',
  stagePanel: 'Demand · Synthetic panel',
  stageJudge: 'Verdict · Final call',
  empty1: 'Fill in your product idea on the left to run an end-to-end validation.',
  empty2: 'Market intel → synthetic panel scoring → contradiction verdict → export fine-tuning JSONL.',
  supplyTitle: 'Supply · Market intelligence',
  supplySub: 'Is the market moving toward this?',
  confidence: 'confidence',
  sourceReliability: 'Source reliability',
  supplyVerdict: { tailwind: 'Tailwind', mixed: 'Mixed', headwind: 'Headwind' },
  lens: { competitor: 'Competitor', trend: 'Trend', market: 'Market', risk: 'Risk' },
  demandTitle: 'Demand · Synthetic panel',
  demandSub: (n) => `${n} potential customers scored independently (after reading the market evidence)`,
  statMean: 'Mean adoption',
  statPos: 'Positive (4-5★)',
  statNeg: 'Negative (1-2★)',
  segTitle: 'By segment',
  objTitle: 'Top objections',
  personaToggle: (n) => `Show all ${n} persona responses`,
  verdictTitle: 'Verdict · Final call',
  verdictSub: 'Do supply and demand agree?',
  call: { validated: 'Validated', conditional: 'Conditional', kill: 'Kill' },
  contradictionLabel: 'Supply-demand conflict',
  cheapestLabel: 'Cheapest real test',
  planLabel: '90-day action plan',
  exportBtn: 'Export verdict as JSONL (SFT)',
  exportSys: 'You are a product-idea validation assistant. Given supply-side market intelligence and demand-side customer feedback, deliver a validation verdict.',
  exportIdea: (idea, market, scope) => `Product idea: ${idea}\nTarget market: ${market} (${scope})\n`,
  exportMarket: (read, v) => `\nMarket read: ${read} (supply: ${v})\n`,
  exportDemand: (mean, pos, obj) => `Demand: mean ${mean}/5, positive ${pos}%, top objections: ${obj}`,
  exportConclusion: (call) => `Verdict: ${call}\n`,
  exportReason: (r) => `Rationale: ${r}\n`,
  exportConflict: (c) => `Conflict: ${c}\n`,
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
