# Quorum

> 让市场与用户共同为你的产品想法投票。
> Product idea validation for PMs: a grounded market read (supply) fused with a synthetic
> customer panel (demand), reconciled by a contradiction meta-judge.

Quorum combines the good ideas from two projects:

- **StratSquad** (supply side) — grounded market intelligence: four analyst lenses
  (competitor / trend / market / risk) and source-credibility tiering.
- **TinyTroupe** (demand side) — a synthetic customer population that rates adoption propensity.

The combining move: **every synthetic customer reads the supply-side evidence before answering**,
so the demand signal is grounded in the real market read instead of imagined in a vacuum. A
net-new **contradiction meta-judge** then forces one honest call when the two sides disagree.

## Pipeline

```
Ground (supply evidence)  →  Panel (grounded customer survey)  →  Verdict (meta-judge)  →  Export JSONL
```

## Run

```bash
npm install
cp .env.example .env.local   # set DEEPSEEK_API_KEY
npm run dev                   # http://localhost:3002
```

See [CONCEPT.md](./CONCEPT.md) for the full rationale and [CLAUDE.md](./CLAUDE.md) for the file map
and conventions.
