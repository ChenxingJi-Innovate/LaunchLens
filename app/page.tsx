'use client'

import { useState } from 'react'
import {
  Activity, Users, Scale, Download, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Sparkles, Target, FlaskConical, CheckCircle2, XCircle, CircleDot, Telescope,
} from 'lucide-react'
import type {
  EvidenceBundle, IdeaInput, MarketScope, PanelResult, PersonaResponse, Verdict, SftRecord, DeepSeekModel,
} from '@/lib/types'
import { MODELS, DEFAULT_MODEL } from '@/lib/types'

// ---------------------------------------------------------------------------
// LaunchLens single-page app. Three-stage pipeline driven from one client component:
//   (A) Ground  → supply-side evidence bundle
//   (B/C) Panel → demand-side synthetic customer survey, grounded in (A)
//   (D) Verdict → contradiction meta-judge → one honest call + export
// ---------------------------------------------------------------------------

type Stage = 'idle' | 'grounding' | 'paneling' | 'judging' | 'done'

const SCOPES: { value: MarketScope; label: string }[] = [
  { value: 'china', label: '中国' },
  { value: 'global', label: '全球' },
  { value: 'overseas', label: '海外' },
]

const SUPPLY_META: Record<EvidenceBundle['supplyVerdict'], { label: string; cls: string; Icon: any }> = {
  tailwind: { label: '市场顺风', cls: 'text-pushpin-450 bg-pushpin-50', Icon: TrendingUp },
  mixed: { label: '喜忧参半', cls: 'text-roboflow-600 bg-roboflow-100', Icon: Minus },
  headwind: { label: '市场逆风', cls: 'text-roboflow-700 bg-roboflow-200', Icon: TrendingDown },
}

const CALL_META: Record<Verdict['call'], { label: string; cls: string; Icon: any }> = {
  validated: { label: '值得做 · Validated', cls: 'bg-pushpin-450 text-mochimalist', Icon: CheckCircle2 },
  conditional: { label: '有条件做 · Conditional', cls: 'bg-roboflow-700 text-mochimalist', Icon: CircleDot },
  kill: { label: '不建议做 · Kill', cls: 'bg-roboflow-800 text-mochimalist', Icon: XCircle },
}

const LENS_LABEL: Record<string, string> = {
  competitor: '竞争 Competitor',
  trend: '趋势 Trend',
  market: '市场 Market',
  risk: '风险 Risk',
}

