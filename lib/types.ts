// LaunchLens shared types.
// The product fuses a SUPPLY-side read (StratSquad-style grounded market intelligence)
// with a DEMAND-side simulation (TinyTroupe-style synthetic customer panel), then forces
// one honest verdict through a contradiction meta-judge.

// ---------- Models ----------
// DeepSeek model IDs verified live from GET https://api.deepseek.com/models
// (do not edit by memory; re-query the endpoint if DeepSeek adds tiers).

export type DeepSeekModel = 'deepseek-v4-flash' | 'deepseek-v4-pro'

export const MODELS: { id: DeepSeekModel; label: string; hint: string }[] = [
  { id: 'deepseek-v4-flash', label: 'V4 Flash', hint: '更快 · 推荐' },
  { id: 'deepseek-v4-pro', label: 'V4 Pro', hint: '更细致 · 较慢' },
]

export const DEFAULT_MODEL: DeepSeekModel = 'deepseek-v4-flash'

// ---------- PM input ----------

export type MarketScope = 'china' | 'global' | 'overseas'

export interface IdeaInput {
  idea: string // one-line product idea
  market: string // free-text target market, e.g. "东南亚手游玩家"
  scope: MarketScope
  icpHints?: string // optional ideal-customer hints to steer audience sampling
  panelSize: number // how many synthetic customers to simulate (default 12)
  model?: DeepSeekModel // which DeepSeek tier to run the whole pipeline on
}

// ---------- (A) Ground: supply-side evidence ----------

export type SourceTier =
  | 'official'
  | 'academic'
  | 'industry'
  | 'community'
  | 'ugc'
  | 'unknown'

export interface EvidenceSource {
  claim: string // the factual claim being credited
  origin: string // where it comes from (platform / report / outlet)
  tier: SourceTier
  reliability: number // 0..1, clamped per tier band
}

// One angle of the market read, mirroring StratSquad's four expert lenses.
export interface ExpertRead {
  lens: 'competitor' | 'trend' | 'market' | 'risk'
  headline: string
  bullets: string[]
}

export interface EvidenceBundle {
  marketRead: string // 2-3 sentence synthesis of where the market is moving
  experts: ExpertRead[]
  sources: EvidenceSource[]
  supplyVerdict: 'tailwind' | 'mixed' | 'headwind' // is the market moving toward this?
  supplyConfidence: number // 0..1
}

// ---------- (B/C) Panel: demand-side synthetic customers ----------

export interface PersonaResponse {
  name: string
  archetype: string // short label, e.g. "价格敏感的休闲玩家"
  segment: string // which market segment this persona belongs to
  believability: number // 0..1, TinyPersonValidator-style coherence gate
  score: 1 | 2 | 3 | 4 | 5 // purchase / adoption propensity
  justification: string // why, ideally citing the grounded evidence
  objection: string // single biggest reason they would NOT buy
}

export interface PanelResult {
  responses: PersonaResponse[]
  // demand stats derived server-side so the UI and verdict agree on one source of truth
  stats: DemandStats
}

export interface DemandStats {
  n: number
  mean: number // mean propensity 1..5
  positivePct: number // share scoring 4-5
  neutralPct: number // share scoring 3
  negativePct: number // share scoring 1-2
  histogram: Record<'1' | '2' | '3' | '4' | '5', number>
  topObjections: { objection: string; count: number }[]
  bySegment: { segment: string; mean: number; positivePct: number; n: number }[]
}

// ---------- (D) Verdict: contradiction meta-judge ----------

export type FinalCall = 'validated' | 'conditional' | 'kill'

export interface Verdict {
  call: FinalCall
  rationale: string // why this call, naming the supply/demand agreement or clash
  contradiction: string | null // the specific supply-vs-demand clash, if any
  cheapestExperiment: string // the single cheapest real test that would resolve doubt
  ninetyDayPlan: { week: string; action: string; kpi: string }[]
}

// ---------- Export (SFT/DPO JSONL) ----------

export interface SftRecord {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
}
