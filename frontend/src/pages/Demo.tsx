import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Check, CircleDot, Fingerprint, Play, RotateCcw, ShieldAlert, ShieldCheck, ShieldX, Wallet } from 'lucide-react'
import { SCENARIO_ORDER, SCRIPTS } from '@/lib/script'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { BalanceMeter } from '@/components/BalanceMeter'
import { FlowSankey } from '@/components/FlowSankey'
import { Headline, Reveal, SafeBoundary, Stamp, fmtClock } from '@/components/ui'

export default function Demo() {
  const { state, script, select, run, reset } = useIntentLock()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKey(e: KeyboardEvent, i: number) {
    const last = SCENARIO_ORDER.length - 1
    const next = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next === null) return
    e.preventDefault()
    const id = SCENARIO_ORDER[next]
    select(id)
    tabRefs.current[id]?.focus()
  }

  const running = state.status === 'running'
  const pct = state.status === 'idle' ? 0 : (state.elapsedMs / state.durationMs) * 100

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 md:px-10">
      <header className="pb-8 pt-24 md:pt-[6.5rem]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Headline
              as="h1"
              parts={[{ t: 'Same transaction.' }, { t: 'Different outcome.', em: true }]}
              className="display-type text-[clamp(2.6rem,6vw,5.25rem)]"
            />
            <p className="mt-4 max-w-2xl text-lg text-soft md:text-xl">
              Signers see one screen. The chain would do another. Pick a scenario and watch who stops it.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link to="/workbench" className="btn btn-primary !px-6 !py-3 text-base">
              Open 3D workbench
            </Link>
          </div>
        </div>
      </header>

      <div role="tablist" aria-label="Scenario" className="relative flex flex-wrap gap-2 rounded-[28px] border-2 border-edge bg-paper p-2">
        {SCENARIO_ORDER.map((id, i) => {
          const selected = state.scenario === id
          return (
            <button
              key={id}
              ref={(el) => { tabRefs.current[id] = el }}
              role="tab"
              id={`tab-${id}`}
              aria-selected={selected}
              aria-controls="scenario-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => select(id)}
              onKeyDown={(e) => onKey(e, i)}
              className="relative flex-1 rounded-[20px] px-5 py-3.5 text-left"
              style={{ minWidth: 210 }}
            >
              {selected && <motion.span layoutId="tab-bg" className="absolute inset-0 rounded-[20px] bg-flame" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
              <span className={`relative block font-display text-lg font-extrabold uppercase tracking-tight ${selected ? 'text-on-flame' : 'text-ink'}`}>{SCRIPTS[id].tabLabel}</span>
              <span className={`relative block text-sm ${selected ? 'text-on-flame/80' : 'text-soft'}`}>{SCRIPTS[id].blurb}</span>
            </button>
          )
        })}
      </div>

      <div id="scenario-panel" role="tabpanel" aria-labelledby={`tab-${state.scenario}`} className="pt-6">
        <div className="flex flex-col gap-5 rounded-[28px] border-2 border-edge bg-sand p-5 md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => run()}>
              {state.status === 'done' || running ? <RotateCcw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden fill="currentColor" />}
              {running || state.status === 'done' ? 'Replay' : script.runLabel}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={state.status === 'idle'}>Reset</button>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="font-mono text-sm font-bold tabular-nums">
              T+{fmtClock(state.elapsedMs)}<span className="text-soft"> / {fmtClock(state.durationMs)}</span>
            </span>
            <div role="progressbar" aria-label="Scripted sequence progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-3 flex-1 overflow-hidden rounded-full border-2 border-edge bg-paper">
              <div className="h-full rounded-full bg-flame transition-[width] duration-100 ease-linear" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <p aria-live="polite" className="relative mt-8 min-h-[7.5rem] max-w-4xl overflow-hidden md:min-h-[6rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={state.caption}
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -28, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="display-type block text-2xl md:text-4xl"
            >
              {state.caption}
            </motion.span>
          </AnimatePresence>
        </p>

        <div className="relative mt-4">
          <div className="grid gap-5 lg:grid-cols-2">
            <Reveal><UiCard /></Reveal>
            <Reveal delay={0.12}><ChainCard /></Reveal>
          </div>
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <AnimatePresence>{state.stamp && <Stamp key={state.stamp} kind={state.stamp} />}</AnimatePresence>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <div className="card h-full bg-sand p-7">
              <SafeBoundary label="The balance meter"><BalanceMeter /></SafeBoundary>
            </div>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.1}>
            <div className="card h-full p-7">
              <p className="eyebrow mb-1">Fund flow</p>
              <SafeBoundary label="The fund-flow diagram"><FlowSankey /></SafeBoundary>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  )
}

