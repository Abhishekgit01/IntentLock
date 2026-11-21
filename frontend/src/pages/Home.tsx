import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUpRight, Play, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { runAttackFromAnywhere } from '@/lib/actions'
import { GlobeStage } from '@/components/GlobeStage'
import { ArrowLink, CountUp, Headline, Marquee, Reveal, SafeBoundary, Tilt } from '@/components/ui'

export default function Home() {
  const { run } = useIntentLock()
  const navigate = useNavigate()
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="float-a absolute -left-24 top-7 size-72 rounded-full bg-flame/15" />
        <div aria-hidden className="float-b absolute right-[-6rem] top-[24rem] size-56 rounded-full border-[14px] border-flame/25" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-24 pt-12 md:px-10 md:pt-14 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Headline
              parts={[{ t: 'Your signers clicked' }, { t: 'Confirm.', hl: true }, { t: 'The screen lied.', em: true, br: true }]}
              className="display-type text-[clamp(2.85rem,6.3vw,5.75rem)]"
            />
            <Reveal delay={0.35} y={18}>
              <p className="mt-8 max-w-xl font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">
                Clear signing advises.{' '}
                <span className="inline-block rounded-lg bg-contrast px-2.5 py-0.5 text-on-contrast border border-edge">The guard enforces.</span>
              </p>
              <p className="mt-5 max-w-xl text-lg text-soft">
                A harmless screen can hide a delegatecall. IntentLock makes the chain refuse to execute unless independent verifiers attested to the exact transaction.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs font-mono text-soft">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-ok" /> 26/26 Adversarial Tests Passed
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-ok" /> Safe v1.4.1 Native Guard
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-ok" /> NIST ML-DSA-65 Post-Quantum
                </span>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <button type="button" className="btn btn-primary !px-8 !py-4 text-lg" onClick={() => runAttackFromAnywhere(run, navigate)}>
                  <Play className="size-5" aria-hidden fill="currentColor" />
                  Run the attack
                </button>
                <ArrowLink to="/verifiers" variant="ghost" className="!px-8 !py-4 text-lg">
                  See how it works
                </ArrowLink>
                <ArrowLink to="/onboard" variant="ghost" className="!px-8 !py-4 text-lg">
                  Open Policy Studio
                </ArrowLink>
              </div>
            </Reveal>
          </div>
          <div className="relative lg:col-span-5 lg:-translate-y-16">
            <Reveal delay={0.25} y={32} scale={0.96}>
              <Tilt>
                <SafeBoundary label="The verifier globe">
                  <GlobeStage />
                </SafeBoundary>
              </Tilt>
            </Reveal>
            <motion.div
              initial={{ scale: 0, rotate: -24 }}
              animate={{ scale: 1, rotate: -7 }}
              transition={{ delay: 0.7, type: 'spring', stiffness: 260, damping: 16 }}
              className="absolute -right-2 -top-6 z-10 hidden md:block"
            >
              <div className="wobble rounded-2xl border-2 border-edge bg-paper px-4 py-3">
                <p className="font-display text-3xl font-extrabold uppercase leading-none">2 of 3</p>
                <p className="eyebrow mt-1">must attest</p>
              </div>
            </motion.div>
            <motion.div
              initial={{ scale: 0, rotate: 18 }}
              animate={{ scale: 1, rotate: 6 }}
              transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 16 }}
              className="absolute -left-4 bottom-24 z-10 hidden md:block"
            >
              <div className="float-b rounded-full border-2 border-bad bg-paper px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-bad">
                delegatecall detected
              </div>
            </motion.div>
          </div>
        </div>
        <motion.a
          href="#how"
          aria-label="Scroll to how it works"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-24 left-1/2 hidden size-11 -translate-x-1/2 place-items-center rounded-full border-2 border-edge md:grid"
        >
          <ArrowDown className="size-5" aria-hidden />
        </motion.a>
      </section>

      <div className="relative z-10 -my-4 -rotate-1 overflow-hidden border-y-2 border-edge bg-contrast py-4 text-on-contrast">
        <Marquee items={['Clear signing advises', 'The guard enforces', 'Signers see one screen', 'The chain does another', 'No attestation, no execution']} className="font-display text-2xl font-bold uppercase tracking-tight md:text-3xl" />
      </div>

      <section id="how" className="mx-auto max-w-[1280px] scroll-mt-24 px-5 py-28 md:px-10">
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="display-type mt-4 max-w-3xl text-5xl md:text-7xl">
            Four ideas. <span className="text-flame-deep">One refusal.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid auto-rows-[minmax(220px,auto)] gap-5 md:grid-cols-12">
          <Reveal className="md:col-span-7 md:row-span-2" delay={0}>
            <LieCard />
          </Reveal>
          <Reveal className="md:col-span-5" delay={0.08}>
            <BentoLink to="/verifiers" tone="flame" kicker="Verifier panel" title="Two of three verifiers must agree.">
              <p className="font-display text-8xl font-extrabold leading-none"><CountUp to={2} /><span className="text-5xl opacity-60"> / 3</span></p>
            </BentoLink>
          </Reveal>
          <Reveal className="md:col-span-5" delay={0.14}>
            <BentoLink to="/demo" tone="sand" kicker="Live console" title="A scripted attack, start to finish.">
              <p className="font-display text-8xl font-extrabold leading-none"><CountUp to={20} /><span className="text-5xl opacity-60"> s</span></p>
            </BentoLink>
          </Reveal>
          <Reveal className="md:col-span-4" delay={0}>
            <BentoLink to="/lifecycle" tone="paper" kicker="State machine" title="One path to Executed.">
              <StepDots />
            </BentoLink>
          </Reveal>
          <Reveal className="md:col-span-5" delay={0.08}>
            <BentoLink to="/evidence" tone="paper" kicker="Evidence" title="Fixtures, not promises.">
              <p className="font-display text-6xl font-extrabold leading-none"><CountUp to={92.3} decimals={1} suffix="%" /></p>
              <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-wider text-flame-deep">Real chain & replay evidence</p>
            </BentoLink>
          </Reveal>
          <Reveal className="md:col-span-3" delay={0.14}>
            <BentoLink to="/threats" tone="contrast" kicker="Threat model" title="What it stops. What it doesn’t.">
              <span aria-hidden className="font-display text-6xl font-extrabold leading-none text-flame">4×3</span>
            </BentoLink>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 pb-8 md:px-10">
        <Reveal scale={0.96}>
          <div className="relative overflow-hidden rounded-[36px] border-2 border-edge bg-flame p-10 text-on-flame md:p-16">
            <motion.span aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full border-[18px] border-on-flame/15" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 40, ease: 'linear' }} />
            <h2 className="relative max-w-3xl font-display text-5xl font-extrabold uppercase leading-[0.94] tracking-[-0.03em] md:text-7xl">
              See the guard say <span className="underline decoration-on-flame/50 decoration-4 underline-offset-8">no.</span>
            </h2>
            <p className="relative mt-5 max-w-xl text-lg text-on-flame/85">Twenty seconds. One transaction that looks harmless. Three verifiers that don’t believe it.</p>
            <button type="button" className="relative mt-8 inline-flex items-center gap-2.5 rounded-full bg-on-flame px-8 py-4 font-display text-lg font-bold text-paper transition-transform hover:-translate-y-0.5" onClick={() => runAttackFromAnywhere(run, navigate)}>
              <Play className="size-5" aria-hidden fill="currentColor" />
              Run the attack
            </button>
          </div>
        </Reveal>
      </section>
    </>
  )
}

