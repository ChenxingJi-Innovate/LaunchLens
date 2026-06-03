// LaunchLens shared types.
// The product turns a business decision into a vote: the user describes a SITUATION and the
// PROBLEM they face, supplies (or asks the AI to generate) a few candidate SOLUTIONS, the engine
// runs a grounded MARKET RESEARCH pass, then spins up a panel of imagined CUSTOMER AGENTS who each
// score every solution and pick one. A decision judge tallies the vote into the single business
// move that makes the most sense.

// ---------- Models ----------
// DeepSeek model IDs verified live from GET https://api.deepseek.com/models
// (do not edit by memory; re-query the endpoint if DeepSeek adds tiers).

export type DeepSeekModel = 'deepseek-v4-flash' | 'deepseek-v4-pro'

export const MODELS: { id: DeepSeekModel; label: string; hint: string }[] = [
  { id: 'deepseek-v4-flash', label: 'V4 Flash', hint: '更快 · 推荐' },
  { id: 'deepseek-v4-pro', label: 'V4 Pro', hint: '更细致 · 较慢' },
]

export const DEFAULT_MODEL: DeepSeekModel = 'deepseek-v4-flash'

// ---------- User input ----------

export type MarketScope = 'china' | 'global' | 'overseas'

// One candidate move the customer panel will vote on. Ids are stable single letters
// (A, B, C, ...) assigned by index at run time so agents can reference a solution unambiguously.
export interface Solution {
  id: string // 'A' | 'B' | 'C' ... assigned at run time
  title: string // short label, e.g. "降价 30% 抢量"
  detail: string // 1-2 sentences describing what this move actually is
}

export interface DecisionInput {
  situation: string // where the business is right now (context)
  problem: string // the specific decision / problem being faced
  solutions: Solution[] // 2-5 candidate moves to vote on
  audience: string // who the customers are, free text e.g. "东南亚手游玩家"
  scope: MarketScope
  icpHints?: string // optional ideal-customer hints to steer who gets sampled
  panelSize: number // how many customer agents to simulate (default 12)
  model?: DeepSeekModel // which DeepSeek tier to run the whole pipeline on
  lang?: 'zh' | 'en' // output language for all generated content
}

// ---------- (Solutions) AI-suggested candidate moves ----------

export interface SolutionDraft {
  title: string
  detail: string
}

// ---------- (A) Research: grounded market read ----------

export type SourceTier =
  | 'internal' // from the user's own attached knowledge base (highest trust)
  | 'official'
  | 'academic'
  | 'industry'
  | 'community'
  | 'ugc'
  | 'unknown'

// One embedded slice of an attached knowledge-base document. Embedded once at
// ingest (/api/kb), stored client-side, passed back into /api/ground at run time.
export interface UserChunk {
  id: string
  text: string
  source: string // document title / filename / URL the chunk came from
  embedding: number[]
}

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
  climate: 'tailwind' | 'mixed' | 'headwind' // overall market climate for this problem space
  confidence: number // 0..1
}

// ---------- (B/C) Panel: customer agents vote on the solutions ----------

export interface SolutionScore {
  solutionId: string
  score: 1 | 2 | 3 | 4 | 5 // how well this move serves THIS customer (5 = would love it)
}

export interface AgentVote {
  name: string
  archetype: string // short label, e.g. "价格敏感的休闲玩家"
  segment: string // which customer segment this agent belongs to
  believability: number // 0..1, TinyPersonValidator-style coherence gate
  scores: SolutionScore[] // one score per solution
  pick: string // solutionId this agent would choose as best
  reasoning: string // first-person why they picked it, ideally citing the evidence
  objection: string // their biggest concern about that pick
}

// Server-side tally for one solution across the whole panel.
export interface SolutionTally {
  solutionId: string
  title: string
  firstChoiceVotes: number // how many agents picked this as their #1
  votePct: number // share of the panel that picked it #1
  meanScore: number // mean score this solution got across all agents (1..5)
  positivePct: number // share of agents scoring it 4-5
  bySegment: { segment: string; meanScore: number; firstChoiceVotes: number; n: number }[]
}

export interface PanelResult {
  agents: AgentVote[]
  tally: SolutionTally[] // sorted winner-first
  winnerId: string // solutionId with the most first-choice votes (vote winner)
  n: number // number of agents who voted
}

// ---------- (D) Decision: the judge that turns the vote into one move ----------

// How decisive the panel was — drives the headline tone and whether to hedge.
export type Decisiveness = 'clear' | 'narrow' | 'split'

export interface Verdict {
  recommendedId: string // the solution the judge recommends (usually the vote winner)
  decisiveness: Decisiveness
  rationale: string // why this is the best business move, naming the vote pattern
  runnerUpId: string | null // the close contender worth keeping on the table
  tradeoff: string | null // what you give up by choosing the recommended move
  cheapestExperiment: string // the single cheapest real test before committing
  ninetyDayPlan: { week: string; action: string; kpi: string }[]
}

// ---------- Export (SFT JSONL) ----------

export interface SftRecord {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
}
