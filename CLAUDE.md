# Quorum

> Product idea validation for PMs. Fuses a SUPPLY-side market read (StratSquad-style grounded
> intelligence) with a DEMAND-side synthetic customer panel (TinyTroupe-style simulation), then
> forces one honest verdict through a contradiction meta-judge.

See parent workspace `../CLAUDE.md` for shared context, glossary, and house style (no dashes, etc.),
and `./CONCEPT.md` for the full product rationale and the two source projects it borrows from.

## Pipeline

1. **Ground** (`/api/ground`) — supply side. Reasons four StratSquad lenses (competitor / trend /
   market / risk) into an `EvidenceBundle`, tiers every cited source by credibility (clamped per
   tier band). Optionally enriched with live data if `STRATSQUAD_BACKEND_URL` is set.
2. **Panel** (`/api/panel`) — demand side. Generates N synthetic customer personas that each read
   the evidence bundle, then privately rate adoption propensity 1-5 with a justification and one
   objection. Believability-gated (TinyPersonValidator-style). Demand stats computed server-side.
3. **Verdict** (`/api/verdict`) — the contradiction meta-judge (net-new, in neither source project).
   Compares the supply verdict against the demand signal, surfaces any clash, returns a final call
   (validated / conditional / kill) + the cheapest real experiment + a 90-day plan.
4. **Export** — client-side JSONL download (SFT schema) of the validation conclusion.

## The one idea that matters

Every persona reads the supply-side `EvidenceBundle` before answering (see `evidenceToMarkdown` in
`app/api/panel/route.ts`). That grounding is what separates Quorum from "a focus group in a vacuum".
It is the seam where StratSquad and TinyTroupe join.

## File layout

```
app/
├── layout.tsx              root layout
├── page.tsx                single-page client app: input → Ground → Panel → Verdict → export
├── globals.css             tailwind + off-white body
└── api/
    ├── ground/route.ts     supply-side evidence bundle (+ optional live StratSquad enrich)
    ├── panel/route.ts      demand-side grounded persona survey + server-side DemandStats
    └── verdict/route.ts    contradiction meta-judge → final call + 90-day plan
lib/
├── types.ts                all shared types (the data contract between stages)
└── llm.ts                  DeepSeek client, runJson<T> helper, reliability clamping
```

## Key conventions

- All LLM calls server-side in `app/api/*/route.ts` via `lib/llm.ts`. Never call from client.
- Model ID `deepseek-v4-flash` is the constant `MODEL` in `lib/llm.ts`. Change in one place.
- Routes return JSON; errors as plain-text non-200. JSON mode via `response_format`.
- DemandStats are computed in the route (one source of truth), not re-derived in the UI.
- UI strings 中文; Gestalt + HIG tokens from `tailwind.config.ts` (mirrors StyleForge). No dashes.
- Dev server runs on port 3002 (StyleForge 3000, SQLForge 3001).

## Run

```bash
npm install
cp .env.example .env.local   # set DEEPSEEK_API_KEY
npm run dev                   # http://localhost:3002
```

## Not yet built (next slices, see CONCEPT.md §8)

- SSE streaming of the pipeline (currently three blocking calls)
- Empirical calibration: upload a real survey → t-test/KS badge vs synthetic demand
- Vision modality: personas react to an uploaded product mockup image
- MCP tools (`validate_idea`, `simulate_panel`) + DPO pairwise idea-A-vs-B export
- Real live wiring to the StratSquad backend (the `fetchLiveEvidence` hook is a stub-ready seam)
