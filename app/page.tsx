'use client'

import { useEffect, useState } from 'react'
import {
  Activity, Users, Scale, Download, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Sparkles, Target, FlaskConical, CheckCircle2, XCircle, CircleDot, Telescope, Languages,
  BookOpen, Plus, Trash2, FileText,
} from 'lucide-react'
import type {
  EvidenceBundle, IdeaInput, MarketScope, PanelResult, PersonaResponse, Verdict, SftRecord, DeepSeekModel, UserChunk,
} from '@/lib/types'
import { MODELS, DEFAULT_MODEL } from '@/lib/types'
import { STRINGS, type Dict, type Lang } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// LaunchLens single-page app. Three-stage pipeline driven from one client component:
//   (A) Ground  → supply-side evidence bundle
//   (B/C) Panel → demand-side synthetic customer survey, grounded in (A)
//   (D) Verdict → contradiction meta-judge → one honest call + export
// All visible copy comes from STRINGS[lang]; `lang` is also sent to the API so the
// LLM-generated content (market read, persona answers, verdict) matches the UI language.
// ---------------------------------------------------------------------------

type Stage = 'idle' | 'grounding' | 'paneling' | 'judging' | 'done'

const SCOPE_VALUES: MarketScope[] = ['china', 'global', 'overseas']

// Style only (colour + icon); the human label is pulled from the dictionary per language.
const SUPPLY_STYLE: Record<EvidenceBundle['supplyVerdict'], { cls: string; Icon: any }> = {
  tailwind: { cls: 'text-pushpin-450 bg-pushpin-50', Icon: TrendingUp },
  mixed: { cls: 'text-roboflow-600 bg-roboflow-100', Icon: Minus },
  headwind: { cls: 'text-roboflow-700 bg-roboflow-200', Icon: TrendingDown },
}

