'use client'

import { useEffect, useState } from 'react'
import {
  Activity, Users, Scale, Download, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Sparkles, Target, FlaskConical,
  CheckCircle2, CircleDot, Telescope, Languages,
  BookOpen, Plus, Trash2, FileText, Lightbulb,
} from 'lucide-react'
import type {
  EvidenceBundle, DecisionInput, MarketScope, PanelResult, AgentVote, Verdict,
  SftRecord, DeepSeekModel, UserChunk, Solution, SolutionDraft, SolutionTally,
} from '@/lib/types'
import { MODELS, DEFAULT_MODEL } from '@/lib/types'
import { STRINGS, type Dict, type Lang } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Customer Jury single-page app. A business decision turned into a customer vote:
//   (A) Research → grounded market read of the situation + solution space
//   (B/C) Panel  → imagined customers each score every solution and pick one
//   (D) Decision → the judge tallies the vote into the smartest move + export
// All visible copy comes from STRINGS[lang]; `lang` is also sent to the API so the
// LLM-generated content (research, customer reasoning, decision) matches the UI language.
// ---------------------------------------------------------------------------

type Stage = 'idle' | 'researching' | 'voting' | 'deciding' | 'done'

const SCOPE_VALUES: MarketScope[] = ['china', 'global', 'overseas']

const MAX_SOLUTIONS = 10 // most candidate solutions the list can hold
const MAX_GEN = 5 // most options AI drafts in a single click

// Style only (colour + icon); the human label is pulled from the dictionary per language.
const CLIMATE_STYLE: Record<EvidenceBundle['climate'], { cls: string; Icon: any }> = {
  tailwind: { cls: 'text-pushpin-450 bg-pushpin-50', Icon: TrendingUp },
  mixed: { cls: 'text-roboflow-600 bg-roboflow-100', Icon: Minus },
  headwind: { cls: 'text-roboflow-700 bg-roboflow-200', Icon: TrendingDown },
}

const DECISIVE_STYLE: Record<Verdict['decisiveness'], { cls: string; Icon: any }> = {
  clear: { cls: 'bg-pushpin-450 text-mochimalist', Icon: CheckCircle2 },
  narrow: { cls: 'bg-roboflow-700 text-mochimalist', Icon: CircleDot },
  split: { cls: 'bg-roboflow-800 text-mochimalist', Icon: AlertTriangle },
}

type SolutionDraftRow = { title: string; detail: string }

