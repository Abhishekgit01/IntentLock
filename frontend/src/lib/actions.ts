import type { NavigateFunction } from 'react-router'
import type { ScenarioId } from './types'

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Used by the nav and home page: jump to the demo page and play the 20 s attack. */
export function runAttackFromAnywhere(run: (id?: ScenarioId) => void, navigate: NavigateFunction) {
  navigate('/demo')
  run('attack')
}
