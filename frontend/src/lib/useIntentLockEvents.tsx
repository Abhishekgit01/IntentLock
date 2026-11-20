import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deriveState, SCRIPTS } from './script'
import type { IntentLockApi, RunStatus, ScenarioId } from './types'

const TICK_MS = 100

/**
 * The single source of truth for the whole app.
 *
 * Today it plays a scripted, deterministic mock stream (see script.ts). To go live, replace the body of
 * this hook with contract event listeners that produce the same IntentLockState shape;
 * no component imports anything else.
 */
export function useIntentLockEvents(): IntentLockApi {
  const [scenario, setScenario] = useState<ScenarioId>('attack')
  const [elapsed, setElapsed] = useState(0)
  const [status, setStatus] = useState<RunStatus>('idle')
  const timer = useRef<number | undefined>(undefined)
  const scenarioRef = useRef<ScenarioId>('attack')

  const stop = useCallback(() => {
    if (timer.current !== undefined) window.clearInterval(timer.current)
    timer.current = undefined
  }, [])

  const select = useCallback(
    (id: ScenarioId) => {
      stop()
      scenarioRef.current = id
      setScenario(id)
      setElapsed(0)
      setStatus('idle')
    },
    [stop],
  )

  const run = useCallback(
    (id?: ScenarioId) => {
      stop()
      const target = id ?? scenarioRef.current
      scenarioRef.current = target
      setScenario(target)
      setElapsed(0)
      setStatus('running')
      const duration = SCRIPTS[target].durationMs
      const t0 = performance.now()
      timer.current = window.setInterval(() => {
        const el = performance.now() - t0
        if (el >= duration) {
          stop()
          setElapsed(duration)
          setStatus('done')
        } else {
          setElapsed(el)
        }
      }, TICK_MS)
    },
    [stop],
  )

  const reset = useCallback(() => select(scenarioRef.current), [select])

  useEffect(() => stop, [stop])

  const state = useMemo(() => deriveState(scenario, elapsed, status), [scenario, elapsed, status])
  return useMemo(() => ({ state, script: SCRIPTS[scenario], select, run, reset }), [state, scenario, select, run, reset])
}

const Ctx = createContext<IntentLockApi | null>(null)

export function IntentLockProvider({ children }: { children: ReactNode }) {
  const api = useIntentLockEvents()
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useIntentLock(): IntentLockApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useIntentLock must be used inside <IntentLockProvider>')
  return v
}
