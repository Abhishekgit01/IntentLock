import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronRight, Clock, KeyRound, ShieldCheck, ShieldX, X } from 'lucide-react'
import { attestationHash, short, txFor, VERIFIERS, type VerifierProfile } from '@/lib/data'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { useTheme } from '@/lib/theme'
import type { IntentLockState, VerifierStatus } from '@/lib/types'
import { RunStrip } from '@/components/RunStrip'
import { HashDiff, PageHeader, Reveal } from '@/components/ui'

const STATUS = {
  waiting: { label: 'Waiting', Icon: Clock, text: 'text-soft', card: 'border-edge bg-paper', badge: 'border-edge text-soft' },
  attested: { label: 'Attested', Icon: ShieldCheck, text: 'text-ok', card: 'border-ok bg-ok/10', badge: 'border-ok text-ok' },
  mismatch: { label: 'Mismatch', Icon: ShieldX, text: 'text-bad', card: 'border-bad bg-bad/10', badge: 'border-bad text-bad' },
} as const

export default function Verifiers() {
  const { state } = useIntentLock()
  const [openId, setOpenId] = useState<VerifierProfile['id'] | null>(null)
  const profile = VERIFIERS.find((v) => v.id === openId) ?? null

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 md:px-10">
      <PageHeader index="02" label="Verifier panel" parts={[{ t: 'Three verifiers.' }, { t: 'Two must agree.', em: true }]}>
        Separate devices, separate keys, separate decoders. Each one decodes the raw transaction on its own and signs only if the result matches the intent.
      </PageHeader>
      <RunStrip />
      <div className="grid gap-5 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <div className="card flex h-full flex-col items-center bg-sand p-8">
            <ThresholdRing state={state} />
          </div>
        </Reveal>
        <ul className="space-y-4 lg:col-span-7">
          {VERIFIERS.map((v, i) => (
            <li key={v.id}>
              <Reveal delay={i * 0.1} y={32}>
                <VerifierCard v={v} status={state.verifiers[v.id]} disabled={!state.guardEnabled} onOpen={() => setOpenId(v.id)} />
              </Reveal>
            </li>
          ))}
          {!state.guardEnabled && (
            <li className="rounded-3xl border-2 border-dashed border-edge px-5 py-4 text-soft">
              No guard is deployed in this scenario, so no verifier is ever asked. Switch to an IntentLock scenario to see them work.
            </li>
          )}
        </ul>
      </div>
      <ManifestDialog profile={profile} onClose={() => setOpenId(null)} />
    </div>
  )
}

