# Customer Jury

> 让 AI 扮演你的客户，投票选出最该做的那个商业决策。
> A business decision tool: describe your situation and problem, give a few candidate solutions
> (or let AI draft them), and a panel of imagined customers votes for the smartest move.

You enter your **situation** and the **problem** you face, then supply a couple of candidate
**solutions** (or click *AI draft options*). Customer Jury then:

1. runs a grounded **market research** pass — four analyst lenses (competitor / trend / market /
   risk) with source-credibility tiering (the StratSquad half);
2. generates a panel of imagined **customer agents** who each read that research, score every
   solution 1-5 and **vote** for the one they want (the TinyTroupe half);
3. a **decision judge** tallies the vote into the single business move that makes the most sense —
   recommending the vote winner, or overriding to the runner-up when the market makes the winner a
   bad call (and saying why).

The combining move: **every customer reads the market research before voting**, so the vote is
grounded in the real market read instead of imagined in a vacuum.

## Pipeline

```
Solutions (optional AI draft)  →  Research (market evidence)  →  Vote (customer agents score + pick)  →  Decision (judge) →  Export JSONL
```

## Run

```bash
npm install
cp .env.example .env.local   # set DEEPSEEK_API_KEY
npm run dev                   # http://localhost:3002
```

See [CONCEPT.md](./CONCEPT.md) for the full rationale and [CLAUDE.md](./CLAUDE.md) for the file map
and conventions.
