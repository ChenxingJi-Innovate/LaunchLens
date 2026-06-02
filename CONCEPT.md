# LaunchLens — Product Idea Validation Platform for PMs

A sibling project that fuses **StratSquad** (grounded supply-side market intelligence) with
**TinyTroupe** (synthetic demand-side customer simulation) into one decision: *should we
build this product?*

> Author context: Ji Chenxing. Same house pipeline as StyleForge / SQLForge / AestheticForge:
> `Reference/Schema → Profile Extraction → Generation → Rating → Export`.
> UI strings 中文 by default; visual standards per workspace DESIGN.md. No dashes in prose.

---

## 1. The thesis

A product manager validating an idea needs two answers that today live in two different tools:

- **Is the market moving toward this?** (timing, competitors, category growth, regulation)
  → StratSquad already answers this with live trends + RAG + adversarially judged expert agents.
- **Would real customers actually buy / use this, and why not?** (demand, objections, willingness to pay)
  → TinyTroupe already answers this with a validated synthetic population + structured extraction.

Neither alone validates a product idea. StratSquad can say "the category is up 40% YoY" while the
actual buyers reject your specific take. TinyTroupe can report "62% would buy" while imagining a
market that no longer exists. **LaunchLens chains them: real evidence grounds the synthetic panel,
and one trust layer scores both halves.**

---

## 2. What we borrow from each (the good technical insights)

### From StratSquad (supply side, evidence)
1. **LangGraph DAG with a quality gate.** orchestrator → fan-out experts → `judge` (rubric:
   evidence .35 / logic .25 / actionability .30 / novelty .10, retry if < 60) → compose.
   Borrow the *judge-as-retry-gate* pattern wholesale.
2. **Hybrid RAG.** BGE-M3 dense (1024-dim) over a domain corpus + BGE-reranker-v2-m3 top-5,
   `retrieve_hybrid()`. Reuse the embeddings.json store + rerank fallback.
3. **Live trend dispatch.** `run_trend_planner()` picks sources by `market_scope`, then
   `asyncio.gather()` across connectors with graceful per-source degradation.
4. **Source-credibility tiering.** `source_judge` classifies every citation
   (internal/official/academic/industry/community/ugc) and weights claims by reliability 0-1.
5. **SSE streaming UX.** 16 event types render a live timeline. Keep it; PMs trust what they watch.
6. **MCP exposure.** Same `tools/core.py` powers both internal agents and external Claude Code.

### From TinyTroupe (demand side, imagination)
1. **`TinyPersonFactory.create_factory_from_demography()`** — plan-based sampling of a representative
   population from a demographic JSON, oversampling extremes for fringe objections.
2. **`TinyPersonValidator`** — 0-1 believability gate before a persona is allowed to vote.
3. **`TinyWorld`** with `broadcast_if_no_target` toggle — survey mode (private) vs focus-group mode
   (cross-talk). Both are PM-valuable: quant signal + qualitative "why."
4. **`ResultsExtractor`** — free-form agent reactions → tidy DataFrame
   (`fields=["name","response","justification"]`), then threshold via `is_there_a_good_market()`.
5. **`SimulationExperimentEmpiricalValidator`** — t-test / KS-test vs real survey data. This is the
   bridge that turns "vibes" into "calibrated."
6. **Vision modality** — agents react to a product mockup image, not just text.
7. **`GroundingConnector` (`BaseSemanticGroundingConnector`)** — the hook that lets a persona reason
   over external documents. **This is the seam where the two systems join.**
8. **Transactional cache** (`control.begin/checkpoint/end`) — cheap replay of expensive panels.

---

## 3. The combining move (the one idea that matters)

**Pipe StratSquad's evidence bundle into TinyTroupe's GroundingConnector.**

Before the synthetic panel reasons, StratSquad has already produced: RAG hits, a trend bundle (App
Store ranks, Steam/Twitch viewership, Google Trends), and a credibility-scored source set. We inject
that bundle as a `LocalFilesGroundingConnector` document set on every `TinyPerson`. Now each persona
answers "would you buy this?" *while aware of today's real alternatives and prices*, instead of
hallucinating a stale market. The persona's `justification` field then cites the grounded facts,
which the source-credibility layer can re-score.

This is the difference between "a focus group in a vacuum" and "a focus group that just read the
market report." It is one connector wiring, and it is the whole product.

---

## 4. End-to-end pipeline (mapped to the house pattern)

