import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CircleCheck, Hourglass, Lock, OctagonX, Timer, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { FIXTURES } from '../fixtures'
import type { Fixture } from '../fixtureTypes'
import { OUTCOME_STYLE, PROOF, fill, type CounterDef, type FilterDef, type OutcomeIcon } from '../story'

const ICONS: Record<OutcomeIcon, LucideIcon> = {
  'circle-check': CircleCheck,
  'octagon-x': OctagonX,
  'triangle-alert': TriangleAlert,
  hourglass: Hourglass,
  timer: Timer,
  lock: Lock,
}

const matches = (f: Fixture, d: FilterDef) => (!d.critical || f.critical) && (!d.kind || f.kind === d.kind)

/** Every number on this page comes from here. */
function count(fixtures: Fixture[], c: CounterDef) {
  const pool = fixtures.filter((f) => f.kind === c.kind)
  return { n: pool.filter((f) => c.outcomes.includes(f.outcome)).length, d: pool.length }
}

const label = 'font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#a89f90]'

function Tile({ f, onOpen }: { f: Fixture; onOpen: (f: Fixture, el: HTMLButtonElement) => void }) {
  const st = OUTCOME_STYLE[f.outcome]
  const Icon = ICONS[st.icon]
  return (
    <button
      type="button"
      onClick={(e) => onOpen(f, e.currentTarget)}
      aria-label={`${f.id}. ${f.title}. ${st.label}.${f.critical ? ` ${PROOF.criticalTag.toLowerCase()}.` : ''}`}
      className="group relative flex min-h-[132px] flex-col justify-between rounded-xl border-2 p-3 text-left transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: st.color,
        background: `color-mix(in oklab, ${st.color} 11%, #0b0a08)`,
        boxShadow: f.critical ? `0 0 0 2px #070605, 0 0 0 4px #F5EEDF` : undefined,
      }}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5" style={{ color: st.color }}>
          <Icon className="size-5 shrink-0" aria-hidden />
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider">{st.label}</span>
        </span>
        {f.critical && <span className="rounded border border-[#F5EEDF] px-1 font-mono text-[9px] font-bold tracking-wider text-[#F5EEDF]">{PROOF.criticalTag}</span>}
      </span>
      <span className="mt-2 line-clamp-3 text-[13px] font-semibold leading-snug text-[#F5EEDF]">{f.title}</span>
      <span className="mt-2 font-mono text-[10.5px] text-[#a89f90]">{f.id}</span>
    </button>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <dt className={label}>{k}</dt>
      <dd className="mt-1 text-[14.5px] leading-relaxed text-[#F5EEDF]">{children}</dd>
    </div>
  )
}

