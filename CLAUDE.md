# LaunchLens

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
`app/api/panel/route.ts`). That grounding is what separates LaunchLens from "a focus group in a vacuum".
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
- DeepSeek models are user-selectable per run. The list lives in `MODELS` in `lib/types.ts`
  (verified live from `GET https://api.deepseek.com/models` — do not edit by memory). The UI picker
  sets `IdeaInput.model`; each route passes `resolveModel(input.model)` (validates + falls back to
  `DEFAULT_MODEL`) into `runJson`. `deepseek-v4-flash` is the default; `deepseek-v4-pro` is the
  stronger but much slower tier (~250s for a single stage observed locally).
- Deployment note: a full Pro-tier run can take several minutes. On Vercel, set `maxDuration` on the
  route handlers (and a paid plan) or the function will time out; Flash is fine on default limits.
- Routes return JSON; errors as plain-text non-200. JSON mode via `response_format`.
- DemandStats are computed in the route (one source of truth), not re-derived in the UI.
- Bilingual zh/en. All UI copy lives in `STRINGS` in `lib/i18n.ts` (中文 default); the header
  toggle persists the choice to `localStorage('ll-lang')`. The chosen `lang` is sent in
  `IdeaInput.lang`, and each route appends `langInstruction(lang)` so LLM-generated text matches.
  Enum fields (`supplyVerdict`, `lens`, `call`) stay English keys regardless of language and are
  rendered via the dictionary, so the UI mapping never breaks. Gestalt + HIG tokens from
  `tailwind.config.ts` (mirrors StyleForge). No dashes.
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
