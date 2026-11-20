import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, Copy, Minus, X } from 'lucide-react'
import { CHECK_NAMES, INSPECTOR_TABS, type InspectorTab } from './scenes'
import {
  MUTABLE_FIELDS,
  buildCalldata,
  castCommands,
  digestView,
  mismatchSelector,
  mutateField,
  normalizeChecks,
  safeTxDigest,
  traceCompare,
  type CheckView,
} from './inspect'
import type { Workbench } from './useWorkbench'

const label = 'font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#a89f90]'
const mono = 'break-all font-mono text-[12.5px] leading-relaxed'

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } catch {
      /* clipboard unavailable: the text stays selectable */
    }
    ta.remove()
  }
}

function CopyChip({ text, name }: { text: string; name: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Copy ${name}`}
      onClick={async () => {
        await copyText(text)
        setDone(true)
        window.setTimeout(() => setDone(false), 1500)
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#4a4238] px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-[#d8cfbf] hover:border-[#FF5B14] hover:text-[#FF5B14]"
    >
      {done ? <Check className="size-3.5 text-[#7ACB8A]" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? 'Copied' : 'Copy'}
      <span className="sr-only" role="status">{done ? `${name} copied` : ''}</span>
    </button>
  )
}

function Field({ k, children, copy }: { k: string; children: ReactNode; copy?: string }) {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <dt className={label}>{k}</dt>
        {copy && <CopyChip text={copy} name={k} />}
      </div>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-dashed border-[#3a332b] px-4 py-4 text-sm text-[#a89f90]">{children}</p>
)

/* ---------- tabs ---------- */

function ChecksTab({ wb }: { wb: Workbench }) {
  const r = wb.derived.receipt
  const rows: CheckView[] = r.landed && r.checks ? normalizeChecks(r.checks) : CHECK_NAMES.map((name) => ({ name, status: 'pending' as const }))
  const failAt = rows.findIndex((c) => c.status === 'fail')
  const noGuard = r.landed && rows.every((c) => c.status === 'skipped')
  return (
    <div>
      <ol className="grid gap-2">
        {rows.map((c, i) => {
          const tone =
            c.status === 'pass' ? 'border-[#7ACB8A]/60 text-[#7ACB8A]' : c.status === 'fail' ? 'border-[#FF3B30] bg-[#FF3B30]/10 text-[#ff6a5e]' : 'border-[#2f2922] text-[#a89f90]'
          return (
            <li key={c.name} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${tone}`}>
              <span className="font-mono text-xs text-[#a89f90]">{i + 1}</span>
              {c.status === 'pass' ? <Check className="size-4 shrink-0" aria-hidden /> : c.status === 'fail' ? <X className="size-4 shrink-0" aria-hidden /> : <Minus className="size-4 shrink-0" aria-hidden />}
              <span className="flex-1 text-[14px] text-[#F5EEDF]">{c.name}</span>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider">{c.status === 'skipped' ? 'not reached' : c.status === 'pending' ? 'waiting' : c.status}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-sm text-[#a89f90]">
        {!r.landed
          ? 'Checks run in this order when the payload reaches the gate. Press play.'
          : noGuard
            ? 'No guard is installed here, so nothing was checked.'
            : failAt >= 0
              ? `Stopped at check ${failAt + 1}. Later checks are not reached.`
              : 'All simulated checks passed. This scenario depicts the payload proceeding.'}
      </p>
    </div>
  )
}

function RevertTab({ wb }: { wb: Workbench }) {
  const r = wb.derived.receipt
  if (!r.landed) return <Empty>Waiting for the simulated event. Press play.</Empty>
  const rev = r.revert
  return (
    <dl className="divide-y divide-[#2a241d]">
      {rev ? (
        <>
          <Field k="Error name" copy={rev.name}><span className="font-mono text-lg font-bold text-[#ff6a5e]">{rev.name}</span></Field>
          <Field k="4-byte selector" copy={rev.selector}><span className={mono}>{rev.selector}</span></Field>
          <Field k="Args">
            <ul className="space-y-1">{rev.args.map((a) => <li key={a} className={mono}>{a}</li>)}</ul>
          </Field>
        </>
      ) : (
        <Field k="Error name"><span className="text-[15px] text-[#7ACB8A]">None. The transaction did not revert.</span></Field>
      )}
      <Field k="txHash" copy={r.txHash}><span className={mono}>{r.txHash}</span></Field>
      {r.source === 'chain' && <Field k="blockNumber"><span className={mono}>{r.blockNumber?.toLocaleString('en-US')}</span></Field>}
      {r.source === 'chain' && <Field k="gasUsed"><span className={mono}>{r.gasUsed?.toLocaleString('en-US')}</span></Field>}
      <Field k={r.source === 'mock' ? 'Illustrative outcome' : 'status'}><span className={`font-mono text-[13px] font-bold ${rev ? 'text-[#ff6a5e]' : 'text-[#7ACB8A]'}`}>{r.source === 'mock' ? (rev ? 'would revert' : 'would succeed') : rev ? 'reverted (0x0)' : 'success (0x1)'}</span></Field>
    </dl>
  )
}