function Drawer({ f, onClose, reduced }: { f: Fixture; onClose: () => void; reduced: boolean }) {
  const st = OUTCOME_STYLE[f.outcome]
  const Icon = ICONS[st.icon]
  const d = PROOF.drawer
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <>
      <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.2 }} onClick={onClose} className="absolute inset-0 z-20 bg-black/55" />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${f.id}. ${f.title}`}
        initial={reduced ? false : { x: 460 }}
        animate={{ x: 0 }}
        exit={reduced ? { opacity: 0 } : { x: 460 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[460px] flex-col border-l border-[#3a332b] bg-[#0b0a08]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#2a241d] p-4">
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-bold text-[#a89f90]">{f.id}</p>
            <h2 className="mt-1 font-display text-xl font-extrabold uppercase leading-tight tracking-tight">{f.title}</h2>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: st.color, color: st.color }}>
                <Icon className="size-3.5" aria-hidden />
                {st.label}
              </span>
              {f.critical && <span className="rounded-full border border-[#F5EEDF] px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider">{PROOF.criticalTag}</span>}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={d.close} className="grid size-9 shrink-0 place-items-center rounded-full border border-[#4a4238] hover:border-[#F5EEDF]">
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <dl className="min-h-0 flex-1 divide-y divide-[#2a241d] overflow-y-auto px-4">
          <Row k={d.kind}>{f.kind}</Row>
          <Row k={d.category}>{f.category}</Row>
          <Row k={d.setup}>{f.setup}</Row>
          <Row k={d.action}>{f.action}</Row>
          <Row k={d.decision}>{f.decision}</Row>
          <Row k={d.workflowStatus}><span className="font-mono text-[13px]">{f.workflowStatus}</span></Row>
          <Row k={d.execution}>{f.executionSucceeds ? d.executionYes : d.executionNo}</Row>
          <Row k={d.expectedRevert}>
            {f.expectedRevertProposed ? <span className="font-mono text-[13px] font-bold text-[#ff6a5e]">{f.expectedRevertProposed}</span> : <span className="text-[#a89f90]">{d.noRevert}</span>}
          </Row>
          <Row k={d.assertions}>
            <ul className="mt-1 space-y-1.5">
              {f.assertions.map((a) => (
                <li key={a} className="flex gap-2 text-[14px]">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[#FF5B14]" />
                  {a}
                </li>
              ))}
            </ul>
          </Row>
        </dl>
      </motion.aside>
    </>
  )
}

export default function Proof() {
  const reduced = !!useReducedMotion()
  const [filter, setFilter] = useState(PROOF.filters[0].id)
  const [open, setOpen] = useState<Fixture | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)

  const counters = useMemo(() => PROOF.counters.map((c) => ({ c, ...count(FIXTURES, c) })).filter((x) => x.d > 0), [])
  const active = PROOF.filters.find((x) => x.id === filter) ?? PROOF.filters[0]
  const shown = FIXTURES.filter((f) => matches(f, active))
  const critical = FIXTURES.filter((f) => f.critical).length

  const close = () => {
    setOpen(null)
    window.setTimeout(() => trigger.current?.focus(), 0)
  }

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-4 py-5 md:px-6 md:py-6">
          <header>
            <p className={label}>{PROOF.eyebrow}</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight md:text-5xl">{PROOF.title}</h1>
            <p className="mt-2 max-w-2xl text-[#c9c0b0] md:text-lg">{PROOF.intro}</p>
          </header>

          <section aria-label={PROOF.countersLabel}>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {counters.map(({ c, n, d }) => (
                <li key={c.kind} className="rounded-xl border border-[#2f2922] bg-[#0b0a08] px-4 py-3">
                  <p className="text-[15px] font-semibold text-[#F5EEDF]">{fill(c.template, { n, d })}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#2a241d]" aria-hidden>
                    <div className="h-full rounded-full bg-[#FF5B14]" style={{ width: `${d ? (n / d) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[11px] text-[#a89f90]">{fill(PROOF.totalTemplate, { d: FIXTURES.length, c: critical })}</p>
          </section>

          <section aria-label={PROOF.wallLabel}>
            <div role="group" aria-label={PROOF.filtersLabel} className="flex flex-wrap gap-2">
              {PROOF.filters.map((x) => {
                const n = FIXTURES.filter((f) => matches(f, x)).length
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={filter === x.id}
                    onClick={() => setFilter(x.id)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${filter === x.id ? 'border-[#FF5B14] bg-[#FF5B14] text-[#120f0c]' : 'border-[#4a4238] text-[#d8cfbf] hover:border-[#F5EEDF]'}`}
                  >
                    {x.label} <span className="font-mono text-[11px] opacity-75">{n}</span>
                  </button>
                )
              })}
            </div>

            {shown.length ? (
              <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 p-1.5">
                {shown.map((f) => (
                  <li key={f.id}>
                    <Tile
                      f={f}
                      onOpen={(fx, el) => {
                        trigger.current = el
                        setOpen(fx)
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-[#3a332b] px-4 py-5 text-sm text-[#a89f90]">{PROOF.empty}</p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label={PROOF.legendTitle}>
              {(Object.keys(OUTCOME_STYLE) as (keyof typeof OUTCOME_STYLE)[]).map((k) => {
                const st = OUTCOME_STYLE[k]
                const Icon = ICONS[st.icon]
                return (
                  <span key={k} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: st.color }}>
                    <Icon className="size-4" aria-hidden />
                    {st.label}
                  </span>
                )
              })}
              <span className="text-[13px] text-[#a89f90]">{PROOF.criticalNote}</span>
            </div>
          </section>

          <section aria-labelledby="fits-title" className="border-t border-[#2a241d] pt-8">
            <h2 id="fits-title" className="font-display text-2xl font-extrabold uppercase tracking-tight md:text-4xl">{PROOF.fits.title}</h2>
            <p className="mt-2 max-w-2xl text-[#c9c0b0]">{PROOF.fits.intro}</p>
            <ul className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {PROOF.fits.columns.map((col) => (
                <li key={col.id} className={`rounded-2xl border p-4 ${col.highlight ? 'border-[#FF5B14] bg-[#FF5B14]/8' : 'border-[#2f2922] bg-[#0b0a08]'}`}>
                  <h3 className={`font-display text-lg font-extrabold uppercase tracking-tight ${col.highlight ? 'text-[#FF5B14]' : ''}`}>{col.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#d8cfbf]">{col.line}</p>
                  {col.points && (
                    <ul className="mt-2 space-y-1.5">
                      {col.points.map((p) => (
                        <li key={p} className="flex gap-2 text-[14px] text-[#F5EEDF]">
                          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[#FF5B14]" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[12px] text-[#a89f90]">{PROOF.fits.footnote}</p>
          </section>

          <footer className="border-t border-[#2a241d] pb-6 pt-4">
            <p className="font-mono text-[12px] text-[#E3A73B]">{PROOF.footer}</p>
          </footer>
        </div>
      </div>

      <AnimatePresence>{open && <Drawer key={open.id} f={open} onClose={close} reduced={reduced} />}</AnimatePresence>
    </div>
  )
}