```
[PM input: idea one-liner + target market + optional mockup image + ICP hints]
        │
        ▼
(A) GROUND  ── StratSquad LangGraph ───────────────────────────────────────────
        orchestrator → retrieve_hybrid (RAG) + trend_dispatch (8 live sources)
        → competitor / trend / market / risk experts (ReAct + tools)
        → judge (rubric gate, retry once) → source_judge (credibility tiers)
        → evidence_bundle  { market read, competitors, pricing, credibility-scored sources }
        │
        ▼
(B) PROFILE ── derive the audience from the evidence ───────────────────────────
        LLM turns (market read + PM's ICP hints) into a demographic spec JSON
        → TinyPersonFactory.create_factory_from_demography(spec, N)
        → TinyPersonValidator gates each persona (drop below 0.7 confidence)
        │
        ▼
(C) SIMULATE ── TinyWorld, evidence-grounded ──────────────────────────────────
        attach evidence_bundle to every persona via GroundingConnector
        survey mode:      private 1-5 purchase-propensity + objection
        focus-group mode: broadcast=True, personas debate, rapporteur consolidates
        (optional) vision: personas react to the uploaded mockup image
        │
        ▼
(D) RATE / EXTRACT ── one trust layer over both halves ─────────────────────────
        ResultsExtractor → DataFrame (name, score 1-5, justification, cited sources)
        is_there_a_good_market() → go / pivot / kill, by segment
        SimulationExperimentEmpiricalValidator → if PM uploads any real survey,
            t-test/KS the synthetic vs real → calibration confidence badge
        LaunchLens meta-judge: cross-checks demand verdict against supply verdict,
            flags contradictions ("market up, but personas reject on price")
        │
        ▼
(E) EXPORT ──────────────────────────────────────────────────────────────────
        - PM deliverable: Validation Brief (StratSquad composer template) +
          demand histogram + top objections + 90-day experiment plan
        - SFT/DPO JSONL: (idea, evidence) → validation verdict pairs, and
          pairwise idea A vs idea B preference data (DPO), per the workspace export standard
```

---

## 5. The unified trust layer (why a PM should believe it)

LaunchLens's credibility is the product. Three stacked checks, each inherited:

| Check | Source | Guards against |
|---|---|---|
| Source-credibility tiering | StratSquad `source_judge` | Citing a Reddit rumor as fact |
| Judge rubric + retry gate | StratSquad `judge` | Weak / unactionable expert reasoning |
| Persona believability gate | TinyTroupe `TinyPersonValidator` | Incoherent synthetic respondents |
| Empirical validation (t/KS) | TinyTroupe `SimulationExperimentEmpiricalValidator` | Synthetic demand ≠ real demand |
| **Contradiction meta-judge** | **new** | Supply says yes, demand says no (or vice-versa) |

The contradiction meta-judge is the only net-new agent: it reads both verdicts and forces a single
honest call (validated / conditional / kill) plus the *cheapest real-world experiment* that would
resolve the disagreement.

---

## 6. Tech stack (workspace-consistent)

- **Frontend:** Next.js 14 App Router + Tailwind, SSE timeline (StratSquad's UI patterns),
  DESIGN.md tokens (Gestalt + HIG). 中文 default with zh/en toggle.
- **Supply backend:** reuse StratSquad's Python FastAPI + LangGraph + DeepSeek + SiliconFlow BGE.
- **Demand backend:** TinyTroupe library (Python), default model `gpt-5-mini` (or DeepSeek via the
  OpenAI-compatible client to unify keys). Vision via `VISION_*` env vars already in the workspace.
- **Bridge:** a thin adapter that serializes StratSquad's `evidence_bundle` into TinyTroupe
  `GroundingConnector` documents. This is the only new core code.
- **MCP:** expose `validate_idea`, `simulate_panel`, `ground_audience` alongside StratSquad's tools.
- **Env:** `DEEPSEEK_API_KEY`, `SILICONFLOW_API_KEY` (inherited), `VISION_API_KEY/BASE_URL/MODEL`,
  plus trend-source keys per StratSquad's registry. Keep `reference_launchlens_keys.md` in sync.

---

## 7. Why this is defensible / differentiated

- **vs. TinyTroupe alone:** grounded in live market evidence, so the synthetic demand is calibrated,
  not imagined. Adds the supply-side verdict TinyTroupe lacks entirely.
- **vs. StratSquad alone:** adds the customer voice (would *buyers* want *your* specific thing),
  segment-level demand curves, and willingness-to-pay objections StratSquad cannot produce.
- **vs. survey tools (e.g. real panels):** minutes and cents instead of weeks and thousands; lets a
  PM iterate the idea 20 times before spending on one real study, then validate the finalist for real.
- **The moat is the trust layer**: every claim is either grounded-and-tiered (supply) or
  validated-persona-and-empirically-checked (demand), with a contradiction gate forcing honesty.

---

## 8. Build order (thin vertical slices)

1. **Slice 1 — Bridge spike.** StratSquad evidence_bundle → TinyTroupe GroundingConnector →
   one grounded survey on a hardcoded idea. Prove the seam works end to end.
2. **Slice 2 — Audience from evidence.** Auto-derive demographic spec from the market read; validate
   personas; run survey + extract DataFrame + go/no-go.
3. **Slice 3 — Contradiction meta-judge + Validation Brief** (compose template, charts, 90-day plan).
4. **Slice 4 — Empirical calibration** (optional real-survey upload → t/KS badge).
5. **Slice 5 — UI** (SSE timeline, demand histogram, objection cards) + **Export** (PM brief + JSONL).
6. **Slice 6 — Vision** (mockup image reaction) + **MCP tools** + DPO pairwise idea comparison.