const TONES = {
  flame: 'bg-flame text-on-flame',
  sand: 'bg-sand text-ink',
  paper: 'bg-paper text-ink',
  contrast: 'bg-contrast text-on-contrast',
} as const

function BentoLink({ to, tone, kicker, title, children }: { to: string; tone: keyof typeof TONES; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <motion.div whileHover={{ y: -6, rotate: -0.6 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="h-full">
      <Link to={to} className={`group relative flex h-full min-h-[220px] flex-col justify-between overflow-hidden rounded-[28px] border-2 border-edge p-7 ${TONES[tone]}`}>
        <span className="flex items-start justify-between gap-4">
          <span className="eyebrow !text-current opacity-75">{kicker}</span>
          <span className="grid size-10 place-items-center rounded-full border-2 border-current/70 transition-transform duration-300 group-hover:rotate-45">
            <ArrowUpRight className="size-5" aria-hidden />
          </span>
        </span>
        <span className="mt-6 block">
          {children}
          <span className="mt-4 block font-display text-2xl font-extrabold uppercase leading-tight tracking-tight">{title}</span>
        </span>
      </Link>
    </motion.div>
  )
}

/** The central idea: one transaction, two stories. Flips between them on a loop. */
function LieCard() {
  const [truth, setTruth] = useState(false)
  useEffect(() => {
    const t = window.setInterval(() => setTruth((v) => !v), 3200)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div className="on-dark relative flex h-full min-h-[460px] flex-col justify-between overflow-hidden rounded-[28px] border-2 border-edge bg-contrast p-8 text-on-contrast md:p-10">
      <div className="flex items-center justify-between gap-4">
        <span className="eyebrow !text-on-contrast/70">Two stories, one transaction</span>
        <button type="button" onClick={() => setTruth((v) => !v)} className="btn btn-sm !border-on-contrast/60 !text-on-contrast hover:!bg-on-contrast hover:!text-contrast" aria-pressed={truth}>
          {truth ? 'Show the screen' : 'Show the chain'}
        </button>
      </div>
      <div className="relative my-8 min-h-[190px]" aria-live="polite">
        <AnimatePresence mode="wait">
          {!truth ? (
            <motion.div key="ui" initial={{ rotateX: -80, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 80, opacity: 0 }} transition={{ duration: 0.45 }} style={{ transformPerspective: 800 }}>
              <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-ok-light"><ShieldCheck className="size-4" aria-hidden /> What the UI said</p>
              <p className="display-type mt-4 text-4xl md:text-5xl">Transfer 0.1 ETH to cold wallet</p>
              <p className="mt-4 text-on-contrast/70">No warnings found.</p>
            </motion.div>
          ) : (
            <motion.div key="chain" initial={{ rotateX: -80, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 80, opacity: 0 }} transition={{ duration: 0.45 }} style={{ transformPerspective: 800 }}>
              <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-bad-light"><ShieldAlert className="size-4" aria-hidden /> What the chain would do</p>
              <ul className="mt-4 space-y-2 font-display text-3xl font-extrabold uppercase leading-tight tracking-tight md:text-4xl">
                {['delegatecall to unknown contract', 'proxy implementation upgrade', 'ownership changes'].map((t, i) => (
                  <motion.li key={t} initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.12 }} className="flex gap-3">
                    <span className="text-flame">→</span>
                    {t}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Link to="/demo" className="group inline-flex items-center gap-2 self-start font-display text-lg font-bold uppercase text-flame underline-offset-4 hover:underline">
        Watch it happen
        <ArrowUpRight className="size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
      </Link>
    </div>
  )
}

function StepDots() {
  const steps = ['Proposed', 'Decoded', 'Attested', 'Timelock', 'Executed']
  return (
    <ol className="flex items-center gap-1.5" aria-label="Lifecycle steps">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <motion.span
            title={s}
            className="size-4 rounded-full border-2 border-edge"
            animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 3.2, delay: i * 0.45 }}
            style={{ backgroundColor: i === 2 ? 'var(--th-flame)' : 'var(--th-sand)' }}
          />
          {i < steps.length - 1 && <span aria-hidden className="h-0.5 w-4 bg-edge/50" />}
        </li>
      ))}
      <span className="sr-only">{steps.join(', ')}</span>
    </ol>
  )
}
