# Customer Jury

> Business decision-making tool. The user describes a SITUATION and the PROBLEM they face, supplies
> (or asks the AI to draft) a few candidate SOLUTIONS; the engine runs a grounded MARKET RESEARCH
> pass, spins up a panel of imagined CUSTOMER AGENTS who each score every solution and vote for one,
> then a decision judge tallies the vote into the single business move that makes the most sense.

See parent workspace `../CLAUDE.md` for shared context, glossary, and house style (no dashes, etc.),
and `./CONCEPT.md` for the full product rationale and the two source projects it borrows from.

The pipeline is adapted from the prior "validate one product idea" version: same StratSquad-grounded
research half and TinyTroupe-style customer half, but the demand side now COMPARES several solutions
(scores each + first-choice vote) instead of rating one idea, and the meta-judge picks a winning move
instead of returning validated/conditional/kill.

## Pipeline

0. **Knowledge base** (`/api/kb`, optional) — paste text or a URL. The doc is chunked + embedded
   (SiliconFlow) into `UserChunk[]` and kept client-side (localStorage `ll-kb`). At run time the
   chunks ride into `/api/ground` and are retrieved via `lib/rag.ts` (cosine → BGE rerank), then
   injected as highest-trust `internal` evidence. Degrades gracefully: if embeddings are
   unavailable (no SiliconFlow balance), ingest stores raw text and retrieval falls back to bigram
   keyword overlap, so the KB still grounds the analysis.
1. **Solutions** (`/api/solutions`, optional pre-step) — when the user has a situation + problem but
   no candidate moves, drafts ~3 strategically-different options (price / positioning / channel …)
   for the panel to vote on. The user can edit/add/remove before running.
2. **Ground / Research** (`/api/ground`) — reasons four StratSquad lenses (competitor / trend /
   market / risk) over the situation + problem + candidate solutions into an `EvidenceBundle`
   (`climate`: tailwind/mixed/headwind + confidence), tiers every cited source by credibility
   (clamped per tier band), KB chunks prepended as `internal` sources. Optionally enriched with live
   data if `STRATSQUAD_BACKEND_URL` is set.
3. **Panel / Vote** (`/api/panel`) — TinyPersonFactory plans N diverse customer personas from the
   research; each then votes on its OWN independent call: scores EVERY solution 1-5, picks the one
   move it would choose, gives first-person reasoning + one objection. Believability-gated. The
   server computes the `SolutionTally` (first-choice votes, mean score, per-segment splits) and the
   vote `winnerId` — one source of truth for the UI and judge.
4. **Verdict / Decision** (`/api/verdict`) — the decision judge. Normally recommends the vote
   winner, but may override to the runner-up when the market climate/risk makes the winner a bad
   business move (and must justify the override). Returns `recommendedId` + `decisiveness`
   (clear/narrow/split) + the trade-off + runner-up + cheapest real experiment + 90-day plan.
5. **Export** — client-side JSONL download (SFT schema) of the decision conclusion.

## The one idea that matters

Every customer agent reads the `EvidenceBundle` before voting (see `evidenceToMarkdown` in
`app/api/panel/route.ts`). That grounding is what separates Customer Jury from "a focus group in a vacuum".
It is the seam where the StratSquad (research) and TinyTroupe (panel) halves join.

## File layout

```
app/
├── layout.tsx              root layout
├── page.tsx                single-page client app: input → Research → Vote → Decision → export
├── globals.css             tailwind + off-white body
└── api/
    ├── kb/route.ts         knowledge-base ingest: text/URL → chunk → embed → UserChunk[]
    ├── solutions/route.ts  optional: draft strategically-different candidate solutions
    ├── ground/route.ts     market research → EvidenceBundle (RAG retrieval + optional live StratSquad)
    ├── panel/route.ts      customer agents score every solution + vote → server-side SolutionTally
    └── verdict/route.ts    decision judge → recommended move + decisiveness + 90-day plan
lib/
├── types.ts                all shared types (the data contract between stages)
├── i18n.ts                 zh/en UI dictionary + langInstruction() for LLM output
├── rag.ts                  embed / chunk / cosine + bigram-fallback retrieve / rerank / fetch URL
└── llm.ts                  DeepSeek client, runJson<T> helper, reliability clamping
```

## Key conventions

- All LLM calls server-side in `app/api/*/route.ts` via `lib/llm.ts`. Never call from client.
- DeepSeek models are user-selectable per run. The list lives in `MODELS` in `lib/types.ts`
  (verified live from `GET https://api.deepseek.com/models` — do not edit by memory). The UI picker
  sets `DecisionInput.model`; each route passes `resolveModel(input.model)` (validates + falls back to
  `DEFAULT_MODEL`) into `runJson`. `deepseek-v4-flash` is the default; `deepseek-v4-pro` is the
  stronger but much slower tier (~250s for a single stage observed locally).
- Deployment note: a full Pro-tier run can take several minutes. On Vercel, set `maxDuration` on the
  route handlers (and a paid plan) or the function will time out; Flash is fine on default limits.
- Routes return JSON; errors as plain-text non-200. JSON mode via `response_format`.
- Solution ids are single letters (A, B, C…) assigned by index at run time in `assembleSolutions()`
  (page.tsx); agents reference solutions by id, and the `SolutionTally` carries the id + title so
  result cards map ids → titles without re-deriving. Panel coerces every agent to score all known
  ids (missing → 3) and validates `pick` against the id set; verdict validates `recommendedId` /
  `runnerUpId`, falling back to the vote winner.
- The `SolutionTally` + `winnerId` are computed in `/api/panel` (one source of truth), not re-derived
  in the UI.
- Bilingual zh/en. All UI copy lives in `STRINGS` in `lib/i18n.ts` (中文 default); the header
  toggle persists the choice to `localStorage('ll-lang')`. The chosen `lang` is sent in
  `DecisionInput.lang`, and each route appends `langInstruction(lang)` so LLM-generated text matches.
  Enum fields (`climate`, `lens`, `decisiveness`) stay English keys regardless of language and are
  rendered via the dictionary, so the UI mapping never breaks. Gestalt + HIG tokens from
  `tailwind.config.ts` (mirrors StyleForge). No dashes.
- Dev server runs on port 3002 (StyleForge 3000, SQLForge 3001).

## Run

```bash
npm install
cp .env.example .env.local   # set DEEPSEEK_API_KEY
npm run dev                   # http://localhost:3002
```

## Not yet built (next slices)

- SSE streaming of the pipeline (currently four blocking calls: solutions optional + ground/panel/verdict)
- Empirical calibration: upload a real survey → t-test/KS badge vs the synthetic vote
- Vision modality: customer agents react to an uploaded mockup of each solution
- MCP tools (`run_decision`, `draft_solutions`) + DPO pairwise solution-A-vs-B export
- Real live wiring to the StratSquad backend (the `fetchLiveEvidence` hook is a stub-ready seam)
