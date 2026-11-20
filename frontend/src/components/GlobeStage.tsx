import { useEffect, useState } from 'react'
import { Box, MonitorOff } from 'lucide-react'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { useTheme } from '@/lib/theme'
import { VERIFIERS } from '@/lib/data'
import type { VerifierStatus } from '@/lib/types'

function detectWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

const R = 190
const C = 300
const TILT = (22 * Math.PI) / 180
const latitudes = [-60, -30, 0, 30, 60].map((deg) => {
  const phi = (deg * Math.PI) / 180
  return { cy: C - R * Math.sin(phi) * Math.cos(TILT), rx: R * Math.cos(phi), ry: R * Math.cos(phi) * Math.sin(TILT) }
})

const PINS: Record<string, { x: number; y: number; lx: number; anchor: 'start' | 'end' }> = {
  A: { x: 236, y: 232, lx: -16, anchor: 'end' },
  B: { x: 392, y: 262, lx: 16, anchor: 'start' },
  C: { x: 322, y: 396, lx: 16, anchor: 'start' },
}

/** Placeholder for the 3D verifier globe. A flat SVG stands in until the WebGL module lands. */
export function GlobeStage() {
  const { state } = useIntentLock()
  const { isDark } = useTheme()
  const [webgl, setWebgl] = useState<boolean | null>(null)
  useEffect(() => {
    setWebgl(detectWebGL())
  }, [])
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5)

  const tone: Record<VerifierStatus, { fill: string; label: string }> = {
    waiting: { fill: isDark ? '#FF621F' : '#FF5B14', label: 'waiting' },
    attested: { fill: isDark ? '#7ACB8A' : '#2C7A45', label: 'attested' },
    mismatch: { fill: isDark ? '#FF5A36' : '#B3261E', label: 'mismatch' },
  }
  const strokeMain = isDark ? '#E2DFD7' : '#1E1913'
  const sphereFill = isDark ? '#0B0A09' : '#F5EEDF'
  const subFill = isDark ? '#A49B8E' : '#5E5446'
  const tickMajor = isDark ? '#FF621F' : '#1E1913'
  const tickMinor = isDark ? '#4B4339' : '#1E1913'

  return (
    <figure className={`relative mx-auto aspect-square w-full max-w-[600px] overflow-hidden rounded-[36px] border-2 border-edge ${isDark ? 'bg-paper' : 'bg-flame'}`}>
      <svg
        viewBox="0 0 600 600"
        role="img"
        aria-label={`Placeholder verifier globe. Verifier A ${state.verifiers.A}, verifier B ${state.verifiers.B}, verifier C ${state.verifiers.C}.`}
        className="absolute inset-0 size-full"
      >
        <g className="spin-slow" aria-hidden>
          {ticks.map((deg) => {
            const major = deg % 30 === 0
            const a = (deg * Math.PI) / 180
            const r2 = major ? 232 : 241
            return <line key={deg} x1={C + 252 * Math.cos(a)} y1={C + 252 * Math.sin(a)} x2={C + r2 * Math.cos(a)} y2={C + r2 * Math.sin(a)} stroke={major ? tickMajor : tickMinor} strokeWidth={major ? 2.5 : 1.2} />
          })}
        </g>
        <circle cx={C} cy={C} r={R} fill={sphereFill} stroke={isDark ? '#383129' : '#1E1913'} strokeWidth="2.5" />
        <g fill="none" stroke={strokeMain} strokeOpacity={isDark ? '0.22' : '0.28'} strokeWidth="1.2" aria-hidden>
          {latitudes.map((l, i) => (
            <ellipse key={i} cx={C} cy={l.cy} rx={l.rx} ry={Math.max(l.ry, 0.5)} vectorEffect="non-scaling-stroke" />
          ))}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ellipse key={i} className="meridian" style={{ ['--i' as string]: i }} cx={C} cy={C} rx={R} ry={R} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <g aria-hidden>
          {VERIFIERS.map((v) => {
            const p = PINS[v.id]
            const st = state.verifiers[v.id]
            return (
              <line
                key={v.id}
                x1={p.x}
                y1={p.y}
                x2={C}
                y2={C}
                stroke={st === 'waiting' ? strokeMain : tone[st].fill}
                strokeOpacity={st === 'waiting' ? (isDark ? 0.38 : 0.5) : 1}
                strokeWidth="2.5"
                strokeDasharray="4 7"
                className={state.phase === 'attesting' && st === 'waiting' ? 'flow-march' : undefined}
              />
            )
          })}
        </g>
        <g aria-hidden>
          <rect x={C - 30} y={C - 28} width="60" height="56" fill={isDark ? '#1C1915' : '#1E1913'} stroke={isDark ? '#FF621F' : 'none'} strokeWidth="1.5" rx="14" />
          <text x={C} y={C - 3} textAnchor="middle" fill={isDark ? '#E2DFD7' : '#F5EEDF'} fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="700">GUARD</text>
          <text x={C} y={C + 14} textAnchor="middle" fill={isDark ? '#FF621F' : '#FF5B14'} fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="700">{state.attested} of 3</text>
        </g>
        {VERIFIERS.map((v) => {
          const p = PINS[v.id]
          const t = tone[state.verifiers[v.id]]
          return (
            <g key={v.id}>
              <circle className="pin-pulse" cx={p.x} cy={p.y} r="7" fill="none" stroke={t.fill} strokeWidth="2" />
              <circle cx={p.x} cy={p.y} r="9" fill={t.fill} stroke={isDark ? '#0B0A09' : '#1E1913'} strokeWidth="3" />
              <text x={p.x + p.lx} y={p.y - 3} textAnchor={p.anchor} fill={strokeMain} fontFamily="JetBrains Mono, monospace" fontSize="12.5" fontWeight="700">{v.name.toUpperCase()}</text>
              <text x={p.x + p.lx} y={p.y + 13} textAnchor={p.anchor} fill={subFill} fontFamily="JetBrains Mono, monospace" fontSize="11">{v.city} · {t.label}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className={`pointer-events-none absolute left-5 top-5 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider ${isDark ? 'border border-edge bg-sand text-ink' : 'bg-ink text-cream'}`}>
        Verifier globe · placeholder
      </figcaption>
      <div className="absolute inset-x-4 bottom-4 flex items-center gap-2.5 rounded-2xl border border-edge bg-paper/95 px-4 py-2.5 text-sm text-ink">
        {webgl === false ? (
          <>
            <MonitorOff className="size-4 shrink-0 text-flame-deep" aria-hidden />
            <span>WebGL is unavailable here, so the 2D verifier map is shown. Nothing else is lost.</span>
          </>
        ) : (
          <>
            <Box className="size-4 shrink-0 text-flame-deep" aria-hidden />
            <span>3D globe slot reserved. Pins already follow the live verifier states.</span>
          </>
        )}
      </div>
    </figure>
  )
}
