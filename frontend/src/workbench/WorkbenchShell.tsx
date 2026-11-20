import { lazy, Suspense, useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { SHELL, type ActId } from './story'
import Attack from './acts/Attack'
import Proof from './acts/Proof'
import Future from './acts/Future'

// Act 2 is the existing workbench, mounted unchanged.
const Defense = lazy(() => import('./Workbench'))

const Loading = () => <p className="absolute inset-0 grid place-items-center font-mono text-sm text-[#a89f90]">{SHELL.loading}</p>

export default function WorkbenchShell() {
  const [act, setAct] = useState<ActId>('attack')
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKey(e: KeyboardEvent, i: number) {
    const last = SHELL.acts.length - 1
    const next = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next === null) return
    e.preventDefault()
    const id = SHELL.acts[next].id
    setAct(id)
    refs.current[id]?.focus()
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#070605] text-[#F5EEDF]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#2a241d] bg-[#0b0a08] px-3 sm:px-4">
        {act !== 'defense' ? (
          <Link to="/demo" aria-label={SHELL.backLabel} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#3a332b] px-2.5 py-1.5 text-sm font-semibold hover:border-[#FF5B14] sm:px-3">
            <ArrowLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">{SHELL.backLabel}</span>
          </Link>
        ) : null}
        <div role="tablist" aria-label={SHELL.tablistLabel} className="mx-auto flex min-w-0 gap-0 sm:gap-1 overflow-x-auto rounded-full border border-[#3a332b] bg-[#100e0b] p-1 [scrollbar-width:none]">
          {SHELL.acts.map((a, i) => (
            <button
              key={a.id}
              ref={(el) => {
                refs.current[a.id] = el
              }}
              role="tab"
              id={`act-tab-${a.id}`}
              aria-selected={act === a.id}
              aria-controls="act-panel"
              tabIndex={act === a.id ? 0 : -1}
              onClick={() => setAct(a.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1.5 font-display text-[12px] font-extrabold uppercase tracking-tight transition-colors sm:px-5 sm:text-sm ${
                act === a.id ? 'bg-[#FF5B14] text-[#120f0c]' : 'text-[#c9c0b0] hover:text-[#F5EEDF]'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <span aria-hidden className="hidden w-[7.5rem] shrink-0 sm:block" />
      </header>

      {SHELL.noticeActs.includes(act) && (
        <ul aria-label="Data notices" className="flex shrink-0 flex-wrap justify-center gap-2 border-b border-[#2a241d] bg-[#0b0a08] px-3 py-1.5">
          {SHELL.badges.map((b) => (
            <li key={b} className="rounded-full border border-[#E3A73B] px-3 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#E3A73B]">
              {b}
            </li>
          ))}
        </ul>
      )}

      {/* the transform makes this the containing block for the existing workbench's `fixed inset-0` root */}
      <div id="act-panel" role="tabpanel" aria-labelledby={`act-tab-${act}`} className="relative min-h-0 flex-1 overflow-hidden" style={{ transform: 'translateZ(0)' }}>
        {act === 'attack' && <Attack onDefense={() => setAct('defense')} />}
        {act === 'proof' && <Proof />}
        {act === 'future' && <Future />}
        {act === 'defense' && (
          <Suspense fallback={<Loading />}>
            <Defense />
          </Suspense>
        )}
      </div>
    </div>
  )
}
