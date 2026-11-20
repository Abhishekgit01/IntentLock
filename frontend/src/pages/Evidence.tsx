import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bar, BarChart, LabelList, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Check, ChevronDown, Cpu, FileSearch, Flame, ShieldCheck, X } from 'lucide-react'
import { EVIDENCE, txFor, type FixtureCategory } from '@/lib/data'
import { SCRIPTS } from '@/lib/script'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { useTheme } from '@/lib/theme'
import { CopyButton, CountUp, HashDiff, PageHeader, Reveal, SafeBoundary, SyntheticBadge } from '@/components/ui'

const CATS: FixtureCategory[] = ['UI spoof', 'Signer device', 'Verifier set', 'Guard logic', 'Legitimate']

interface RunData {
  recordedAt: string
  environment: {
    chain: string
    chainId: number
    forgeVersion: string
    solcVersion: string
    safeVersion: string
  }
  measuredGas: Record<string, { fixtureId?: string; test: string; gas: number; status: string }>
  notes?: { source: string; pqReference?: string; disclaimer?: string }
}

export default function Evidence() {
  const { isDark } = useTheme()
  const [filter, setFilter] = useState<FixtureCategory | 'All'>('All')
  const [runData, setRunData] = useState<RunData | null>(null)

  useEffect(() => {
    fetch('/run.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.measuredGas) setRunData(data)
      })
      .catch(() => null)
  }, [])
  const stats = useMemo(() => {
    const total = EVIDENCE.length
    const pass = EVIDENCE.filter((r) => r.result === 'Pass').length
    const legit = EVIDENCE.filter((r) => r.category === 'Legitimate')
    return {
      total,
      pass,
      rate: (pass / total) * 100,
      falseReverts: legit.filter((r) => r.result === 'Fail').length,
      legitTotal: legit.length,
      byCat: CATS.map((c) => {
        const rows = EVIDENCE.filter((r) => r.category === c)
        return { cat: c, pass: rows.filter((r) => r.result === 'Pass').length, fail: rows.filter((r) => r.result === 'Fail').length }
      }),
    }
  }, [])
  const rows = filter === 'All' ? EVIDENCE : EVIDENCE.filter((r) => r.category === filter)

  const okFill = isDark ? '#7ACB8A' : '#2C7A45'
  const badFill = isDark ? '#FF5A36' : '#B3261E'
  const axisColor = isDark ? '#E2DFD7' : '#1E1913'
  const barLabelFill = isDark ? '#090908' : '#FCF8EF'

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 md:px-10">
      <PageHeader index="04" label="Evidence" parts={[{ t: 'Fixtures, not' }, { t: 'promises.', em: true }]}>
        Each fixture is a transaction the guard must revert, or one it must let through. Verified on local Anvil chain 31337 and Foundry test suite; live gas benchmarks loaded from /run.json.
      </PageHeader>

      {runData && (
        <Reveal className="mb-6">
          <div className="card p-6 border-2 border-ok/40 bg-ok/5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-edge pb-4">
              <div className="flex items-center gap-2.5">
                <Flame className="size-5 text-flame" aria-hidden />
                <h3 className="font-display text-2xl font-extrabold uppercase">Measured On-Chain Gas</h3>
                <span className="rounded-full bg-ok/15 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase text-ok">
                  from /run.json
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs text-soft">
                <span>{runData.environment.chain}</span>
                <span>·</span>
                <span>Safe {runData.environment.safeVersion}</span>
                <span>·</span>
                <span>Solc {runData.environment.solcVersion}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(runData.measuredGas).map(([key, item]) => (
                <div key={key} className="rounded-xl border border-line bg-paper/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-flame-deep">{item.fixtureId ?? key.slice(0, 3)}</span>
                    <span className="rounded bg-ok/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ok">{item.status}</span>
                  </div>
                  <p className="mt-1 font-mono text-lg font-extrabold tabular-nums">
                    {item.gas.toLocaleString('en-US')} <span className="text-xs font-normal text-soft">gas</span>
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-soft" title={item.test}>
                    {item.test.replace(/^test_/, '')}
                  </p>
                </div>
              ))}
            </div>
            {runData.notes?.disclaimer && (
              <p className="mt-4 border-t border-line pt-3 font-mono text-xs text-soft">
                {runData.notes.disclaimer}
              </p>
            )}
          </div>
        </Reveal>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <div className="card flex h-full flex-col bg-flame p-6 text-on-flame">
            <SyntheticBadge className="self-start !bg-paper" />
            <p className="eyebrow mt-5 !text-on-flame">Overall pass rate</p>
            <div className="relative mx-auto mt-2 h-56 w-56">
              <SafeBoundary label="The pass-rate chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <RadialBarChart innerRadius="76%" outerRadius="100%" data={[{ v: stats.rate }]} startAngle={90} endAngle={-270} accessibilityLayer={false}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
                    <RadialBar dataKey="v" background={{ fill: '#FCF8EF' }} cornerRadius={20} fill="#120F0C" />
                  </RadialBarChart>
                </ResponsiveContainer>
              </SafeBoundary>
              <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                <p className="font-display text-5xl font-extrabold"><CountUp to={stats.rate} decimals={1} /><span className="text-2xl">%</span></p>
                <p className="mt-1 font-mono text-xs font-bold">{stats.pass} of {stats.total} fixtures</p>
              </div>
            </div>
            <dl className="mt-auto grid grid-cols-2 gap-4 border-t-2 border-on-flame/35 pt-5">
              <div>
                <dt className="eyebrow !text-on-flame">False reverts</dt>
                <dd className="mt-1 font-display text-4xl font-extrabold tabular-nums">{stats.falseReverts}<span className="text-lg"> / {stats.legitTotal}</span></dd>
              </div>
              <div>
                <dt className="eyebrow !text-on-flame">Open failures</dt>
                <dd className="mt-1 font-display text-4xl font-extrabold tabular-nums">{stats.total - stats.pass}</dd>
              </div>
            </dl>
          </div>
        </Reveal>

        <Reveal className="lg:col-span-8" delay={0.1}>
          <div className="card h-full p-6">
            <SyntheticBadge />
            <p className="eyebrow mt-5">Pass / fail by category</p>
            <div className="mt-3 h-64" role="img" aria-label={`Pass and fail counts: ${stats.byCat.map((c) => `${c.cat} ${c.pass} pass ${c.fail} fail`).join('; ')}`}>
              <SafeBoundary label="The category chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={stats.byCat} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }} barSize={24} accessibilityLayer={false}>
                    <XAxis type="number" hide domain={[0, 4]} />
                    <YAxis type="category" dataKey="cat" width={120} axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 14, fontFamily: 'DM Sans', fontWeight: 600 }} />
                    <Bar dataKey="pass" stackId="a" fill={okFill} radius={[8, 0, 0, 8]}>
                      <LabelList dataKey="pass" position="insideRight" fill={barLabelFill} fontSize={13} fontFamily="JetBrains Mono" fontWeight={700} formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')} />
                    </Bar>
                    <Bar dataKey="fail" stackId="a" fill={badFill} radius={[0, 8, 8, 0]}>
                      <LabelList dataKey="fail" position="insideRight" fill={barLabelFill} fontSize={13} fontFamily="JetBrains Mono" fontWeight={700} formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </SafeBoundary>
            </div>
            <ul className="mt-2 flex gap-5 text-sm text-soft">
              <li className="flex items-center gap-2"><span className="size-3.5 rounded-full bg-ok" aria-hidden />Pass</li>
              <li className="flex items-center gap-2"><span className="size-3.5 rounded-full bg-bad" aria-hidden />Fail</li>
            </ul>
          </div>
        </Reveal>
      </div>

      <Reveal className="mt-5">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-edge p-5 md:px-6">
            <div className="relative flex flex-wrap items-center gap-2" role="group" aria-label="Filter fixtures by category">
              {(['All', ...CATS] as const).map((c) => (
                <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(c)} className="relative rounded-full border-2 border-edge px-4 py-1.5 text-sm font-semibold">
                  {filter === c && <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-full bg-flame" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                  <span className={`relative ${filter === c ? 'text-on-flame font-bold' : ''}`}>{c}</span>
                </button>
              ))}
            </div>
            <SyntheticBadge />
          </div>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Test fixtures table">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Test fixtures with category, expected outcome and result. Synthetic demo data.</caption>
              <thead>
                <tr className="border-b-2 border-line font-mono text-xs uppercase tracking-wider text-soft">
                  <th scope="col" className="px-6 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Category</th>
                  <th scope="col" className="px-4 py-3 font-medium">Expected</th>
                  <th scope="col" className="px-6 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false} mode="popLayout">
                  {rows.map((r, i) => (
                    <motion.tr key={r.id} layout initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ delay: i * 0.025 }} className="border-b border-line transition-colors last:border-0 hover:bg-sand/60">
                      <th scope="row" className="px-6 py-3.5 font-normal">
                        <span className="mr-3 font-mono text-xs text-soft">{r.id}</span>
                        {r.name}
                        {r.note && <span className="mt-0.5 block pl-[3.75rem] text-sm text-soft">{r.note}</span>}
                      </th>
                      <td className="px-4 py-3.5 text-soft">{r.category}</td>
                      <td className="px-4 py-3.5 font-mono text-sm">{r.expected}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider ${r.result === 'Pass' ? 'border-ok text-ok' : 'border-bad bg-bad/10 text-bad'}`}>
                          {r.result === 'Pass' ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                          {r.result}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      <RawData />
    </div>
  )
}

function Field({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="eyebrow">{label}</p>
        <CopyButton value={value} label={label} />
      </div>
      <div className="rounded-2xl border-2 border-line bg-cream px-4 py-3 text-sm leading-relaxed">{children ?? <span className="break-all font-mono">{value}</span>}</div>
    </div>
  )
}

function RawData() {
  const { state } = useIntentLock()
  const [open, setOpen] = useState(true)
  const tx = txFor(state.scenario)
  const mismatch = tx.claimedIntentHash !== tx.computedIntentHash
  const shownScenario = state.scenario === 'legit' ? SCRIPTS.legit.tabLabel : SCRIPTS.attack.tabLabel

  return (
    <section id="raw-data" aria-label="Raw data" className="mt-24">
      <Reveal>
        <p className="eyebrow">05 · Raw data</p>
        <h2 className="display-type mt-4 max-w-3xl text-5xl md:text-6xl">
          Don’t trust us. <span className="text-flame-deep">Check it yourself.</span>
        </h2>
      </Reveal>
      <Reveal className="mt-10">
        <div className="card overflow-hidden">
          <h3>
            <button type="button" aria-expanded={open} aria-controls="raw-drawer" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-sand/60 md:px-8">
              <FileSearch className="size-7 shrink-0 text-flame-deep" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-3xl font-extrabold uppercase">Raw transaction data</span>
                <span className="block text-sm text-soft">{tx.label} · from {shownScenario}</span>
              </span>
              <span className="rounded-full bg-flame px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-on-flame">Verify offline</span>
              <ChevronDown className={`size-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
            </button>
          </h3>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div id="raw-drawer" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden border-t-2 border-edge">
                <div className="grid gap-10 p-6 md:p-8 lg:grid-cols-12">
                  <div className="space-y-7 lg:col-span-8">
                    <Field label="calldata" value={tx.calldata.hex}>
                      <pre tabIndex={0} aria-label="Raw calldata as hex words" className="max-h-72 overflow-auto font-mono text-[13px] leading-6">
                        <span className="font-bold text-flame-deep">{tx.calldata.selector}</span>
                        {'  '}<span className="text-soft">execTransaction</span>
                        {tx.calldata.words.map((w, i) => (
                          <span key={i} className="block">
                            <span className="select-none text-soft">{(4 + i * 32).toString(16).padStart(4, '0')}  </span>
                            {w}
                          </span>
                        ))}
                      </pre>
                    </Field>
                    <Field label="txHash" value={tx.txHash} />
                    <Field label="intentHash" value={tx.computedIntentHash}>
                      <HashDiff value={tx.computedIntentHash} against={tx.claimedIntentHash} />
                    </Field>
                    {mismatch && (
                      <p className="text-sm text-soft">
                        <span className="hash-diff-bad px-1 font-mono">Highlighted</span> characters differ from the intentHash the signers’ screen implied (<span className="break-all font-mono">{tx.claimedIntentHash}</span>). Even a long matching prefix is still a mismatch.
                      </p>
                    )}
                  </div>
                  <aside className="lg:col-span-4">
                    <h4 className="font-display text-3xl font-extrabold uppercase">Verify offline</h4>
                    <ol className="mt-5 space-y-5">
                      {[
                        ['Copy calldata', 'Move it to an air-gapped machine on a USB stick or by QR code.'],
                        ['Decode and hash', 'Decode with any ABI tool, then keccak256 the decoded intent.'],
                        ['Compare', 'The result must equal intentHash, character for character.'],
                      ].map(([t, d], i) => (
                        <li key={t} className="grid grid-cols-[2.5rem_1fr] gap-3">
                          <span className="grid size-9 place-items-center rounded-full bg-flame font-mono text-sm font-bold text-on-flame">{i + 1}</span>
                          <span><span className="block font-display text-lg font-bold uppercase">{t}</span><span className="text-soft">{d}</span></span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-6 border-t-2 border-line pt-4 text-sm text-soft">Demo values are synthetic and will not hash to each other. The procedure is the one real contracts will use.</p>
                  </aside>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>
    </section>
  )
}
