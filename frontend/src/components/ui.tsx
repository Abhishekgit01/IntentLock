import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { ArrowUpRight, Check, Copy, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { SYNTHETIC_LABEL } from '@/lib/data'
import type { StampKind } from '@/lib/types'

export const fmtEth = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtClock(ms: number, tenths = false) {
  const total = Math.max(0, ms) / 1000
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return tenths ? `${base}.${Math.floor((total * 10) % 10)}` : base
}

/* ---------- motion primitives ---------- */

/** Fade-and-rise when scrolled into view. */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className = '',
  scale = 1,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  scale?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, scale: scale === 1 ? 1 : 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

export interface Part {
  t: string
  /** accent orange emphasis */
  em?: boolean
  /** highlight block behind the words */
  hl?: boolean
  br?: boolean
}

/** Bold uppercase neo-grotesque headline inspired by the darkroom reference; fades smoothly as a unit. */
export function Headline({ parts, className = '', as: Tag = 'h1', delay = 0 }: { parts: Part[]; className?: string; as?: 'h1' | 'h2'; delay?: number; plain?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay, ease: [0.2, 0.8, 0.2, 1] }}>
      <Tag className={className}>
        {parts.map((p, i) => (
          <span key={i}>
            {p.br && <br />}
            {p.hl ? (
              <span className="relative inline-block rounded-md bg-flame px-2.5 py-0.5 text-on-flame [text-shadow:none]">
                {p.t}
              </span>
            ) : (
              <span className={p.em ? 'text-flame-deep' : ''}>{p.t}</span>
            )}
            {i < parts.length - 1 && !parts[i + 1].br ? ' ' : ''}
          </span>
        ))}
      </Tag>
    </motion.div>
  )
}

export function PageHeader({ index, label, parts, children }: { index: string; label: string; parts: Part[]; children?: ReactNode }) {
  return (
    <header className="pb-12 pt-32 md:pb-16 md:pt-40">
      <motion.p
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45 }}
        className="eyebrow inline-flex items-center gap-3 rounded-full border border-edge bg-paper px-4 py-2"
      >
        <span className="font-bold text-flame-deep">{index}</span>
        {label}
      </motion.p>
      <Headline as="h1" parts={parts} className="display-type mt-6 max-w-4xl text-[clamp(2.6rem,6vw,5.25rem)]" />
      {children && (
        <Reveal delay={0.2} y={14}>
          <p className="mt-6 max-w-2xl text-lg text-soft md:text-xl">{children}</p>
        </Reveal>
      )}
    </header>
  )
}

export function CountUp({ to, decimals = 0, suffix = '', className = '' }: { to: number; decimals?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduced = useReducedMotion()
  const [v, setV] = useState(reduced ? to : 0)
  useEffect(() => {
    if (!inView) return
    if (reduced) {
      setV(to)
      return
    }
    const c = animate(0, to, { duration: 1.4, ease: [0.2, 0.8, 0.2, 1], onUpdate: setV })
    return () => c.stop()
  }, [inView, to, reduced])
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {v.toFixed(decimals)}
      {suffix}
    </span>
  )
}

/** Card that leans toward the cursor. */
export function Tilt({ children, className = '', max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [max, -max]), { stiffness: 160, damping: 18 })
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-max, max]), { stiffness: 160, damping: 18 })
  return (
    <motion.div
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const b = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - b.left) / b.width - 0.5)
        y.set((e.clientY - b.top) / b.height - 0.5)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}

