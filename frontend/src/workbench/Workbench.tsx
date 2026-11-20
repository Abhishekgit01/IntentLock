import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, MonitorOff, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { BADGES, STAMP_TEXT, TOUR, type InspectorTab, type StampKind } from './scenes'
import { useWorkbench } from './useWorkbench'
import { Panel } from './Panel'
import { Inspector } from './Inspector'

const Scene = lazy(() => import('./Scene'))

function detectWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[workbench] 3D scene failed', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function NoWebGL() {
  return (
    <div role="alert" className="absolute inset-0 grid place-items-center p-8 text-center">
      <div className="max-w-sm">
        <MonitorOff className="mx-auto size-8 text-[#FF5B14]" aria-hidden />
        <p className="mt-4 font-display text-2xl font-extrabold uppercase">3D view unavailable</p>
        <p className="mt-2 text-[#a89f90]">This browser could not start WebGL. The controls and the inspector still run every scenario and show each result.</p>
      </div>
    </div>
  )
}

/**
 * The verdict stamp lives in the caption strip, as DOM, so it can never sit on top of a node label in the scene.
 */
function HudStamp({ kind, revert, reduced }: { kind: StampKind; revert?: string; reduced: boolean }) {
  const color = kind === 'ok' ? '#7ACB8A' : '#FF3B30'
  const text = STAMP_TEXT[kind]
  return (
    <motion.div
      key={kind}
      role="status"
      initial={reduced ? false : { scale: 1.45, opacity: 0, rotate: -10 }}
      animate={{ scale: 1, opacity: 1, rotate: -3 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      style={{ borderColor: color, color }}
      className="pointer-events-none shrink-0 rounded-lg border-[3px] bg-[#0b0a08]/92 px-4 py-2 text-center backdrop-blur"
    >
      <p className="font-display text-2xl font-extrabold uppercase leading-none tracking-[0.06em] md:text-3xl">{text.title}</p>
      <p className="mt-1 font-mono text-[11px] font-bold tracking-wider">{revert ?? text.sub}</p>
      {revert && <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]">{text.sub}</p>}
    </motion.div>
  )
}

export default function Workbench() {
  const wb = useWorkbench()
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [tab, setTab] = useState<InspectorTab>('Checks')
  useEffect(() => {
    setWebgl(detectWebGL())
  }, [])

  // Escape skips the tour
  useEffect(() => {
    if (wb.tourStep === null) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') wb.endTour()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [wb.tourStep, wb.endTour, wb])

  const caption = wb.tourStep !== null && wb.runStatus !== 'running' ? TOUR[wb.tourStep].caption : wb.derived.caption
  const source = wb.derived.receipt.source
  // the MOCK DATA badge stays until the data source is a real chain
  const badges = BADGES.filter((b) => !(b === 'MOCK DATA' && source === 'chain'))
  const inspector = <Inspector wb={wb} tab={tab} setTab={setTab} onClose={() => setInspectorOpen(false)} />

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-[#070605] text-[#F5EEDF] lg:flex-row lg:overflow-hidden">
      <title>Intent workbench</title>

      {/* scene + desktop inspector drawer */}
      <div className="relative order-1 h-[62svh] min-h-[360px] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1">
        <div className={`absolute inset-y-0 left-0 right-0 ${inspectorOpen ? 'lg:right-[400px]' : ''}`}>
          <div role="img" aria-label="Interactive 3D workbench. Use the controls panel to run scenarios and the inspector to read the details." className="absolute inset-0">
            {webgl === false ? (
              <NoWebGL />
            ) : webgl ? (
              <SceneBoundary fallback={<NoWebGL />}>
                <Suspense fallback={<p className="absolute inset-0 grid place-items-center font-mono text-sm text-[#a89f90]">Loading scene…</p>}>
                  <Scene wb={wb} />
                </Suspense>
              </SceneBoundary>
            ) : null}
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4">
            <Link to="/demo" className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[#3a332b] bg-[#0e0c0a]/85 px-4 py-2 text-sm font-semibold backdrop-blur hover:border-[#FF5B14]">
              <ArrowLeft className="size-4" aria-hidden />
              Back to demo
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ul className="flex flex-wrap gap-2" aria-label="Data notices">
                {badges.map((b) => (
                  <li key={b} className="rounded-full border border-[#E3A73B] bg-[#0e0c0a]/85 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#E3A73B] backdrop-blur">
                    {b}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setInspectorOpen((o) => !o)}
                aria-expanded={inspectorOpen}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[#FF5B14] bg-[#0e0c0a]/85 px-4 py-1.5 text-sm font-bold text-[#FF5B14] backdrop-blur hover:bg-[#FF5B14] hover:text-[#120f0c]"
              >
                {inspectorOpen ? <PanelRightClose className="size-4" aria-hidden /> : <PanelRightOpen className="size-4" aria-hidden />}
                Inspector
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 lg:p-6">
            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-end">
              <p aria-live="polite" className="max-w-3xl flex-1 rounded-xl border border-[#2f2922] bg-[#0e0c0a]/88 px-4 py-3 font-display text-lg font-bold leading-snug backdrop-blur md:text-2xl">
                {caption}
              </p>
              {wb.derived.stamp && <HudStamp kind={wb.derived.stamp} revert={wb.derived.stamp === 'revert' ? wb.derived.result?.revert : undefined} reduced={wb.reducedMotion} />}
            </div>
            <p className="mt-2 hidden font-mono text-[11px] uppercase tracking-wider text-[#8a8071] lg:block">Drag to orbit · scroll to zoom · click any object</p>
          </div>
        </div>

        {inspectorOpen && <div className="absolute inset-y-0 right-0 hidden w-[400px] lg:block">{inspector}</div>}
      </div>

      <aside aria-label="Workbench controls" className="order-2 w-full shrink-0 border-t border-[#2a241d] bg-[#0b0a08] lg:w-[360px] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <Panel wb={wb} />
      </aside>

      {/* stacked inspector for narrow screens */}
      {inspectorOpen && <div className="order-3 h-[640px] shrink-0 border-t border-[#2a241d] lg:hidden">{inspector}</div>}
    </div>
  )
}
