import { useMemo } from 'react'
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { ADDRESSES, short, VAULT_TOTAL } from '@/lib/data'
import { deriveState } from '@/lib/script'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { useTheme } from '@/lib/theme'
import { fmtEth } from './ui'

export function BalanceMeter() {
  const { state } = useIntentLock()
  const { isDark } = useTheme()
  const { scenario, balance, moved, phase, stamp, elapsedMs, durationMs, status } = state

  const tones = {
    brass: isDark ? '#FF8547' : '#C2410C',
    ok: isDark ? '#7ACB8A' : '#2C7A45',
    danger: isDark ? '#FF5A36' : '#B3261E',
  } as const
  const fills = {
    brass: isDark ? '#FF621F' : '#FF5B14',
    ok: isDark ? '#7ACB8A' : '#2C7A45',
    danger: isDark ? '#FF5A36' : '#B3261E',
  } as const

  const tone: keyof typeof tones =
    scenario === 'normal' ? (moved > 0 ? 'danger' : 'brass') : scenario === 'attack' ? (stamp === 'reverted' ? 'ok' : 'brass') : phase === 'executed' ? 'ok' : 'brass'

  const label =
    scenario === 'normal'
      ? moved <= 0 ? 'Holding' : balance <= 0.005 ? 'Empty' : 'Draining'
      : scenario === 'attack'
        ? stamp === 'reverted' ? 'Intact: guard held' : 'Holding, pending attestation'
        : phase === 'executed' ? (moved >= 0.1 ? 'Transfer executed' : 'Executing') : 'Holding, pending attestation'

  // Sample the deterministic script up to "now" so the chart needs no extra state.
  const bucket = Math.floor(elapsedMs / 250)
  const data = useMemo(() => {
    const pts: { t: number; v: number }[] = []
    if (status === 'idle') return [{ t: 0, v: VAULT_TOTAL }]
    for (let t = 0; t <= bucket * 250; t += 250) pts.push({ t, v: deriveState(scenario, t, 'running').balance })
    return pts
  }, [scenario, bucket, status])

  const receiver = scenario === 'normal' ? ['Attacker + mixer', ADDRESSES.attacker] : scenario === 'legit' ? ['Cold wallet', ADDRESSES.coldWallet] : ['Attacker', ADDRESSES.attacker]

  return (
    <div className="flex h-full flex-col">
      <p className="eyebrow">Vault balance</p>
      <p className="mt-3 flex items-baseline gap-3 font-mono tabular-nums" style={{ color: tones[tone] }}>
        <span className="text-5xl font-medium leading-none md:text-6xl" aria-hidden>
          {fmtEth(balance)}
        </span>
        <span className="text-xl text-soft" aria-hidden>ETH</span>
        <span className="sr-only">Vault balance {fmtEth(balance)} ETH</span>
      </p>
      <p className="mt-3 text-sm font-medium" style={{ color: tones[tone] }} role="status">
        {label}
      </p>
      <div
        role="meter"
        aria-label="Vault balance"
        aria-valuemin={0}
        aria-valuemax={VAULT_TOTAL}
        aria-valuenow={Math.round(balance * 100) / 100}
        className="mt-5 h-3 overflow-hidden rounded-full border-2 border-edge bg-paper"
      >
        <div
          className="h-full rounded-full transition-[width] duration-150 ease-linear"
          style={{ width: `${(balance / VAULT_TOTAL) * 100}%`, background: fills[tone] }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs text-soft">
        <span>0</span>
        <span>{fmtEth(VAULT_TOTAL)} ETH at start</span>
      </div>

      <div className="mt-5 h-32 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
            <XAxis dataKey="t" type="number" domain={[0, durationMs]} hide />
            <YAxis domain={[0, VAULT_TOTAL * 1.05]} hide />
            <Area type="stepAfter" dataKey="v" stroke={fills[tone]} strokeWidth={2.5} fill={fills[tone]} fillOpacity={0.18} isAnimationActive={false} />
            {status !== 'idle' && <ReferenceDot x={elapsedMs} y={balance} r={4} fill={fills[tone]} stroke={isDark ? '#090908' : '#1E1913'} strokeWidth={2} ifOverflow="visible" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-auto flex items-center justify-between gap-4 border-t-2 border-line pt-4 font-mono text-sm">
        <dt className="text-soft">{receiver[0]}</dt>
        <dd className="tabular-nums">
          {short(receiver[1], 6, 4)} <span className={moved > 0 ? (scenario === 'legit' ? 'text-ok' : 'text-bad') : 'text-soft'}>+{fmtEth(moved)} ETH</span>
        </dd>
      </dl>
    </div>
  )
}
