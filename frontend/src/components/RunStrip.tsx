import { Play, RotateCcw } from 'lucide-react'
import { SCRIPTS } from '@/lib/script'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { fmtClock } from './ui'

/** Compact scenario indicator + replay control used above the verifier and lifecycle views. */
export function RunStrip() {
  const { state, script, run } = useIntentLock()
  const running = state.status === 'running'
  return (
    <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="eyebrow">Following</span>
        <span className="font-display font-bold uppercase">{SCRIPTS[state.scenario].tabLabel}</span>
        <span className="font-mono tabular-nums text-soft">{state.status === 'idle' ? 'ready' : `T+${fmtClock(state.elapsedMs)} / ${fmtClock(state.durationMs)}`}</span>
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => run()}>
        {running || state.status === 'done' ? <RotateCcw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden fill="currentColor" />}
        {running || state.status === 'done' ? 'Replay' : script.runLabel}
      </button>
    </div>
  )
}
