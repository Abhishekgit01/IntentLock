import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { ROADMAP, type DiffArt, type PqArt, type SchemaArt } from '../roadmap'

const C = { cream: '#F5EEDF', dim: '#8a8071', line: '#3a332b', orange: '#FF5B14', amber: '#E3A73B', green: '#7ACB8A' }
const label = 'font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#a89f90]'

/** Cycles 0..count-1 on a timer. Does nothing when motion is reduced. */
function useCycle(count: number, ms: number, enabled: boolean) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const t = window.setInterval(() => setI((n) => (n + 1) % count), ms)
    return () => window.clearInterval(t)
  }, [count, ms, enabled])
  return i
}

/* (a) key glyph morphing from a compact signature to a much longer one */

function KeyGlyph({ long, color }: { long: boolean; color: string }) {
  const reduced = !!useReducedMotion()
  const d = { duration: reduced ? 0 : 0.9, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }
  const teeth = [0, 1, 2, 3, 4, 5]
  return (
    <g>
      <circle cx="70" cy="60" r="30" fill="none" stroke={color} strokeWidth="10" />
      <circle cx="70" cy="60" r="8" fill={color} />
      <motion.rect
        x="98"
        y="54"
        width="360"
        height="12"
        rx="3"
        fill={color}
        style={{ transformBox: 'fill-box', transformOrigin: 'left center' }}
        initial={false}
        animate={{ scaleX: long ? 1 : 130 / 360 }}
        transition={d}
      />
      {teeth.map((i) => {
        const longX = 150 + i * 56
        const shortX = 140 + i * 28
        const show = long || i < 2
        return (
          <motion.rect
            key={i}
            x={longX}
            y="66"
            width="10"
            height={i % 2 ? 18 : 28}
            rx="2"
            fill={color}
            initial={false}
            animate={{ opacity: show ? 1 : 0, x: long ? 0 : shortX - longX }}
            transition={d}
          />
        )
      })}
    </g>
  )
}