function UiCard() {
  const { state } = useIntentLock()
  return (
    <article className="card flex h-full flex-col p-6 md:p-8" aria-labelledby="ui-said">
      <header className="flex items-center justify-between gap-3">
        <h3 id="ui-said" className="font-display text-3xl font-extrabold uppercase">What the UI said</h3>
        <span className="eyebrow">dApp front-end</span>
      </header>
      <div className="mt-6 flex-1 rounded-3xl border-2 border-line bg-cream p-6">
        <p className="text-sm text-soft">Review transaction</p>
        <p className="mt-2 font-display text-3xl font-extrabold uppercase leading-[1.02] tracking-tight md:text-4xl">Transfer 0.1 ETH to cold wallet</p>
        <dl className="mt-6 divide-y divide-line">
          <Row k="To" v="Cold wallet · 0x71C7…e4A1" mono />
          <Row k="Amount" v="0.1 ETH ($312.40)" mono />
          <Row k="Network fee" v="0.0004 ETH" mono />
          <Row k="Warnings" v="None found" icon={<Check className="size-4 text-ok" aria-hidden />} />
        </dl>
        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm text-soft" aria-live="polite">
            <Wallet className="size-4" aria-hidden />
            {state.signerConfirms} of 3 signers confirmed
          </p>
          <ul className="flex gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.li key={i} animate={{ scale: i < state.signerConfirms ? [1, 1.3, 1] : 1 }} className={`grid size-8 place-items-center rounded-full border-2 border-edge ${i < state.signerConfirms ? 'bg-ink text-cream' : 'text-soft'}`}>
                {i < state.signerConfirms ? <Check className="size-4" /> : <CircleDot className="size-3.5" />}
              </motion.li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="mt-5 select-none rounded-full bg-ink py-3.5 text-center font-display text-lg font-bold uppercase text-cream">Confirm</div>
      </div>
      <p className="mt-4 text-sm text-soft">Rendered by the front-end. The signer has no way to check it against the calldata.</p>
    </article>
  )
}

function Row({ k, v, mono, icon }: { k: string; v: string; mono?: boolean; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-soft">{k}</dt>
      <dd className={`flex items-center gap-2 text-right ${mono ? 'font-mono text-[15px]' : 'font-medium'}`}>{icon}{v}</dd>
    </div>
  )
}