const CALL_STYLE: Record<Verdict['call'], { cls: string; Icon: any }> = {
  validated: { cls: 'bg-pushpin-450 text-mochimalist', Icon: CheckCircle2 },
  conditional: { cls: 'bg-roboflow-700 text-mochimalist', Icon: CircleDot },
  kill: { cls: 'bg-roboflow-800 text-mochimalist', Icon: XCircle },
}

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

  const [idea, setIdea] = useState('')
  const [market, setMarket] = useState('')
  const [scope, setScope] = useState<MarketScope>('global')
  const [icpHints, setIcpHints] = useState('')
  const [panelSize, setPanelSize] = useState(12)
  const [model, setModel] = useState<DeepSeekModel>(DEFAULT_MODEL)

  // knowledge base (RAG): chunks live client-side and are passed into /api/ground
  const [kbChunks, setKbChunks] = useState<UserChunk[]>([])
  const [kbInput, setKbInput] = useState('')
  const [kbAdding, setKbAdding] = useState(false)

  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')

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
    const v = kbInput.trim()
    if (!v || kbAdding) return
    setKbAdding(true); setError('')
    try {
      const isUrl = /^https?:\/\//i.test(v)
      const r = await post<{ chunks: UserChunk[]; source: string; count: number }>('/api/kb',
        isUrl ? { url: v } : { text: v })
      const next = [...kbChunks, ...r.chunks]
      setKbChunks(next); persistKb(next); setKbInput('')
    } catch (e: any) {
      setError(e?.message ?? 'KB ingest failed')
    } finally {
      setKbAdding(false)
    }
  }
  function clearKb() {
    setKbChunks([]); persistKb([])
  }
  // group chunks by source document for the chip list
  const kbSources = Array.from(
    kbChunks.reduce((m, c) => m.set(c.source, (m.get(c.source) ?? 0) + 1), new Map<string, number>())
  ).map(([source, count]) => ({ source, count }))
  const [bundle, setBundle] = useState<EvidenceBundle | null>(null)
  const [liveUsed, setLiveUsed] = useState(false)
  const [panel, setPanel] = useState<PanelResult | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  const running = stage === 'grounding' || stage === 'paneling' || stage === 'judging'

  async function post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.text()) || `${url} ${res.status}`)
    return res.json() as Promise<T>
  }

  async function run() {
    if (!idea.trim() || !market.trim()) {
      setError(t.errFill)
      return
    }
    setError('')
    setBundle(null); setPanel(null); setVerdict(null)
    const input: IdeaInput = { idea, market, scope, icpHints, panelSize, model, lang }

    try {
      setStage('grounding')
      const g = await post<{ bundle: EvidenceBundle; live: boolean }>('/api/ground',
        { ...input, userChunks: kbChunks })
      setBundle(g.bundle); setLiveUsed(g.live)

      setStage('paneling')
      const p = await post<PanelResult>('/api/panel', { input, bundle: g.bundle })
      setPanel(p)

      setStage('judging')
      const v = await post<{ verdict: Verdict }>('/api/verdict', {
        input, bundle: g.bundle, stats: p.stats,
      })
      setVerdict(v.verdict)
      setStage('done')
    } catch (e: any) {
      setError(e?.message ?? t.errRun)
      setStage('idle')
    }
  }

  function exportJsonl() {
    if (!bundle || !panel || !verdict) return
    const userMsg =
      t.exportIdea(idea, market, t.scope[scope]) +
      t.exportMarket(bundle.marketRead, t.supplyVerdict[bundle.supplyVerdict]) +
      t.exportDemand(panel.stats.mean, panel.stats.positivePct, panel.stats.topObjections.map((o) => o.objection).join('; '))
    const assistant =
      t.exportConclusion(t.call[verdict.call]) +
      t.exportReason(verdict.rationale) +
      (verdict.contradiction ? t.exportConflict(verdict.contradiction) : '') +
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
    a.download = 'launchlens-validation.jsonl'
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
              <h1 className="text-600 font-bold tracking-tight leading-none">LaunchLens</h1>
              <p className="text-200 text-roboflow-500 mt-100">{t.tagline}</p>
            </div>
          </div>
          <button onClick={toggleLang}
            className="flex items-center gap-200 rounded-pill border border-roboflow-200 bg-mochimalist px-300 py-200 text-200 font-semibold text-roboflow-600 hover:border-pushpin-300 hover:text-cosmicore transition-colors shrink-0">
            <Languages className="w-300 h-300" /> {t.langToggle}
          </button>
        </div>
        <p className="text-300 text-roboflow-600 max-w-[640px] leading-relaxed">
          {t.intro1}<span className="font-semibold text-cosmicore">{t.marketIntel}</span>
          {t.intro2}<span className="font-semibold text-cosmicore">{t.synthPanel}</span>
          {t.intro3}<span className="font-display italic">{t.introEmph}</span>
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-600 items-start">
        {/* ---------------- Input column ---------------- */}
        <section className="lg:sticky lg:top-500 rounded-400 bg-mochimalist shadow-floating p-600 space-y-500">
          <Field label={t.ideaLabel}>
            <textarea
              value={idea} onChange={(e) => setIdea(e.target.value)} rows={3}
              placeholder={t.ideaPlaceholder}
              className="w-full resize-none rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
            />
          </Field>
          <Field label={t.marketLabel}>
            <input
              value={market} onChange={(e) => setMarket(e.target.value)}
              placeholder={t.marketPlaceholder}
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
              <button onClick={addKb} disabled={kbAdding || !kbInput.trim()}
                className="flex items-center gap-100 rounded-200 bg-cosmicore text-mochimalist px-300 text-200 font-semibold disabled:opacity-40 hover:bg-roboflow-800 transition-colors shrink-0">
                {kbAdding ? <Loader2 className="w-300 h-300 animate-spin" /> : <Plus className="w-300 h-300" />}
                {kbAdding ? t.kbAdding : t.kbAdd}
              </button>
            </div>
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

          {bundle && <SupplyCard bundle={bundle} t={t} />}
          {panel && <DemandCard panel={panel} t={t} />}
          {verdict && <VerdictCard verdict={verdict} onExport={exportJsonl} t={t} />}
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
    { key: 'grounding', label: t.stageGround, Icon: Activity },
    { key: 'paneling', label: t.stagePanel, Icon: Users },
    { key: 'judging', label: t.stageJudge, Icon: Scale },
  ]
  const order: Stage[] = ['idle', 'grounding', 'paneling', 'judging', 'done']
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
            {s.key === 'grounding' && liveUsed && (
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

function SupplyCard({ bundle, t }: { bundle: EvidenceBundle; t: Dict }) {
  const st = SUPPLY_STYLE[bundle.supplyVerdict]
  return (
    <Card icon={<Activity className="w-500 h-500" strokeWidth={1.75} />} title={t.supplyTitle} sub={t.supplySub}>
      <div className={`inline-flex items-center gap-200 rounded-pill px-300 py-100 text-200 font-semibold mb-400 ${st.cls}`}>
        <st.Icon className="w-300 h-300" /> {t.supplyVerdict[bundle.supplyVerdict]} · {t.confidence} {(bundle.supplyConfidence * 100).toFixed(0)}%
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

function DemandCard({ panel, t }: { panel: PanelResult; t: Dict }) {
  const { stats, responses } = panel
  const max = Math.max(1, ...Object.values(stats.histogram))
  return (
    <Card icon={<Users className="w-500 h-500" strokeWidth={1.75} />} title={t.demandTitle} sub={t.demandSub(stats.n)}>
      <div className="grid grid-cols-3 gap-300 mb-500">
        <Stat label={t.statMean} value={`${stats.mean}`} unit="/5" tone="pushpin" />
        <Stat label={t.statPos} value={`${stats.positivePct}`} unit="%" tone="cosmicore" />
        <Stat label={t.statNeg} value={`${stats.negativePct}`} unit="%" tone="roboflow" />
      </div>

      {/* histogram */}
      <div className="flex items-end gap-300 h-[120px] mb-500 px-200">
        {(['1', '2', '3', '4', '5'] as const).map((k) => (
          <div key={k} className="flex-1 flex flex-col items-center gap-100">
            <span className="text-100 text-roboflow-500">{stats.histogram[k]}</span>
            <div className="w-full rounded-100 bg-pushpin-450/85"
              style={{ height: `${(stats.histogram[k] / max) * 88}px`, minHeight: 2 }} />
            <span className="text-100 text-roboflow-400">{k}★</span>
          </div>
        ))}
      </div>

      {/* segments */}
      {stats.bySegment.length > 0 && (
        <div className="mb-500">
          <div className="text-100 font-semibold text-roboflow-600 mb-200">{t.segTitle}</div>
          <div className="space-y-100">
            {stats.bySegment.map((s, i) => (
              <div key={i} className="flex items-center gap-300 text-100">
                <span className="w-[140px] truncate text-cosmicore">{s.segment}</span>
                <div className="flex-1 h-200 rounded-pill bg-roboflow-100 overflow-hidden">
                  <div className="h-full bg-cosmicore" style={{ width: `${(s.mean / 5) * 100}%` }} />
                </div>
                <span className="text-roboflow-500 w-[64px] text-right">{s.mean}/5 · n{s.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* top objections */}
      {stats.topObjections.length > 0 && (
        <div className="mb-500">
          <div className="text-100 font-semibold text-roboflow-600 mb-200">{t.objTitle}</div>
          <div className="flex flex-wrap gap-200">
            {stats.topObjections.map((o, i) => (
              <span key={i} className="text-100 px-300 py-100 rounded-pill bg-pushpin-50 text-pushpin-500">
                {o.objection} ×{o.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* persona grid */}
      <details className="group">
        <summary className="cursor-pointer text-100 font-semibold text-roboflow-600 select-none">
          {t.personaToggle(responses.length)}
        </summary>
        <div className="grid sm:grid-cols-2 gap-300 mt-300">
          {responses.map((p, i) => <PersonaCard key={i} p={p} />)}
        </div>
      </details>
    </Card>
  )
}

function PersonaCard({ p }: { p: PersonaResponse }) {
  return (
    <div className="rounded-300 bg-roboflow-50 p-400">
      <div className="flex items-center justify-between mb-200">
        <div className="min-w-0">
          <div className="text-200 font-semibold text-cosmicore truncate">{p.name}</div>
          <div className="text-100 text-roboflow-500 truncate">{p.archetype}</div>
        </div>
        <div className="text-300 font-bold text-pushpin-450 shrink-0 ml-200">{p.score}★</div>
      </div>
      <p className="text-100 text-roboflow-600 leading-relaxed mb-200">{p.justification}</p>
      <div className="text-100 text-pushpin-500 flex gap-200">
        <AlertTriangle className="w-300 h-300 mt-[1px] shrink-0" /><span>{p.objection}</span>
      </div>
    </div>
  )
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone: 'pushpin' | 'cosmicore' | 'roboflow' }) {
  const c = tone === 'pushpin' ? 'text-pushpin-450' : tone === 'cosmicore' ? 'text-cosmicore' : 'text-roboflow-600'
  return (
    <div className="rounded-300 bg-roboflow-50 p-400 text-center">
      <div className={`text-500 font-bold leading-none ${c}`}>{value}<span className="text-200 font-normal text-roboflow-400">{unit}</span></div>
      <div className="text-100 text-roboflow-500 mt-200">{label}</div>
    </div>
  )
}

function VerdictCard({ verdict, onExport, t }: { verdict: Verdict; onExport: () => void; t: Dict }) {
  const st = CALL_STYLE[verdict.call]
  return (
    <Card icon={<Scale className="w-500 h-500" strokeWidth={1.75} />} title={t.verdictTitle} sub={t.verdictSub}>
      <div className={`inline-flex items-center gap-200 rounded-200 px-400 py-200 text-300 font-bold mb-400 shadow-raised ${st.cls}`}>
        <st.Icon className="w-400 h-400" /> {t.call[verdict.call]}
      </div>

      <p className="text-300 text-cosmicore leading-relaxed mb-400">{verdict.rationale}</p>

      {verdict.contradiction && (
        <div className="flex items-start gap-300 rounded-300 bg-pushpin-50 p-400 mb-400">
          <AlertTriangle className="w-400 h-400 text-pushpin-450 shrink-0 mt-[2px]" />
          <div>
            <div className="text-100 font-bold text-pushpin-500 mb-100">{t.contradictionLabel}</div>
            <p className="text-200 text-roboflow-700">{verdict.contradiction}</p>
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