function CalldataTab({ wb }: { wb: Workbench }) {
  const cd = buildCalldata(wb.payload)
  return (
    <div>
      <div className="rounded-xl border border-[#2f2922] bg-[#0e0c0a] p-3.5" role="group" aria-label="Calldata hex">
        <p className="break-all font-mono text-[12.5px] leading-[1.7]">
          {cd.segments.map((s, i) => {
            if (s.kind === 'selector') return <span key={i} className="font-bold text-[#FF5B14]">{s.hex}</span>
            if (s.kind === 'operation') {
              const danger = wb.payload.operation === 'DELEGATECALL'
              return (
                <span key={i}>
                  <span className="text-[#a89f90]">{s.hex.slice(0, -2)}</span>
                  <span className={`rounded px-0.5 font-bold ${danger ? 'bg-[#FF3B30]/25 text-[#ff6a5e]' : 'bg-[#7ACB8A]/20 text-[#7ACB8A]'}`}>{s.hex.slice(-2)}</span>
                </span>
              )
            }
            return <span key={i} className={i % 2 ? 'text-[#F5EEDF]' : 'text-[#c9bda8]'}>{s.hex}</span>
          })}
        </p>
      </div>
      <ul className="mt-3 grid gap-1.5" aria-label="Segments">
        {cd.segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[13px]">
            <span aria-hidden className={`size-2.5 rounded-sm ${s.kind === 'selector' ? 'bg-[#FF5B14]' : s.kind === 'operation' ? (wb.payload.operation === 'DELEGATECALL' ? 'bg-[#FF3B30]' : 'bg-[#7ACB8A]') : 'bg-[#c9bda8]'}`} />
            <span className="text-[#d8cfbf]">{s.label}</span>
            <span className="ml-auto font-mono text-[11px] text-[#a89f90]">{s.kind === 'selector' ? '4 bytes' : '32 bytes'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-xl border border-[#2f2922] px-3.5 py-3 text-[14px] text-[#F5EEDF]">{cd.plain}</p>
      <div className="mt-2 flex items-center justify-end">
        <CopyChip text={cd.segments.map((s) => s.hex.replace(/^0x/, '')).join('').replace(/^/, '0x')} name="calldata" />
      </div>
    </div>
  )
}

function DigestDiff({ value, against }: { value: string; against: string }) {
  return (
    <span className={mono}>
      {value.split('').map((c, i) => (
        <span key={i} className={c !== against[i] ? 'rounded-sm bg-[#FF3B30]/25 font-bold text-[#ff6a5e]' : undefined}>{c}</span>
      ))}
    </span>
  )
}

function DigestTab({ wb }: { wb: Workbench }) {
  const v = digestView(wb.ref)
  const [mut, setMut] = useState(0)
  const which = mut > 0 ? MUTABLE_FIELDS[(mut - 1) % MUTABLE_FIELDS.length] : null
  const m = which ? mutateField(v.fields, which) : null
  const mutated = m ? safeTxDigest(m.fields) : null
  return (
    <div>
      <dl className="divide-y divide-[#2a241d]">
        <Field k="Safe tx digest (this payload)" copy={v.digest}><span className={mono}>{v.digest}</span></Field>
        {v.attestation ? (
          <>
            <Field k="Attested digest" copy={v.attestation.digest}>
              <DigestDiff value={v.attestation.digest} against={v.digest} />
              <p className={`mt-1 text-[13px] font-semibold ${v.matches ? 'text-[#7ACB8A]' : 'text-[#ff6a5e]'}`}>{v.matches ? 'Matches this payload.' : 'Differs from this payload.'}</p>
            </Field>
            <Field k="intentHash" copy={v.attestation.intentHash}><span className={mono}>{v.attestation.intentHash}</span></Field>
            <Field k="policyHash" copy={v.attestation.policyHash}><span className={mono}>{v.attestation.policyHash}</span></Field>
            <Field k="validUntil"><span className={mono}>{v.attestation.validUntil}</span></Field>
            <Field k="signer" copy={v.attestation.signer}><span className={mono}>{v.attestation.signer}</span></Field>
          </>
        ) : (
          <Field k="Attestation"><span className="text-[14px] text-[#ff6a5e]">None. Nobody signed this payload.</span></Field>
        )}
      </dl>

      <div className="mt-4 rounded-xl border border-[#3a332b] bg-[#100e0b] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setMut((n) => n + 1)} className="rounded-full bg-[#FF5B14] px-4 py-2 text-sm font-bold text-[#120f0c] hover:bg-[#ff7a3a]">
            Mutate one field
          </button>
          {mut > 0 && (
            <button type="button" onClick={() => setMut(0)} className="rounded-full border border-[#4a4238] px-3 py-2 text-sm text-[#d8cfbf] hover:border-[#F5EEDF]">
              Reset
            </button>
          )}
        </div>
        {m && mutated ? (
          <div className="mt-3" aria-live="polite">
            <p className="text-[14px]">
              Changed <span className="font-mono font-bold text-[#E3A73B]">{which}</span>: <span className="font-mono text-[#a89f90]">{m.from}</span> to <span className="font-mono text-[#F5EEDF]">{m.to}</span>
            </p>
            <p className={`mt-3 ${label}`}>Recomputed digest</p>
            <DigestDiff value={mutated} against={v.digest} />
            <p className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded border border-[#ff6a5e] px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-[#ff6a5e]">DigestMismatch</span>
              <span className="font-mono text-[11px] text-[#a89f90]">{mismatchSelector()}</span>
            </p>
            <p className="mt-2 text-[13px] text-[#a89f90]">One changed field moves the whole digest, so the signatures no longer apply.</p>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-[#a89f90]">Change one field of the payload and recompute the digest.</p>
        )}
      </div>
    </div>
  )
}

function StateTab({ wb }: { wb: Workbench }) {
  const r = wb.derived.receipt
  if (!r.landed || !r.stateDiff) return <Empty>No simulated state change yet. Press play.</Empty>
  return (
    <div>
      <div role="table" aria-label="State before and after" className="overflow-hidden rounded-xl border border-[#2f2922]">
        <div role="row" className="grid grid-cols-[1.15fr_1fr_1fr] gap-2 border-b border-[#2f2922] bg-[#100e0b] px-3 py-2">
          {['Field', 'Before', 'After'].map((h) => <span key={h} role="columnheader" className={label}>{h}</span>)}
        </div>
        {r.stateDiff.map((row) => {
          const changed = row.before !== row.after
          return (
            <div key={row.field} role="row" className={`grid grid-cols-[1.15fr_1fr_1fr] items-start gap-2 border-b border-[#241f1a] px-3 py-2.5 last:border-0 ${changed ? 'bg-[#FF3B30]/12 shadow-[inset_3px_0_0_#FF3B30,0_0_16px_rgba(255,59,48,0.28)]' : ''}`}>
              <span role="cell" className="text-[13px] text-[#F5EEDF]">{row.field}</span>
              <span role="cell" className="break-words font-mono text-[12px] text-[#a89f90]">{row.before}</span>
              <span role="cell" className={`flex items-start gap-1.5 break-words font-mono text-[12px] ${changed ? 'font-bold text-[#ff6a5e]' : 'text-[#7ACB8A]'}`}>
                {changed ? row.after : (<><Check className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span>unchanged</span></>)}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-sm text-[#a89f90]">
        {r.source === 'mock'
          ? 'Illustrative state rows for this scenario; no chain state was read.'
          : r.stateDiff.some((x) => x.before !== x.after)
            ? 'Highlighted rows changed on chain.'
            : 'Nothing changed. The reverted transaction left no trace in state.'}
      </p>
    </div>
  )
}

function TraceTree({ title, lines, current }: { title: string; lines: { depth: number; call: string }[] | null; current: boolean }) {
  return (
    <section aria-label={`${title} trace`} className={`rounded-xl border p-3.5 ${current ? 'border-[#FF5B14]' : 'border-[#2f2922]'}`}>
      <h3 className="flex items-center justify-between gap-2">
        <span className="font-display text-base font-extrabold uppercase">{title}</span>
        {current && <span className="rounded-full bg-[#FF5B14] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#120f0c]">this run</span>}
      </h3>
      {lines ? (
        <ol className="mt-2 space-y-1">
          {lines.map((l, i) => (
            <li key={i} style={{ paddingLeft: l.depth * 16 }} className={`font-mono text-[12px] leading-snug ${l.call.startsWith('revert') ? 'font-bold text-[#ff6a5e]' : /SSTORE|enableModule|DELEGATECALL 0x/.test(l.call) ? 'text-[#E3A73B]' : 'text-[#d8cfbf]'}`}>
              <span aria-hidden className="mr-1.5 text-[#6a6154]">{l.depth ? '└' : '▸'}</span>
              {l.call}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-[#a89f90]">No trace for this case.</p>
      )}
    </section>
  )
}

function TraceTab({ wb }: { wb: Workbench }) {
  const t = traceCompare(wb.ref)
  const unguardedRun = wb.mode === 'unguarded' && wb.ref.kind === 'scenario'
  return (
    <div className="grid gap-3">
      <TraceTree title="Unguarded" lines={t.unguarded} current={unguardedRun} />
      <TraceTree title="Guarded" lines={t.guarded} current={!unguardedRun} />
    </div>
  )
}

/* ---------- drawer ---------- */

export function Inspector({ wb, tab, setTab, onClose }: { wb: Workbench; tab: InspectorTab; setTab: (t: InspectorTab) => void; onClose: () => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const r = wb.derived.receipt
  const cmds = castCommands(r)

  function onKey(e: KeyboardEvent, i: number) {
    const last = INSPECTOR_TABS.length - 1
    const next = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next === null) return
    e.preventDefault()
    const t = INSPECTOR_TABS[next]
    setTab(t)
    refs.current[t]?.focus()
  }

  return (
    <section aria-label="Inspector" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-[#2a241d] bg-[#0b0a08]/96 text-[#F5EEDF] backdrop-blur lg:border-l">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold uppercase leading-none tracking-tight">Inspector</h2>
          <p className="mt-1 text-[12px] text-[#a89f90]">Scenario details and simulated checks.</p>
        </div>
        <div className="flex items-center gap-2">
          {r.source === 'mock' && <span className="rounded-full border border-[#E3A73B] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#E3A73B]">Mock data</span>}
          <button type="button" onClick={onClose} aria-label="Close inspector" className="grid size-8 place-items-center rounded-full border border-[#4a4238] text-[#d8cfbf] hover:border-[#F5EEDF]">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <div role="tablist" aria-label="Inspector sections" className="grid grid-cols-6 gap-0.5 px-3 pb-2">
        {INSPECTOR_TABS.map((t, i) => (
          <button
            key={t}
            ref={(el) => {
              refs.current[t] = el
            }}
            role="tab"
            id={`insp-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="insp-panel"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(e) => onKey(e, i)}
            className={`rounded-full px-1 py-1.5 text-[12px] font-bold transition-colors ${tab === t ? 'bg-[#FF5B14] text-[#120f0c]' : 'text-[#c9c0b0] hover:text-[#F5EEDF]'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div id="insp-panel" role="tabpanel" aria-labelledby={`insp-tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === 'Checks' && <ChecksTab wb={wb} />}
        {tab === 'Revert' && <RevertTab wb={wb} />}
        {tab === 'Calldata' && <CalldataTab wb={wb} />}
        {tab === 'Digest' && <DigestTab wb={wb} />}
        {tab === 'State' && <StateTab wb={wb} />}
        {tab === 'Trace' && <TraceTab wb={wb} />}
      </div>

      <footer className="min-w-0 border-t border-[#2a241d] px-4 py-3">
        <h3 className={label}>Reproduce</h3>
        <ul className="mt-2 grid min-w-0 gap-1.5">
          {cmds.map((c) => (
            <li key={c.label} className="flex min-w-0 items-center gap-2 rounded-lg border border-[#2f2922] bg-[#0e0c0a] py-1.5 pl-2.5 pr-1.5">
              <code tabIndex={0} aria-label={`${c.label} command`} className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1 font-mono text-[11.5px] text-[#F5EEDF] [scrollbar-width:thin]">{c.cmd}</code>
              <CopyChip text={c.cmd} name={`${c.label} command`} />
            </li>
          ))}
        </ul>
        {r.source === 'mock' && <p className="mt-2 text-[12px] text-[#a89f90]">No reproduce commands: this is a mock scenario and no transaction was sent to a chain.</p>}
      </footer>
    </section>
  )
}