function ChainCard() {
  const { state, script } = useIntentLock()
  const shown = state.decodedLines
  const bad = script.decoded[0].severity === 'danger'
  const HeadIcon = bad ? ShieldAlert : ShieldCheck
  return (
    <article className="on-dark flex h-full flex-col rounded-[22px] border-2 border-edge bg-contrast p-6 text-on-contrast md:p-8" aria-labelledby="chain-does">
      <header className="flex items-center justify-between gap-3">
        <h3 id="chain-does" className="font-display text-3xl font-extrabold uppercase">What the chain would do</h3>
        <span className="eyebrow !text-on-contrast/65">decoded from raw calldata</span>
      </header>
      <div className="mt-6 flex-1 rounded-3xl border-2 border-on-contrast/15 bg-contrast-2 p-6">
        <div className="flex items-center justify-between gap-3">
          <p className={`flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-wider ${shown === 0 ? 'text-on-contrast/60' : bad ? 'text-bad-light' : 'text-ok-light'}`}>
            <HeadIcon className="size-5" aria-hidden />
            {shown === 0 ? 'Awaiting decode' : bad ? 'Intent diverges from screen' : 'Intent matches screen'}
          </p>
          {state.risk && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className={`rounded-full border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider ${state.risk === 'critical' ? 'border-bad-light text-bad-light' : 'border-flame text-flame'}`}>
              Risk: {state.risk}
            </motion.span>
          )}
        </div>
        <ol className="mt-5 space-y-4" aria-live="polite">
          {script.decoded.map((line, i) => {
            const visible = i < shown
            const danger = line.severity === 'danger'
            return (
              <li key={line.tag} className="min-h-[4.5rem]">
                <AnimatePresence mode="wait" initial={false}>
                  {visible ? (
                    <motion.div key="on" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="flex gap-4">
                      <span className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full text-on-flame ${danger ? 'bg-bad-light' : 'bg-ok-light'}`}>
                        {danger ? <ShieldX className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-xl font-extrabold uppercase leading-snug tracking-tight md:text-2xl">{line.text}</p>
                        <p className="mt-1 break-words font-mono text-sm text-on-contrast/70">
                          <span className={danger ? 'text-bad-light' : 'text-ok-light'}>{line.tag}</span> · {line.detail}
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="off" exit={{ opacity: 0 }} className="flex gap-4" aria-hidden>
                      <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full border-2 border-dashed border-on-contrast/30 text-on-contrast/50"><Fingerprint className="size-4" /></span>
                      <div className="flex-1 space-y-2 pt-2">
                        <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-on-contrast/15" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-on-contrast/10" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ol>

        {/* Automated AI Plain English Security Analysis Card */}
        <div className="mt-5 rounded-2xl border-2 border-flame/40 bg-flame/10 p-4 text-on-contrast">
          <div className="flex items-center justify-between gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-flame">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-ok animate-pulse" />
              Automated Plain English Security Analysis
            </span>
            <span className="rounded-full border border-ok/50 bg-ok/15 px-2.5 py-0.5 text-[9.5px] text-ok font-bold">
              AI Online · pai:latest
            </span>
          </div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-on-contrast">
            {state.scenario === 'attack'
              ? 'The signer screen displays a routine 0.1 ETH transfer to cold storage, but the raw calldata contains a hidden DELEGATECALL to an unverified proxy. This delegatecall grants the attacker complete execution control over the Safe vault, allowing them to overwrite owners and drain all assets. IntentLock Guard detected the delegatecall and blocked execution.'
              : state.scenario === 'legit'
                ? 'The transaction is a verified native transfer of 10 QUAI to an allowlisted cold storage address. Two independent verifiers confirmed the calldata matches company policy, and the on-chain Guard permits safe execution.'
                : 'Unguarded wallet simulation: Without IntentLock Guard attached, the Safe executes the raw delegatecall directly, resulting in catastrophic loss of vault ownership.'}
          </p>
          <div className="mt-2.5 rounded-lg border border-on-contrast/15 bg-on-contrast/5 px-3 py-1.5 font-mono text-xs text-on-contrast/80">
            <span className="font-bold text-flame">Intent vs Calldata: </span>
            {state.scenario === 'attack'
              ? 'Screen claimed 0.1 ETH cold transfer · Raw bytecode attempted root-level contract execution.'
              : 'Calldata strictly matches declared intent within authorized spending limits.'}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm text-on-contrast/70">
        {state.guardEnabled ? 'What each verifier derives independently from the raw transaction.' : 'In this scenario nobody decodes this, so no one sees it before it runs.'}
      </p>
    </article>
  )
}