export default function Page() {
  const [lang, setLang] = useState<Lang>('zh')
  const t = STRINGS[lang]

  // restore language choice on mount; persist on change (avoids SSR hydration mismatch)
  useEffect(() => {
    const saved = window.localStorage.getItem('ll-lang')
    if (saved === 'zh' || saved === 'en') setLang(saved)
  }, [])
  function toggleLang() {
    const next: Lang = lang === 'zh' ? 'en' : 'zh'
    setLang(next)
    window.localStorage.setItem('ll-lang', next)
  }

  const [situation, setSituation] = useState('')
  const [problem, setProblem] = useState('')
  const [solutions, setSolutions] = useState<SolutionDraftRow[]>([
    { title: '', detail: '' },
    { title: '', detail: '' },
  ])
  const [audience, setAudience] = useState('')
  const [scope, setScope] = useState<MarketScope>('china')
  const [icpHints, setIcpHints] = useState('')
  const [panelSize, setPanelSize] = useState(12)
  const [model, setModel] = useState<DeepSeekModel>(DEFAULT_MODEL)
  const [genning, setGenning] = useState(false)
  const [genCount, setGenCount] = useState(3) // how many options AI drafts per click (1..MAX_GEN)
  const [genError, setGenError] = useState('') // shown right under the solutions editor, not far down by Run

  // knowledge base (RAG): chunks live client-side and are passed into /api/ground
  const [kbChunks, setKbChunks] = useState<UserChunk[]>([])
  const [kbInput, setKbInput] = useState('')
  const [kbAdding, setKbAdding] = useState(false)
  const [kbError, setKbError] = useState('') // shown right under the KB field, not far down by Run

  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')

  const [bundle, setBundle] = useState<EvidenceBundle | null>(null)
  const [liveUsed, setLiveUsed] = useState(false)
  const [panel, setPanel] = useState<PanelResult | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  // the solutions (with ids) that were actually sent into the run, so result cards map ids → titles
  const [solutionsRun, setSolutionsRun] = useState<Solution[]>([])

  const running = stage === 'researching' || stage === 'voting' || stage === 'deciding'

  // restore + persist the knowledge base (best-effort; embeddings can exceed quota)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('ll-kb')
      if (saved) setKbChunks(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])
  function persistKb(chunks: UserChunk[]) {
    try { window.localStorage.setItem('ll-kb', JSON.stringify(chunks)) } catch { /* over quota: keep in memory only */ }
  }
  async function addKb() {
    if (kbAdding) return
    const v = kbInput.trim()
    if (!v) { setKbError(t.kbErrEmpty); return } // give feedback instead of a dead disabled button
    setKbAdding(true); setKbError('')
    try {
      const isUrl = /^https?:\/\//i.test(v)
      const r = await post<{ chunks: UserChunk[]; source: string; count: number }>('/api/kb',
        isUrl ? { url: v } : { text: v })
      const next = [...kbChunks, ...r.chunks]
      setKbChunks(next); persistKb(next); setKbInput('')
    } catch (e: any) {
      setKbError(e?.message ?? t.kbErrFail)
    } finally {
      setKbAdding(false)
    }
  }
  function clearKb() {
    setKbChunks([]); persistKb([]); setKbError('')
  }

  // ----- solution editor helpers -----
  function setSolutionField(i: number, field: keyof SolutionDraftRow, value: string) {
    setSolutions((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }
  function addSolution() {
    setSolutions((prev) => (prev.length >= MAX_SOLUTIONS ? prev : [...prev, { title: '', detail: '' }]))
  }
  function removeSolution(i: number) {
    setSolutions((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  // one-click: fill the whole form with the localized sample case
  function fillSample() {
    setSituation(t.sample.situation)
    setProblem(t.sample.problem)
    setSolutions(t.sample.solutions.map((s) => ({ title: s.title, detail: s.detail })))
    setAudience(t.sample.audience)
    setScope(t.sample.scope)
    // intentionally do NOT prefill 目标客户线索 (icpHints): leave it for the user to add if they want
    setError(''); setGenError('')
  }

  // group chunks by source document for the chip list
  const kbSources = Array.from(
    kbChunks.reduce((m, c) => m.set(c.source, (m.get(c.source) ?? 0) + 1), new Map<string, number>())
  ).map(([source, count]) => ({ source, count }))

  async function post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.text()) || `${url} ${res.status}`)
    return res.json() as Promise<T>
  }

  // assign stable ids (A, B, C…) by index to the non-empty solutions
  function assembleSolutions(): Solution[] {
    return solutions
      .map((s) => ({ title: s.title.trim(), detail: s.detail.trim() }))
      .filter((s) => s.title)
      .map((s, i) => ({ id: String.fromCharCode(65 + i), ...s }))
  }

  async function genSolutions() {
    if (genning || running) return
    if (!situation.trim() || !problem.trim()) { setGenError(t.errFill); return }
    // how many we can still add without exceeding the 10-solution store
    const keptCount = solutions.filter((s) => s.title.trim() || s.detail.trim()).length
    const room = MAX_SOLUTIONS - keptCount
    if (room <= 0) { setGenError(t.errMaxSolutions); return }
    const count = Math.min(Math.max(1, Math.min(MAX_GEN, genCount || 1)), room)
    setGenning(true); setGenError('')
    try {
      const r = await post<{ solutions: SolutionDraft[] }>('/api/solutions', {
        situation, problem, audience, scope, icpHints, model, lang, count,
      })
      const added = r.solutions.map((s) => ({ title: s.title, detail: s.detail ?? '' }))
      // ADD to what the user already wrote, never replace it: keep every filled row, append the
      // drafts, drop only blank rows, and cap the total at MAX_SOLUTIONS.
      setSolutions((prev) => {
        const kept = prev.filter((s) => s.title.trim() || s.detail.trim())
        return [...kept, ...added].slice(0, MAX_SOLUTIONS)
      })
    } catch (e: any) {
      setGenError(e?.message ?? t.errGen)
    } finally {
      setGenning(false)
    }
  }

  async function run() {
    if (!situation.trim() || !problem.trim()) { setError(t.errFill); return }
    const sols = assembleSolutions()
    if (sols.length < 2) { setError(t.errSolutions); return }

    setError(''); setGenError('')
    setBundle(null); setPanel(null); setVerdict(null)
    setSolutionsRun(sols)
    const input: DecisionInput = { situation, problem, solutions: sols, audience, scope, icpHints, panelSize, model, lang }

    try {
      setStage('researching')
      const g = await post<{ bundle: EvidenceBundle; live: boolean }>('/api/ground',
        { ...input, userChunks: kbChunks })
      setBundle(g.bundle); setLiveUsed(g.live)

      setStage('voting')
      const p = await post<PanelResult>('/api/panel', { input, bundle: g.bundle })
      setPanel(p)

      setStage('deciding')
      const v = await post<{ verdict: Verdict }>('/api/verdict', { input, bundle: g.bundle, tally: p.tally })
      setVerdict(v.verdict)
      setStage('done')
    } catch (e: any) {
      setError(e?.message ?? t.errRun)
      setStage('idle')
    }
  }

  const solTitle = (id: string) => solutionsRun.find((s) => s.id === id)?.title ?? id

  function exportJsonl() {
    if (!bundle || !panel || !verdict) return
    const solList = solutionsRun.map((s) => `[${s.id}] ${s.title}${s.detail ? `：${s.detail}` : ''}`).join('\n')
    const voteSummary = panel.tally
      .map((tt) => `[${tt.solutionId}] ${tt.title} 首选${tt.firstChoiceVotes}票/${tt.votePct}%, 均分${tt.meanScore}/5`)
      .join('；')
    const userMsg =
      t.exportSituation(situation, problem, audience, t.scope[scope]) +
      t.exportSolutions(solList) +
      t.exportVote(voteSummary)
    const assistant =
      t.exportDecision(solTitle(verdict.recommendedId), t.decisiveness[verdict.decisiveness]) +
      t.exportReason(verdict.rationale) +
      (verdict.tradeoff ? t.exportTradeoff(verdict.tradeoff) : '') +
      t.exportCheapest(verdict.cheapestExperiment) +
      t.exportPlan(verdict.ninetyDayPlan.map((s) => `${s.week} ${s.action} (KPI: ${s.kpi})`).join('; '))
    const rec: SftRecord = {
      messages: [
        { role: 'system', content: t.exportSys },
        { role: 'user', content: userMsg },
        { role: 'assistant', content: assistant },
      ],
    }
    const blob = new Blob([JSON.stringify(rec)], { type: 'application/jsonl' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'customer-jury-decision.jsonl'
    a.click()
  }

  return (
    <main className="min-h-screen mx-auto max-w-[1180px] px-500 py-900">
      {/* Header */}
      <header className="mb-900">
        <div className="flex items-start justify-between gap-300 mb-300">
          <div className="flex items-center gap-300">
            <div className="w-1000 h-1000 rounded-300 bg-cosmicore grid place-items-center shadow-raised">
              <Telescope className="w-600 h-600 text-mochimalist" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-600 font-bold tracking-tight leading-none">Customer Jury</h1>
              <p className="text-200 text-roboflow-500 mt-100">{t.tagline}</p>
            </div>
          </div>
          <button onClick={toggleLang}
            className="flex items-center gap-200 rounded-pill border border-roboflow-200 bg-mochimalist px-300 py-200 text-200 font-semibold text-roboflow-600 hover:border-pushpin-300 hover:text-cosmicore transition-colors shrink-0">
            <Languages className="w-300 h-300" /> {t.langToggle}
          </button>
        </div>
        <p className="text-300 text-roboflow-600 max-w-[680px] leading-relaxed">
          {t.intro1}<span className="font-semibold text-cosmicore">{t.marketResearch}</span>
          {t.intro2}<span className="font-semibold text-cosmicore">{t.customerVote}</span>
          {t.intro3}<span className="font-display italic">{t.introEmph}</span>
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-600 items-start">
        {/* ---------------- Input column ---------------- */}
        <section className="lg:sticky lg:top-500 rounded-400 bg-mochimalist shadow-floating p-600 space-y-500">
          <Field label={t.situationLabel}>
            <textarea
              value={situation} onChange={(e) => setSituation(e.target.value)} rows={3}
              placeholder={t.situationPlaceholder}
              className="w-full resize-none rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
            />
            <button type="button" onClick={fillSample} disabled={running}
              className="mt-200 inline-flex items-center gap-100 rounded-pill border border-pushpin-200 bg-pushpin-0 px-300 py-100 text-100 font-semibold text-pushpin-450 hover:bg-pushpin-50 disabled:opacity-50 transition-colors">
              <Lightbulb className="w-300 h-300" />
              <span className="text-roboflow-500 font-normal">{t.sampleLabel}：</span>{t.sampleChip}
            </button>
          </Field>

          <Field label={t.problemLabel}>
            <textarea
              value={problem} onChange={(e) => setProblem(e.target.value)} rows={2}
              placeholder={t.problemPlaceholder}
              className="w-full resize-none rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
            />
          </Field>

          {/* solutions editor */}
          <Field label={t.solutionsLabel}>
            <div className="space-y-200">
              {solutions.map((s, i) => (
                <div key={i} className="rounded-200 border border-roboflow-200 bg-roboflow-50 p-200">
                  <div className="flex items-center gap-200">
                    <span className="grid place-items-center w-600 h-600 rounded-100 bg-cosmicore text-mochimalist text-100 font-bold shrink-0">
                      {t.optionLetter(i)}
                    </span>
                    <input
                      value={s.title} onChange={(e) => setSolutionField(i, 'title', e.target.value)}
                      placeholder={t.solutionTitlePlaceholder}
                      className="flex-1 min-w-0 rounded-100 border border-roboflow-200 bg-mochimalist px-200 py-100 text-200 outline-none focus:border-pushpin-300 transition-colors"
                    />
                    <button type="button" onClick={() => removeSolution(i)} disabled={solutions.length <= 1}
                      aria-label={t.removeSolution}
                      className="grid place-items-center w-600 h-600 rounded-100 text-roboflow-400 hover:text-pushpin-500 disabled:opacity-30 transition-colors shrink-0">
                      <Trash2 className="w-300 h-300" />
                    </button>
                  </div>
                  <input
                    value={s.detail} onChange={(e) => setSolutionField(i, 'detail', e.target.value)}
                    placeholder={t.solutionDetailPlaceholder}
                    className="w-full mt-100 rounded-100 border border-transparent bg-transparent px-200 py-100 text-100 text-roboflow-600 outline-none focus:border-roboflow-200 focus:bg-mochimalist transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-200 mt-200">
              <button type="button" onClick={addSolution} disabled={running || solutions.length >= MAX_SOLUTIONS}
                className="flex-1 flex items-center justify-center gap-100 rounded-200 border border-roboflow-200 bg-mochimalist px-300 py-200 text-100 font-semibold text-roboflow-600 hover:border-pushpin-300 hover:text-cosmicore disabled:opacity-50 transition-colors">
                <Plus className="w-300 h-300" />{t.addSolution}
              </button>
              <input
                type="number" min={1} max={MAX_GEN} value={genCount} disabled={genning || running}
                title={t.genCountTitle} aria-label={t.genCountTitle}
                onChange={(e) => setGenCount(Math.max(1, Math.min(MAX_GEN, Math.floor(+e.target.value) || 1)))}
                className="w-[56px] shrink-0 rounded-200 border border-roboflow-200 bg-roboflow-50 px-200 py-200 text-200 text-center font-semibold outline-none focus:border-pushpin-300 disabled:opacity-50 transition-colors"
              />
              <button type="button" onClick={genSolutions} disabled={genning || running}
                className="flex-[1.4] flex items-center justify-center gap-100 rounded-200 bg-cosmicore text-mochimalist px-300 py-200 text-100 font-semibold hover:bg-roboflow-800 disabled:opacity-50 transition-colors">
                {genning ? <Loader2 className="w-300 h-300 animate-spin" /> : <Sparkles className="w-300 h-300" />}
                {genning ? t.genningSolutions : t.genSolutions}
              </button>
            </div>
            {genError ? (
              <div className="flex items-start gap-100 text-100 text-pushpin-500 bg-pushpin-50 rounded-200 p-200 mt-200">
                <AlertTriangle className="w-300 h-300 mt-[2px] shrink-0" />{genError}
              </div>
            ) : (
              <p className="text-100 text-roboflow-400 mt-200">{t.solutionsHint}</p>
            )}
          </Field>

          <Field label={t.audienceLabel}>
            <input
              value={audience} onChange={(e) => setAudience(e.target.value)}
              placeholder={t.audiencePlaceholder}
              className="w-full rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
            />
          </Field>

          <Field label={t.scopeLabel}>
            <div className="flex gap-100 p-100 rounded-200 bg-roboflow-100">
              {SCOPE_VALUES.map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`flex-1 py-200 rounded-100 text-200 font-semibold transition-all ${
                    scope === s ? 'bg-mochimalist text-cosmicore shadow-floating' : 'text-roboflow-500'
                  }`}>
                  {t.scope[s]}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t.icpLabel}>
            <input
              value={icpHints} onChange={(e) => setIcpHints(e.target.value)}
              placeholder={t.icpPlaceholder}
              className="w-full rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
            />
          </Field>

          <Field label={t.kbLabel}>
            <div className="flex gap-200">
              <input
                value={kbInput} onChange={(e) => setKbInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addKb() }}
                placeholder={t.kbPlaceholder} disabled={kbAdding}
                className="flex-1 min-w-0 rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
              />
              <button onClick={addKb} disabled={kbAdding}
                className="flex items-center gap-100 rounded-200 bg-cosmicore text-mochimalist px-300 text-200 font-semibold disabled:opacity-40 hover:bg-roboflow-800 transition-colors shrink-0">
                {kbAdding ? <Loader2 className="w-300 h-300 animate-spin" /> : <Plus className="w-300 h-300" />}
                {kbAdding ? t.kbAdding : t.kbAdd}
              </button>
            </div>
            {kbError && (
              <div className="flex items-start gap-100 text-100 text-pushpin-500 bg-pushpin-50 rounded-200 p-200 mt-200">
                <AlertTriangle className="w-300 h-300 mt-[2px] shrink-0" />{kbError}
              </div>
            )}
            {kbSources.length === 0 ? (
              <p className="text-100 text-roboflow-400 mt-200 flex items-start gap-100">
                <BookOpen className="w-300 h-300 mt-[1px] shrink-0" />{t.kbEmpty}
              </p>
            ) : (
              <div className="mt-200 space-y-100">
                <div className="flex items-center justify-between">
                  <span className="text-100 font-semibold text-pushpin-450 flex items-center gap-100">
                    <BookOpen className="w-300 h-300" />{t.kbBadge} · {t.kbChunks(kbChunks.length)}
                  </span>
                  <button onClick={clearKb} className="text-100 text-roboflow-400 hover:text-pushpin-500 flex items-center gap-100 transition-colors">
                    <Trash2 className="w-300 h-300" />{t.kbClear}
                  </button>
                </div>
                <div className="flex flex-wrap gap-100">
                  {kbSources.map((s, i) => (
                    <span key={i} className="text-100 px-200 py-[2px] rounded-pill bg-roboflow-100 text-roboflow-600 flex items-center gap-100 max-w-full">
                      <FileText className="w-300 h-300 shrink-0" /><span className="truncate max-w-[180px]">{s.source}</span>
                      <span className="text-roboflow-400">·{s.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Field>

          <Field label={t.panelLabel(panelSize)}>
            <input type="range" min={6} max={24} step={1} value={panelSize}
              onChange={(e) => setPanelSize(+e.target.value)}
              className="w-full accent-pushpin-450" />
          </Field>

          <Field label={t.modelLabel}>
            <div className="flex gap-100 p-100 rounded-200 bg-roboflow-100">
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setModel(m.id)} disabled={running}
                  className={`flex-1 py-200 rounded-100 transition-all disabled:opacity-50 ${
                    model === m.id ? 'bg-mochimalist shadow-floating' : ''
                  }`}>
                  <span className={`block text-200 font-semibold ${model === m.id ? 'text-cosmicore' : 'text-roboflow-500'}`}>{m.label}</span>
                  <span className={`block text-100 ${model === m.id ? 'text-roboflow-500' : 'text-roboflow-400'}`}>{t.modelHint[m.id]}</span>
                </button>
              ))}
            </div>
          </Field>

          <button onClick={run} disabled={running}
            className="w-full flex items-center justify-center gap-200 rounded-200 bg-pushpin-450 text-mochimalist font-semibold py-300 text-300 shadow-raised hover:bg-pushpin-500 disabled:opacity-50 transition-all">
            {running ? <Loader2 className="w-400 h-400 animate-spin" /> : <Sparkles className="w-400 h-400" />}
            {running ? t.runningBtn : t.runBtn}
          </button>

          {error && (
            <div className="flex items-start gap-200 text-100 text-pushpin-500 bg-pushpin-50 rounded-200 p-300">
              <AlertTriangle className="w-300 h-300 mt-[2px] shrink-0" />{error}
            </div>
          )}

          <StageRail stage={stage} liveUsed={liveUsed} t={t} />
        </section>

        {/* ---------------- Results column ---------------- */}
        <section className="space-y-600 min-w-0">
          {!bundle && !running && <EmptyState t={t} />}

          {bundle && <ResearchCard bundle={bundle} t={t} />}
          {panel && <VoteCard panel={panel} winnerId={panel.winnerId} solTitle={solTitle} t={t} />}
          {verdict && <DecisionCard verdict={verdict} solTitle={solTitle} onExport={exportJsonl} t={t} />}
        </section>
      </div>
    </main>
  )
}

// ===================== small components =====================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-100 font-semibold text-roboflow-600 mb-200">{label}</span>
      {children}
    </label>
  )
}

function StageRail({ stage, liveUsed, t }: { stage: Stage; liveUsed: boolean; t: Dict }) {
  const steps: { key: Stage; label: string; Icon: any }[] = [
    { key: 'researching', label: t.stageGround, Icon: Activity },
    { key: 'voting', label: t.stagePanel, Icon: Users },
    { key: 'deciding', label: t.stageJudge, Icon: Scale },
  ]
  const order: Stage[] = ['idle', 'researching', 'voting', 'deciding', 'done']
  const cur = order.indexOf(stage)
  if (stage === 'idle') return null
  return (
    <div className="pt-300 border-t border-roboflow-200 space-y-300">
      {steps.map((s) => {
        const done = order.indexOf(s.key) < cur
        const active = s.key === stage
        return (
          <div key={s.key} className="flex items-center gap-300 text-200">
            <span className={`grid place-items-center w-700 h-700 rounded-pill shrink-0 ${
              done ? 'bg-pushpin-450 text-mochimalist' : active ? 'bg-pushpin-50 text-pushpin-450' : 'bg-roboflow-100 text-roboflow-400'
            }`}>
              {active ? <Loader2 className="w-300 h-300 animate-spin" /> : <s.Icon className="w-300 h-300" />}
            </span>
            <span className={done || active ? 'text-cosmicore font-medium' : 'text-roboflow-400'}>{s.label}</span>
            {s.key === 'researching' && liveUsed && (
              <span className="text-[10px] px-200 py-[2px] rounded-pill bg-pushpin-50 text-pushpin-450 font-semibold">LIVE</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EmptyState({ t }: { t: Dict }) {
  return (
    <div className="rounded-400 border border-dashed border-roboflow-300 bg-mochimalist/50 p-900 text-center animate-fadeUp">
      <Target className="w-1000 h-1000 mx-auto text-roboflow-300 mb-400" strokeWidth={1.5} />
      <p className="text-300 text-roboflow-500">{t.empty1}</p>
      <p className="text-200 text-roboflow-400 mt-200">{t.empty2}</p>
    </div>
  )
}

function Card({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-400 bg-mochimalist shadow-floating p-600 animate-fadeUp">
      <div className="flex items-center gap-300 mb-500">
        <div className="w-900 h-900 rounded-200 bg-cosmicore grid place-items-center text-mochimalist shrink-0">{icon}</div>
        <div>
          <h2 className="text-400 font-bold leading-tight">{title}</h2>
          {sub && <p className="text-100 text-roboflow-500 mt-[2px]">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function ResearchCard({ bundle, t }: { bundle: EvidenceBundle; t: Dict }) {
  const st = CLIMATE_STYLE[bundle.climate]
  return (
    <Card icon={<Activity className="w-500 h-500" strokeWidth={1.75} />} title={t.researchTitle} sub={t.researchSub}>
      <div className={`inline-flex items-center gap-200 rounded-pill px-300 py-100 text-200 font-semibold mb-400 ${st.cls}`}>
        <st.Icon className="w-300 h-300" /> {t.climate[bundle.climate]} · {t.confidence} {(bundle.confidence * 100).toFixed(0)}%
      </div>
      <p className="text-300 text-cosmicore leading-relaxed mb-500">{bundle.marketRead}</p>

      <div className="grid sm:grid-cols-2 gap-300 mb-500">
        {bundle.experts.map((e) => (
          <div key={e.lens} className="rounded-300 bg-roboflow-50 p-400">
            <div className="text-100 font-semibold text-pushpin-450 mb-200">{t.lens[e.lens] ?? e.lens}</div>
            <div className="text-200 font-medium text-cosmicore mb-200">{e.headline}</div>
            <ul className="space-y-100">
              {e.bullets.map((b, i) => (
                <li key={i} className="text-100 text-roboflow-600 flex gap-200">
                  <span className="text-pushpin-300">·</span><span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="text-100 font-semibold text-roboflow-600 mb-200">{t.sourceReliability}</div>
      <div className="space-y-200">
        {bundle.sources.map((s, i) => (
          <div key={i} className="flex items-center gap-300">
            <span className="text-[10px] uppercase font-bold text-roboflow-400 w-[68px] shrink-0">{s.tier}</span>
            <div className="flex-1 min-w-0">
              <div className="text-100 text-cosmicore truncate">{s.claim}</div>
              <div className="text-[10px] text-roboflow-400 truncate">{s.origin}</div>
            </div>
            <div className="w-[80px] h-200 rounded-pill bg-roboflow-100 overflow-hidden shrink-0">
              <div className="h-full bg-pushpin-450" style={{ width: `${s.reliability * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function VoteCard({ panel, winnerId, solTitle, t }: { panel: PanelResult; winnerId: string; solTitle: (id: string) => string; t: Dict }) {
  return (
    <Card icon={<Users className="w-500 h-500" strokeWidth={1.75} />} title={t.voteTitle} sub={t.voteSub(panel.n)}>
      {/* tally — winner first */}
      <div className="space-y-300 mb-500">
        {panel.tally.map((row) => (
          <TallyRow key={row.solutionId} row={row} isWinner={row.solutionId === winnerId} n={panel.n} t={t} />
        ))}
      </div>

      {/* per-agent votes */}
      <details className="group">
        <summary className="cursor-pointer text-100 font-semibold text-roboflow-600 select-none">
          {t.agentsToggle(panel.agents.length)}
        </summary>
        <div className="grid sm:grid-cols-2 gap-300 mt-300">
          {panel.agents.map((a, i) => <AgentCard key={i} a={a} solTitle={solTitle} t={t} />)}
        </div>
      </details>
    </Card>
  )
}

function TallyRow({ row, isWinner, n, t }: { row: SolutionTally; isWinner: boolean; n: number; t: Dict }) {
  return (
    <div className={`rounded-300 p-400 border ${isWinner ? 'border-pushpin-300 bg-pushpin-0' : 'border-roboflow-200 bg-roboflow-50'}`}>
      <div className="flex items-center gap-200 mb-200">
        <span className={`grid place-items-center w-600 h-600 rounded-100 text-100 font-bold shrink-0 ${isWinner ? 'bg-pushpin-450 text-mochimalist' : 'bg-cosmicore text-mochimalist'}`}>
          {row.solutionId}
        </span>
        <span className="text-200 font-semibold text-cosmicore flex-1 min-w-0 truncate">{row.title}</span>
        {isWinner && (
          <span className="inline-flex items-center gap-100 text-[10px] px-200 py-[2px] rounded-pill bg-pushpin-450 text-mochimalist font-bold shrink-0">
            <Sparkles className="w-300 h-300" />{t.winnerBadge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-300">
        <div className="flex-1 h-300 rounded-pill bg-roboflow-100 overflow-hidden">
          <div className={`h-full ${isWinner ? 'bg-pushpin-450' : 'bg-roboflow-400'}`} style={{ width: `${(row.firstChoiceVotes / Math.max(1, n)) * 100}%`, minWidth: row.firstChoiceVotes ? 6 : 0 }} />
        </div>
        <span className="text-100 text-roboflow-600 shrink-0 w-[150px] text-right">
          {row.firstChoiceVotes} {t.votesLabel} · {t.meanLabel} {row.meanScore}/5
        </span>
      </div>
    </div>
  )
}

function AgentCard({ a, solTitle, t }: { a: AgentVote; solTitle: (id: string) => string; t: Dict }) {
  return (
    <div className="rounded-300 bg-roboflow-50 p-400">
      <div className="flex items-center justify-between mb-200">
        <div className="min-w-0">
          <div className="text-200 font-semibold text-cosmicore truncate">{a.name}</div>
          <div className="text-100 text-roboflow-500 truncate">{a.archetype}</div>
        </div>
        <div className="text-100 font-bold text-pushpin-450 shrink-0 ml-200 flex items-center gap-100">
          <span className="text-roboflow-400 font-normal">{t.agentPick}</span>
          <span className="grid place-items-center w-500 h-500 rounded-100 bg-pushpin-450 text-mochimalist">{a.pick}</span>
        </div>
      </div>
      <div className="text-100 text-roboflow-500 mb-200 truncate">{solTitle(a.pick)}</div>
      <p className="text-100 text-roboflow-600 leading-relaxed mb-200">{a.reasoning}</p>
      {a.objection && (
        <div className="text-100 text-pushpin-500 flex gap-200">
          <AlertTriangle className="w-300 h-300 mt-[1px] shrink-0" /><span>{a.objection}</span>
        </div>
      )}
    </div>
  )
}

function DecisionCard({ verdict, solTitle, onExport, t }: { verdict: Verdict; solTitle: (id: string) => string; onExport: () => void; t: Dict }) {
  const st = DECISIVE_STYLE[verdict.decisiveness]
  return (
    <Card icon={<Scale className="w-500 h-500" strokeWidth={1.75} />} title={t.decisionTitle} sub={t.decisionSub}>
      <div className="rounded-300 bg-cosmicore text-mochimalist p-500 mb-400">
        <div className="flex items-center gap-200 mb-200">
          <span className="text-100 uppercase tracking-wide text-mochimalist/60 font-semibold">{t.recommendLabel}</span>
          <span className={`inline-flex items-center gap-100 rounded-pill px-200 py-[2px] text-[10px] font-bold ${st.cls}`}>
            <st.Icon className="w-300 h-300" />{t.decisiveness[verdict.decisiveness]}
          </span>
        </div>
        <div className="flex items-center gap-300">
          <span className="grid place-items-center w-900 h-900 rounded-200 bg-pushpin-450 text-mochimalist text-400 font-bold shrink-0">{verdict.recommendedId}</span>
          <span className="text-500 font-bold leading-tight">{solTitle(verdict.recommendedId)}</span>
        </div>
      </div>

      <p className="text-300 text-cosmicore leading-relaxed mb-400">{verdict.rationale}</p>

      {verdict.tradeoff && (
        <div className="flex items-start gap-300 rounded-300 bg-pushpin-50 p-400 mb-400">
          <AlertTriangle className="w-400 h-400 text-pushpin-450 shrink-0 mt-[2px]" />
          <div>
            <div className="text-100 font-bold text-pushpin-500 mb-100">{t.tradeoffLabel}</div>
            <p className="text-200 text-roboflow-700">{verdict.tradeoff}</p>
          </div>
        </div>
      )}

      {verdict.runnerUpId && (
        <div className="flex items-center gap-300 rounded-300 bg-roboflow-50 p-400 mb-400">
          <span className="grid place-items-center w-600 h-600 rounded-100 bg-roboflow-300 text-mochimalist text-100 font-bold shrink-0">{verdict.runnerUpId}</span>
          <div>
            <div className="text-100 font-bold text-roboflow-600 mb-[1px]">{t.runnerUpLabel}</div>
            <p className="text-200 text-cosmicore">{solTitle(verdict.runnerUpId)}</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-300 rounded-300 bg-roboflow-50 p-400 mb-500">
        <FlaskConical className="w-400 h-400 text-cosmicore shrink-0 mt-[2px]" />
        <div>
          <div className="text-100 font-bold text-roboflow-600 mb-100">{t.cheapestLabel}</div>
          <p className="text-200 text-cosmicore">{verdict.cheapestExperiment}</p>
        </div>
      </div>

      {verdict.ninetyDayPlan.length > 0 && (
        <div className="mb-500">
          <div className="text-100 font-semibold text-roboflow-600 mb-300">{t.planLabel}</div>
          <div className="space-y-200">
            {verdict.ninetyDayPlan.map((s, i) => (
              <div key={i} className="flex gap-300 items-start rounded-300 bg-roboflow-50 p-300">
                <span className="text-100 font-bold text-pushpin-450 w-[88px] shrink-0">{s.week}</span>
                <span className="text-200 text-cosmicore flex-1">{s.action}</span>
                <span className="text-100 text-roboflow-500 shrink-0">KPI: {s.kpi}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onExport}
        className="w-full flex items-center justify-center gap-200 rounded-200 bg-cosmicore text-mochimalist font-semibold py-300 text-200 hover:bg-roboflow-800 transition-colors">
        <Download className="w-400 h-400" /> {t.exportBtn}
      </button>
    </Card>
  )
}