export default function Page() {
  const [idea, setIdea] = useState('')
  const [market, setMarket] = useState('')
  const [scope, setScope] = useState<MarketScope>('global')
  const [icpHints, setIcpHints] = useState('')
  const [panelSize, setPanelSize] = useState(12)
  const [model, setModel] = useState<DeepSeekModel>(DEFAULT_MODEL)

  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
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
      setError('请填写产品想法和目标市场')
      return
    }
    setError('')
    setBundle(null); setPanel(null); setVerdict(null)
    const input: IdeaInput = { idea, market, scope, icpHints, panelSize, model }

    try {
      setStage('grounding')
      const g = await post<{ bundle: EvidenceBundle; live: boolean }>('/api/ground', input)
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
      setError(e?.message ?? '运行失败')
      setStage('idle')
    }
  }

  function exportJsonl() {
    if (!bundle || !panel || !verdict) return
    const sys = '你是一个产品想法验证助手，基于供给侧市场情报与需求侧客群反馈，给出验证结论。'
    const userMsg =
      `产品想法：${idea}\n目标市场：${market}（${scope}）\n\n` +
      `市场判断：${bundle.marketRead}（供给侧：${bundle.supplyVerdict}）\n` +
      `需求侧：均值${panel.stats.mean}/5，正面${panel.stats.positivePct}%，主要反对：` +
      `${panel.stats.topObjections.map((o) => o.objection).join('；')}`
    const assistant =
      `结论：${CALL_META[verdict.call].label}\n理由：${verdict.rationale}\n` +
      (verdict.contradiction ? `供需冲突：${verdict.contradiction}\n` : '') +
      `最便宜的验证：${verdict.cheapestExperiment}\n` +
      `90天计划：${verdict.ninetyDayPlan.map((s) => `${s.week} ${s.action}(KPI:${s.kpi})`).join('；')}`
    const rec: SftRecord = {
      messages: [
        { role: 'system', content: sys },
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
        <div className="flex items-center gap-300 mb-300">
          <div className="w-1000 h-1000 rounded-300 bg-cosmicore grid place-items-center shadow-raised">
            <Telescope className="w-600 h-600 text-mochimalist" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-600 font-bold tracking-tight leading-none">LaunchLens</h1>
            <p className="text-200 text-roboflow-500 mt-100">市场视角 + 用户视角，上线前一次看清你的产品想法</p>
          </div>
        </div>
        <p className="text-300 text-roboflow-600 max-w-[640px] leading-relaxed">
          供给侧的<span className="font-semibold text-cosmicore">市场情报</span>（StratSquad 式）
          与需求侧的<span className="font-semibold text-cosmicore">合成客群</span>（TinyTroupe 式）合并为一个判断：
          <span className="font-display italic"> 这个产品到底该不该做。</span>
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-600 items-start">
        {/* ---------------- Input column ---------------- */}
        <section className="lg:sticky lg:top-500 rounded-400 bg-mochimalist shadow-floating p-600 space-y-500">
          <Field label="产品想法 (Idea)">
            <textarea
              value={idea} onChange={(e) => setIdea(e.target.value)} rows={3}
              placeholder="例：面向东南亚学生的轻量 AI 错题本 App"
              className="w-full resize-none rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
            />
          </Field>
          <Field label="目标市场 (Market)">
            <input
              value={market} onChange={(e) => setMarket(e.target.value)}
              placeholder="例：东南亚 K12 学生与家长"
              className="w-full rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
            />
          </Field>
          <Field label="市场范围 (Scope)">
            <div className="flex gap-100 p-100 rounded-200 bg-roboflow-100">
              {SCOPES.map((s) => (
                <button key={s.value} onClick={() => setScope(s.value)}
                  className={`flex-1 py-200 rounded-100 text-200 font-semibold transition-all ${
                    scope === s.value ? 'bg-mochimalist text-cosmicore shadow-floating' : 'text-roboflow-500'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="目标客户线索 (可选)">
            <input
              value={icpHints} onChange={(e) => setIcpHints(e.target.value)}
              placeholder="例：价格敏感、重度使用短视频"
              className="w-full rounded-200 border border-roboflow-200 bg-roboflow-50 px-300 py-200 text-200 outline-none focus:border-pushpin-300 transition-colors"
            />
          </Field>
          <Field label={`合成客群规模：${panelSize} 人`}>
            <input type="range" min={6} max={24} step={1} value={panelSize}
              onChange={(e) => setPanelSize(+e.target.value)}
              className="w-full accent-pushpin-450" />
          </Field>
          <Field label="推理模型 (DeepSeek)">
            <div className="flex gap-100 p-100 rounded-200 bg-roboflow-100">
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setModel(m.id)} disabled={running}
                  className={`flex-1 py-200 rounded-100 transition-all disabled:opacity-50 ${
                    model === m.id ? 'bg-mochimalist shadow-floating' : ''
                  }`}>
                  <span className={`block text-200 font-semibold ${model === m.id ? 'text-cosmicore' : 'text-roboflow-500'}`}>{m.label}</span>
                  <span className={`block text-100 ${model === m.id ? 'text-roboflow-500' : 'text-roboflow-400'}`}>{m.hint}</span>
                </button>
              ))}
            </div>
          </Field>

          <button onClick={run} disabled={running}
            className="w-full flex items-center justify-center gap-200 rounded-200 bg-pushpin-450 text-mochimalist font-semibold py-300 text-300 shadow-raised hover:bg-pushpin-500 disabled:opacity-50 transition-all">
            {running ? <Loader2 className="w-400 h-400 animate-spin" /> : <Sparkles className="w-400 h-400" />}
            {running ? '验证中…' : '开始验证'}
          </button>

          {error && (
            <div className="flex items-start gap-200 text-100 text-pushpin-500 bg-pushpin-50 rounded-200 p-300">
              <AlertTriangle className="w-300 h-300 mt-[2px] shrink-0" />{error}
            </div>
          )}

          <StageRail stage={stage} liveUsed={liveUsed} />
        </section>

        {/* ---------------- Results column ---------------- */}
        <section className="space-y-600 min-w-0">
          {!bundle && !running && <EmptyState />}

          {bundle && <SupplyCard bundle={bundle} />}
          {panel && <DemandCard panel={panel} />}
          {verdict && <VerdictCard verdict={verdict} onExport={exportJsonl} />}
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

function StageRail({ stage, liveUsed }: { stage: Stage; liveUsed: boolean }) {
  const steps: { key: Stage; label: string; Icon: any }[] = [
    { key: 'grounding', label: '供给侧 · 市场情报', Icon: Activity },
    { key: 'paneling', label: '需求侧 · 合成客群', Icon: Users },
    { key: 'judging', label: '仲裁 · 最终结论', Icon: Scale },
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

function EmptyState() {
  return (
    <div className="rounded-400 border border-dashed border-roboflow-300 bg-mochimalist/50 p-900 text-center animate-fadeUp">
      <Target className="w-1000 h-1000 mx-auto text-roboflow-300 mb-400" strokeWidth={1.5} />
      <p className="text-300 text-roboflow-500">填写左侧产品想法，开始一次端到端验证。</p>
      <p className="text-200 text-roboflow-400 mt-200">
        市场情报 → 合成客群打分 → 矛盾仲裁，最后导出可用于微调的 JSONL。
      </p>
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

function SupplyCard({ bundle }: { bundle: EvidenceBundle }) {
  const m = SUPPLY_META[bundle.supplyVerdict]
  return (
    <Card icon={<Activity className="w-500 h-500" strokeWidth={1.75} />} title="供给侧 · 市场情报" sub="市场在朝这个方向走吗？">
      <div className={`inline-flex items-center gap-200 rounded-pill px-300 py-100 text-200 font-semibold mb-400 ${m.cls}`}>
        <m.Icon className="w-300 h-300" /> {m.label} · 信心 {(bundle.supplyConfidence * 100).toFixed(0)}%
      </div>
      <p className="text-300 text-cosmicore leading-relaxed mb-500">{bundle.marketRead}</p>

      <div className="grid sm:grid-cols-2 gap-300 mb-500">
        {bundle.experts.map((e) => (
          <div key={e.lens} className="rounded-300 bg-roboflow-50 p-400">
            <div className="text-100 font-semibold text-pushpin-450 mb-200">{LENS_LABEL[e.lens] ?? e.lens}</div>
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

      <div className="text-100 font-semibold text-roboflow-600 mb-200">来源可靠度</div>
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

function DemandCard({ panel }: { panel: PanelResult }) {
  const { stats, responses } = panel
  const max = Math.max(1, ...Object.values(stats.histogram))
  return (
    <Card icon={<Users className="w-500 h-500" strokeWidth={1.75} />} title="需求侧 · 合成客群" sub={`${stats.n} 位潜在客户独立打分（已读市场证据）`}>
      <div className="grid grid-cols-3 gap-300 mb-500">
        <Stat label="采用倾向均值" value={`${stats.mean}`} unit="/5" tone="pushpin" />
        <Stat label="正面 (4-5星)" value={`${stats.positivePct}`} unit="%" tone="cosmicore" />
        <Stat label="负面 (1-2星)" value={`${stats.negativePct}`} unit="%" tone="roboflow" />
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
          <div className="text-100 font-semibold text-roboflow-600 mb-200">分细分市场</div>
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
          <div className="text-100 font-semibold text-roboflow-600 mb-200">主要反对意见</div>
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
          展开 {responses.length} 位 persona 的逐条回答
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

function VerdictCard({ verdict, onExport }: { verdict: Verdict; onExport: () => void }) {
  const m = CALL_META[verdict.call]
  return (
    <Card icon={<Scale className="w-500 h-500" strokeWidth={1.75} />} title="矛盾仲裁 · 最终结论" sub="供给与需求是否一致？">
      <div className={`inline-flex items-center gap-200 rounded-200 px-400 py-200 text-300 font-bold mb-400 shadow-raised ${m.cls}`}>
        <m.Icon className="w-400 h-400" /> {m.label}
      </div>

      <p className="text-300 text-cosmicore leading-relaxed mb-400">{verdict.rationale}</p>

      {verdict.contradiction && (
        <div className="flex items-start gap-300 rounded-300 bg-pushpin-50 p-400 mb-400">
          <AlertTriangle className="w-400 h-400 text-pushpin-450 shrink-0 mt-[2px]" />
          <div>
            <div className="text-100 font-bold text-pushpin-500 mb-100">供需冲突</div>
            <p className="text-200 text-roboflow-700">{verdict.contradiction}</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-300 rounded-300 bg-roboflow-50 p-400 mb-500">
        <FlaskConical className="w-400 h-400 text-cosmicore shrink-0 mt-[2px]" />
        <div>
          <div className="text-100 font-bold text-roboflow-600 mb-100">最便宜的真实验证</div>
          <p className="text-200 text-cosmicore">{verdict.cheapestExperiment}</p>
        </div>
      </div>

      {verdict.ninetyDayPlan.length > 0 && (
        <div className="mb-500">
          <div className="text-100 font-semibold text-roboflow-600 mb-300">90 天落地计划</div>
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
        <Download className="w-400 h-400" /> 导出验证结论 JSONL（SFT）
      </button>
    </Card>
  )
}