function PqIllustration({ art }: { art: PqArt }) {
  const reduced = !!useReducedMotion()
  const phase = useCycle(2, art.cycleMs, !reduced)
  const long = phase === 1
  if (reduced) {
    return (
      <div className="grid gap-4">
        {[false, true].map((l, i) => (
          <figure key={String(l)} className="rounded-xl border border-[#2f2922] p-3">
            <svg viewBox="0 0 520 120" className="h-auto w-full" aria-hidden>
              <KeyGlyph long={l} color={l ? C.orange : C.cream} />
            </svg>
            <figcaption className="mt-1 flex justify-between font-mono text-[12px]"><b style={{ color: l ? C.orange : C.cream }}>{i ? art.to : art.from}</b><span className="text-[#a89f90]">{art.captions[i]}</span></figcaption>
          </figure>
        ))}
      </div>
    )
  }
  return (
    <figure className="rounded-xl border border-[#2f2922] bg-[#0b0a08] p-4" aria-label={`${art.from} to ${art.to}`}>
      <svg viewBox="0 0 520 120" className="h-auto w-full" aria-hidden>
        <KeyGlyph long={long} color={long ? C.orange : C.cream} />
      </svg>
      <figcaption className="mt-2 flex items-end justify-between gap-3">
        <span className="relative h-8 w-40 font-display text-2xl font-extrabold uppercase">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={String(long)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="absolute inset-0 whitespace-nowrap" style={{ color: long ? C.orange : C.cream }}>
              {long ? art.to : art.from}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="font-mono text-[12px] text-[#a89f90]">{art.captions[long ? 1 : 0]}</span>
      </figcaption>
    </figure>
  )
}

/* (b) two independent decoders; any difference quarantines */

function Verifier({ name, outLabel, text, differs }: { name: string; outLabel: string; text: string; differs: boolean }) {
  return (
    <div className={`min-w-0 flex-1 rounded-xl border p-3 transition-colors ${differs ? 'border-[#E3A73B]' : 'border-[#2f2922]'}`}>
      <p className={label}>{name}</p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-[#6a6154]">{outLabel}</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className={`mt-1 min-h-[3rem] break-words font-mono text-[13px] leading-snug ${differs ? 'text-[#E3A73B]' : 'text-[#F5EEDF]'}`}>
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

function Verdict({ result, note, reduced }: { result: 'ATTEST' | 'QUARANTINED'; note: string; reduced: boolean }) {
  const q = result === 'QUARANTINED'
  return (
    <motion.div
      key={result}
      initial={reduced ? false : { scale: 1.5, opacity: 0, rotate: q ? -10 : 0 }}
      animate={{ scale: 1, opacity: 1, rotate: q ? -3 : 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="flex items-center gap-3 rounded-lg border-2 px-4 py-2.5"
      style={{ borderColor: q ? C.amber : C.green, color: q ? C.amber : C.green }}
    >
      {q ? <TriangleAlert className="size-6 shrink-0" aria-hidden /> : <ShieldCheck className="size-6 shrink-0" aria-hidden />}
      <span>
        <span className="block font-display text-xl font-extrabold uppercase leading-none tracking-tight">{result}</span>
        <span className="block font-mono text-[11px] font-bold">{note}</span>
      </span>
    </motion.div>
  )
}

function DiffIllustration({ art }: { art: DiffArt }) {
  const reduced = !!useReducedMotion()
  const idx = useCycle(art.rounds.length, art.roundMs, !reduced)
  const rounds = reduced ? art.rounds : [art.rounds[idx]]
  return (
    <figure className="rounded-xl border border-[#2f2922] bg-[#0b0a08] p-4">
      <p className="inline-block rounded-full border border-[#4a4238] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[#d8cfbf]">{art.input}</p>
      <div className="mt-3 grid gap-4">
        {rounds.map((r) => (
          <div key={r.id} className="grid gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Verifier name={art.verifiers[0]} outLabel={art.outputLabel} text={r.outputs[0]} differs={r.outputs[0] !== r.outputs[1]} />
              <Verifier name={art.verifiers[1]} outLabel={art.outputLabel} text={r.outputs[1]} differs={r.outputs[0] !== r.outputs[1]} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Verdict result={r.result} note={r.resultNote} reduced={reduced} />
              {!reduced && (
                <span className="flex gap-1.5" aria-hidden>
                  {art.rounds.map((x, i) => (
                    <span key={x.id} className={`size-2 rounded-full ${i === idx ? 'bg-[#FF5B14]' : 'bg-[#3a332b]'}`} />
                  ))}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </figure>
  )
}

/* (c) open schema plus planned versions and chains */

function SchemaIllustration({ art }: { art: SchemaArt }) {
  const reduced = !!useReducedMotion()
  const item = (i: number) => ({
    initial: reduced ? false : { opacity: 0, y: 10 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '0px 0px -10% 0px' },
    transition: { duration: 0.4, delay: i * 0.08 },
  })
  const chip = 'rounded-full border border-dashed border-[#a89f90] px-3 py-1 text-[13px] text-[#d8cfbf]'
  return (
    <figure className="grid gap-4 rounded-xl border border-[#2f2922] bg-[#0b0a08] p-4 sm:grid-cols-[1.1fr_1fr]">
      <div className="rounded-lg border border-[#3a332b] p-3">
        <p className={label}>{art.schemaTitle}</p>
        <ul className="mt-2 space-y-1 font-mono text-[13px]">
          {art.fields.map((f, i) => (
            <motion.li key={f} {...item(i)} className="flex gap-2">
              <span className="text-[#FF5B14]">{f}</span>
              <span className="text-[#6a6154]">:</span>
              <span className="text-[#a89f90]">…</span>
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="grid content-start gap-4">
        {[
          { title: art.versionsTitle, list: art.versions, base: art.fields.length },
          { title: art.chainsTitle, list: art.chains, base: art.fields.length + art.versions.length },
        ].map((g) => (
          <div key={g.title}>
            <p className={label}>{g.title}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {g.list.map((c, i) => (
                <motion.li key={c} {...item(g.base + i)} className={chip}>
                  {c}
                </motion.li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </figure>
  )
}

export default function Future() {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div
        role="note"
        className="sticky top-0 z-10 border-b-2 border-[#E3A73B] px-4 py-2.5 text-center"
        style={{ background: 'repeating-linear-gradient(135deg, #1a1409 0 14px, #0b0a08 14px 28px)' }}
      >
        <p className="font-display text-lg font-extrabold uppercase tracking-[0.08em] text-[#E3A73B] md:text-2xl">{ROADMAP.banner}</p>
      </div>

      <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-4 py-6 md:px-6 md:py-8">
        <header>
          <p className={label}>{ROADMAP.eyebrow}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight md:text-5xl">{ROADMAP.title}</h1>
          <p className="mt-2 max-w-2xl text-[#c9c0b0] md:text-lg">{ROADMAP.intro}</p>
        </header>

        {ROADMAP.items.map((it, i) => {
          const flip = i === 1
          const wide = i === 2
          return (
            <motion.article
              key={it.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -8% 0px' }}
              transition={{ duration: 0.5 }}
              className={`grid items-center gap-6 rounded-3xl border border-dashed border-[#4a4238] p-5 md:gap-8 md:p-7 ${wide ? 'md:grid-cols-[1fr_1fr]' : flip ? 'md:grid-cols-[1.35fr_1fr]' : 'md:grid-cols-[1fr_1.35fr]'}`}
            >
              <div className={flip ? 'md:order-2' : undefined}>
                <p className="inline-block rounded-full border border-[#E3A73B] px-2.5 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#E3A73B]">{ROADMAP.statusChip}</p>
                <h2 className="mt-3 font-display text-2xl font-extrabold uppercase leading-tight tracking-tight md:text-3xl">{it.title}</h2>
                <p className="mt-3 text-[#d8cfbf]">{it.body}</p>
                {it.note && <p className="mt-3 rounded-lg border border-[#3a332b] bg-[#100e0b] px-3 py-2 text-[14px] text-[#c9c0b0]">{it.note}</p>}
              </div>
              <div className={flip ? 'md:order-1' : undefined}>
                {it.art.kind === 'pq' && <PqIllustration art={it.art} />}
                {it.art.kind === 'diff' && <DiffIllustration art={it.art} />}
                {it.art.kind === 'schema' && <SchemaIllustration art={it.art} />}
              </div>
            </motion.article>
          )
        })}
      </div>
    </div>
  )
}