function ThresholdRing({ state }: { state: IntentLockState }) {
  const { isDark } = useTheme()
  const ringColors: Record<VerifierStatus, string> = {
    waiting: isDark ? '#383129' : '#D9CBB0',
    attested: isDark ? '#7ACB8A' : '#2C7A45',
    mismatch: isDark ? '#FF5A36' : '#B3261E',
  }
  const r = 92
  const circ = 2 * Math.PI * r
  const gap = 10
  const seg = circ / 3 - gap
  const verdict = !state.guardEnabled
    ? { text: 'No guard', tone: 'text-soft' }
    : state.thresholdMet
      ? { text: 'Threshold met', tone: 'text-ok' }
      : state.phase === 'reverted'
        ? { text: 'Threshold failed', tone: 'text-bad' }
        : { text: 'Collecting', tone: 'text-flame-deep' }
  return (
    <>
      <div role="img" aria-label={`Threshold ring: ${state.attested} of 3 verifiers attested, 2 required, ${state.mismatches} mismatch. ${verdict.text}.`} className="relative size-72">
        <svg viewBox="0 0 240 240" className="size-full -rotate-90" aria-hidden>
          {VERIFIERS.map((v, i) => (
            <circle key={v.id} cx="120" cy="120" r={r} fill="none" strokeWidth="20" strokeLinecap="round" stroke={ringColors[state.verifiers[v.id]]} strokeDasharray={`${seg} ${circ - seg}`} strokeDashoffset={-(i * (circ / 3) + gap / 2)} className="transition-[stroke] duration-500" />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <motion.p key={state.attested} initial={{ scale: 1.35, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-8xl font-extrabold leading-none tabular-nums">
            {state.attested}<span className="text-ink/35"> / 3</span>
          </motion.p>
          <p className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-soft">2 required</p>
        </div>
      </div>
      <p className={`mt-4 font-display text-2xl font-extrabold uppercase ${verdict.tone}`} role="status">{verdict.text}</p>
      <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-soft">
        {(['attested', 'mismatch', 'waiting'] as const).map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="size-3.5 rounded-full border-2 border-edge" style={{ background: ringColors[k] }} aria-hidden />
            {STATUS[k].label}
          </li>
        ))}
      </ul>
    </>
  )
}

function VerifierCard({ v, status, disabled, onOpen }: { v: VerifierProfile; status: VerifierStatus; disabled: boolean; onOpen: () => void }) {
  const { state } = useIntentLock()
  const S = STATUS[status]
  const hash = status === 'attested' ? attestationHash(v.id, state.scenario) : status === 'mismatch' ? txFor(state.scenario).computedIntentHash : null
  const note =
    status === 'mismatch'
      ? 'Computed intentHash differs from the one signers approved. Refused to sign.'
      : status === 'attested' && state.scenario === 'attack'
        ? 'Decoded the front-end feed instead of raw calldata.'
        : status === 'attested'
          ? 'Decoded raw calldata. Matches the approved intent.'
          : disabled
            ? 'Not in the path.'
            : 'Waiting for an execution request.'
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      whileHover={{ y: -4, rotate: -0.4 }}
      whileTap={{ scale: 0.99 }}
      animate={status === 'mismatch' ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
      transition={{ duration: 0.5 }}
      className={`group grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-3 rounded-[26px] border-2 p-5 text-left transition-colors duration-500 md:p-6 ${S.card} ${disabled ? 'opacity-60' : ''}`}
    >
      <span className={`grid size-16 place-items-center rounded-full border-2 bg-paper font-display text-4xl font-extrabold ${S.badge}`} aria-hidden>{v.id}</span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-display text-2xl font-extrabold uppercase">{v.name}</span>
          <span className={`flex items-center gap-1.5 rounded-full border-2 bg-paper px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider ${S.badge}`}>
            <S.Icon className="size-4" aria-hidden />
            {S.label}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2 text-sm text-soft">
          <KeyRound className="size-3.5 shrink-0" aria-hidden />
          {v.device} · {v.operator} · {v.city}
        </span>
      </span>
      <ChevronRight className="size-6 transition-transform group-hover:translate-x-1" aria-hidden />
      <span className="col-span-3 grid gap-1 border-t-2 border-line pt-3 sm:grid-cols-[auto_1fr] sm:items-baseline sm:gap-x-4">
        <span className="font-mono text-sm font-bold tabular-nums">{hash ? short(hash, 8, 6) : '0x————…——————'}</span>
        <span className={`text-sm ${status === 'mismatch' ? 'font-semibold text-bad' : 'text-soft'}`}>{note}</span>
      </span>
    </motion.button>
  )
}

function ManifestDialog({ profile, onClose }: { profile: VerifierProfile | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { state } = useIntentLock()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (profile && !d.open) d.showModal()
    if (!profile && d.open) d.close()
  }, [profile])

  const status = profile ? state.verifiers[profile.id] : 'waiting'
  const S = STATUS[status]
  const tx = txFor(state.scenario)
  const feedOnly = !!profile && profile.id === 'C' && state.scenario === 'attack'
  const computed = feedOnly ? tx.claimedIntentHash : tx.computedIntentHash
  const hasData = state.guardEnabled && state.phase !== 'idle'

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="manifest-title"
      className="m-auto max-h-[calc(100vh-2rem)] w-[min(780px,calc(100vw-2rem))] overflow-y-auto rounded-[28px] border-2 border-edge bg-paper p-0 text-ink backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      {profile && (
        <div className="dialog-in p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Decoded manifest</p>
              <h3 id="manifest-title" className="mt-2 font-display text-4xl font-extrabold uppercase">
                {profile.name} <span className={`align-middle font-mono text-sm font-bold uppercase tracking-wider ${S.text}`}>· {S.label}</span>
              </h3>
              <p className="mt-1 text-soft">{profile.device} · {profile.operator} · {profile.city}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close manifest"><X className="size-4" aria-hidden />Close</button>
          </div>
          {!hasData ? (
            <p className="mt-8 rounded-2xl border-2 border-dashed border-edge p-5 text-soft">
              {state.guardEnabled ? 'This verifier has nothing to decode yet. Run a scenario and open it again.' : 'No guard is deployed in this scenario, so there is no manifest.'}
            </p>
          ) : (
            <>
              <dl className="mt-7 divide-y divide-line border-y-2 border-line text-[15px]">
                <Field k="Decoder source" v={feedOnly ? 'Front-end JSON feed (shared dependency, not raw calldata)' : profile.decoder} bad={feedOnly} />
                <Field k="Target" v={`${tx.to} (${tx.toLabel})`} mono />
                <Field k="Operation" v={tx.operation} mono bad={tx.operation === 'DELEGATECALL' && !feedOnly} />
                <Field k="Function" v={tx.signature} mono />
                <Field k="Arguments" v={tx.args} mono />
                <Field k="Value" v={`${tx.valueEth} ETH`} mono />
                <Field k="Simulated effects" v={(feedOnly ? ['none reported by feed'] : tx.effects).join('\n')} mono bad={tx.operation === 'DELEGATECALL' && !feedOnly} />
              </dl>
              <div className="mt-6 space-y-4">
                <div>
                  <p className="eyebrow mb-1.5">intentHash approved by signers</p>
                  <p className="break-all font-mono text-sm">{tx.claimedIntentHash}</p>
                </div>
                <div>
                  <p className="eyebrow mb-1.5">intentHash computed by {profile.name}</p>
                  <p className="text-sm"><HashDiff value={computed} against={tx.claimedIntentHash} /></p>
                </div>
                <p className={`flex items-center gap-2 rounded-2xl border-2 px-4 py-3 font-semibold ${status === 'mismatch' ? 'border-bad bg-bad/10 text-bad' : status === 'attested' ? 'border-ok bg-ok/10 text-ok' : 'border-edge text-soft'}`}>
                  <S.Icon className="size-5 shrink-0" aria-hidden />
                  {status === 'mismatch' && 'Hashes differ. This verifier refuses to attest.'}
                  {status === 'attested' && (feedOnly ? 'Hashes match, but only because the feed was trusted. Counted as 1 of 3.' : 'Hashes match. Attestation signed with this verifier’s key.')}
                  {status === 'waiting' && 'Not yet attested. Waiting for the execution request.'}
                </p>
                <p className="font-mono text-xs text-soft">key {profile.keyFingerprint}</p>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  )
}

function Field({ k, v, mono, bad }: { k: string; v: string; mono?: boolean; bad?: boolean }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-soft">{k}</dt>
      <dd className={`min-w-0 whitespace-pre-line break-words ${mono ? 'font-mono text-sm' : ''} ${bad ? 'font-semibold text-bad' : ''}`}>{v}</dd>
    </div>
  )
}