export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  const row = (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden>
      {items.map((t, i) => (
        <li key={i} className="flex items-center gap-8 whitespace-nowrap">
          <span>{t}</span>
          <span className="text-flame">✦</span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className={`overflow-hidden ${className}`} role="presentation">
      <p className="sr-only">{items.join('. ')}</p>
      <div className="marquee-track flex w-max">
        {row}
        {row}
      </div>
    </div>
  )
}

/** Link-styled-as-button with a sliding arrow. */
export function ArrowLink({ to, children, variant = 'primary', className = '' }: { to: string; children: ReactNode; variant?: 'primary' | 'ghost' | 'dark'; className?: string }) {
  return (
    <Link to={to} className={`btn btn-${variant} group ${className}`}>
      {children}
      <ArrowUpRight className="size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
    </Link>
  )
}

/* ---------- content primitives ---------- */

export function SyntheticBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 border-ok/80 bg-ok/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase leading-none tracking-wider text-ok ${className}`}
    >
      <ShieldCheck className="size-3.5 shrink-0 text-ok" aria-hidden />
      {SYNTHETIC_LABEL}
    </span>
  )
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* clipboard unavailable: value stays selectable on screen */
      }
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return (
    <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={copy} aria-label={`Copy ${label}`} className="btn btn-ghost btn-sm shrink-0 !gap-2">
      {copied ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span className="font-mono text-xs uppercase tracking-wider">{copied ? 'Copied' : 'Copy'}</span>
      <span className="sr-only" role="status">{copied ? `${label} copied to clipboard` : ''}</span>
    </motion.button>
  )
}

/** Renders `value` with every character that differs from `against` highlighted. */
export function HashDiff({ value, against }: { value: string; against: string }) {
  return (
    <span className="break-all font-mono">
      {value.split('').map((c, i) => (
        <span key={i} className={c !== against[i] ? 'hash-diff-bad' : undefined}>
          {c}
        </span>
      ))}
    </span>
  )
}

const STAMPS: Record<StampKind, { text: string; sub: string; tone: 'bad' | 'ok' }> = {
  reverted: { text: 'Reverted by guard', sub: 'IntentMismatch() · 1 of 3 attested', tone: 'bad' },
  verified: { text: 'Verified', sub: '2 of 3 attested · intent matches', tone: 'ok' },
  drained: { text: 'Drained', sub: 'No guard in the path', tone: 'bad' },
}

export function Stamp({ kind, className = '' }: { kind: StampKind; className?: string }) {
  const cfg = STAMPS[kind]
  const color = cfg.tone === 'bad' ? 'text-bad border-bad' : 'text-ok border-ok'
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, scale: 2.0, rotate: -16 }}
      animate={{ opacity: 1, scale: 1, rotate: -7 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      className={`stamp-ink pointer-events-none select-none ${className}`}
    >
      <div className={`border-[6px] bg-paper/90 p-1.5 ${color}`} style={{ borderRadius: 18 }}>
        <div className={`border-2 px-5 py-3 text-center md:px-8 md:py-4 ${color}`} style={{ borderRadius: 12 }}>
          <p className="font-display text-3xl font-extrabold uppercase leading-none tracking-[0.04em] md:text-6xl">{cfg.text}</p>
          <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] md:text-xs">{cfg.sub}</p>
        </div>
      </div>
    </motion.div>
  )
}

/** Hidden SVG filters shared by stamps: rough edge displacement plus ink speckle. */
export function InkFilters() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" className="pointer-events-none absolute">
      <defs>
        <filter id="ink-rough" x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="11" result="speck" />
          <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 11 -4.6" result="speckMask" />
          <feComposite in="rough" in2="speckMask" operator="in" />
        </filter>
      </defs>
    </svg>
  )
}

interface BoundaryProps {
  label: string
  children: ReactNode
  className?: string
}
export class SafeBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn(`[IntentLock] ${this.props.label} failed to render`, error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className={`card-soft flex flex-col items-start gap-3 p-6 ${this.props.className ?? ''}`}>
        <TriangleAlert className="size-6 text-flame-deep" aria-hidden />
        <p className="font-display text-2xl font-bold uppercase">{this.props.label} could not render on this device.</p>
        <p className="text-soft">The same facts are in the event ledger and tables, so the demo can continue.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => this.setState({ failed: false })}>Try again</button>
      </div>
    )
  }
}
