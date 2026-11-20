import type { ReplayData } from './types'

let cachedReplay: ReplayData | null = null
let fetchPromise: Promise<ReplayData | null> | null = null

export async function loadReplayData(): Promise<ReplayData | null> {
  if (cachedReplay) return cachedReplay
  if (fetchPromise) return fetchPromise

  fetchPromise = (async () => {
    try {
      // Try root /run.json first, then fallback to /evidence/run.json
      let res = await fetch('/run.json')
      if (!res.ok) {
        res = await fetch('/evidence/run.json')
      }
      if (!res.ok) {
        console.warn('Could not load run.json for replay')
        return null
      }
      const data = await res.json()
      if (data && data.replay) {
        cachedReplay = data.replay as ReplayData
        return cachedReplay
      }
      console.warn('run.json loaded but replay section is missing')
      return null
    } catch (err) {
      console.warn('Failed to load replay data:', err)
      return null
    }
  })()

  return fetchPromise
}

export function getCachedReplay(): ReplayData | null {
  return cachedReplay
}

export function formatOrNotCaptured(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return 'not captured'
  return String(val)
}
