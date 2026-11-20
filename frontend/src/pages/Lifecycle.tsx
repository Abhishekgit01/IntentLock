import { useEffect, useMemo, useRef } from 'react'
import { Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react'
import { motion } from 'motion/react'
import { Check, CircleDashed, Hourglass, LoaderCircle, Minus, ScrollText, X } from 'lucide-react'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { useTheme } from '@/lib/theme'
import type { IntentLockState } from '@/lib/types'
import { RunStrip } from '@/components/RunStrip'
import { PageHeader, Reveal, SafeBoundary, fmtClock } from '@/components/ui'

type StepStatus = 'pending' | 'active' | 'done' | 'skipped' | 'failed'
interface StepData extends Record<string, unknown> {
  label: string
  sub: string
  status: StepStatus
  countdown?: boolean
}
type StepNode = Node<StepData, 'step'>

const STEPS = ['proposed', 'decoded', 'attested', 'timelock', 'executed', 'reverted'] as const
type StepId = (typeof STEPS)[number]

function stepStatuses(s: IntentLockState): Record<StepId, StepStatus> {
  const out: Record<StepId, StepStatus> = { proposed: 'pending', decoded: 'pending', attested: 'pending', timelock: 'pending', executed: 'pending', reverted: 'pending' }
  const done = (...ids: StepId[]) => ids.forEach((i) => (out[i] = 'done'))
  switch (s.phase) {
    case 'idle': break
    case 'proposed': out.proposed = 'active'; break
    case 'decoded': done('proposed'); out.decoded = 'active'; break
    case 'attesting': done('proposed', 'decoded'); out.attested = 'active'; break
    case 'timelock': done('proposed', 'decoded', 'attested'); out.timelock = 'active'; break
    case 'executed':
      if (!s.guardEnabled) { done('proposed'); out.decoded = out.attested = out.timelock = 'skipped'; out.executed = 'failed' }
      else { done('proposed', 'decoded', 'attested'); out.timelock = s.timelock.totalMs ? 'done' : 'skipped'; out.executed = 'done' }
      break
    case 'reverted': done('proposed', 'decoded'); out.attested = 'failed'; out.timelock = 'skipped'; out.reverted = 'failed'; break
  }
  return out
}

function subs(s: IntentLockState): Record<StepId, string> {
  const tl = s.timelock
  return {
    proposed: 'Signers confirm',
    decoded: s.risk ? `Risk: ${s.risk}` : 'Calldata decoded',
    attested: `${s.attested} of 3 attested`,
    timelock: tl.active ? fmtClock(tl.remainingMs, true) : tl.totalMs ? 'Elapsed' : 'High-risk only',
    executed: !s.guardEnabled && s.phase === 'executed' ? 'No guard: drained' : 'Funds move',
    reverted: 'Guard refuses',
  }
}

const LABELS: Record<StepId, string> = {
  proposed: 'Proposed',
  decoded: 'Decoded',
  attested: 'Attested (2 of 3)',
  timelock: 'Timelock',
  executed: 'Executed',
  reverted: 'Reverted',
}

const STYLE: Record<StepStatus, string> = {
  pending: 'border-edge bg-paper text-soft',
  skipped: 'border-dashed border-edge bg-cream text-soft opacity-65',
  done: 'border-ok bg-paper text-ink',
  active: 'border-flame bg-flame text-on-flame',
  failed: 'border-bad bg-bad/15 text-ink',
}

function StepIcon({ status }: { status: StepStatus }) {
  const c = 'size-5 shrink-0'
  if (status === 'done') return <Check className={`${c} text-ok`} aria-hidden />
  if (status === 'failed') return <X className={`${c} text-bad`} aria-hidden />
  if (status === 'active') return <LoaderCircle className={`${c} animate-spin`} aria-hidden />
  if (status === 'skipped') return <Minus className={c} aria-hidden />
  return <CircleDashed className={c} aria-hidden />
}

function StepNodeView({ data }: NodeProps<StepNode>) {
  const hidden = { opacity: 0, pointerEvents: 'none' as const }
  const big = data.countdown && data.status === 'active'
  return (
    <div className={`w-[190px] rounded-2xl border-2 px-4 py-3 transition-all duration-500 ${STYLE[data.status]} ${data.status === 'active' ? '-translate-y-1' : ''}`}>
      <Handle type="target" position={Position.Left} id="l" style={hidden} />
      <Handle type="source" position={Position.Right} id="r" style={hidden} />
      <Handle type="source" position={Position.Bottom} id="b" style={hidden} />
      <div className="flex items-center gap-2">
        <StepIcon status={data.status} />
        <span className="font-display text-[15px] font-extrabold uppercase leading-tight">{data.label}</span>
      </div>
      <p className={`mt-1.5 pl-7 font-mono text-xs ${big ? 'text-base font-bold' : data.status === 'failed' ? 'font-bold text-bad' : ''}`}>{data.sub}</p>
    </div>
  )
}
const nodeTypes = { step: StepNodeView }

const POS: Record<StepId, { x: number; y: number }> = {
  proposed: { x: 0, y: 40 },
  decoded: { x: 245, y: 40 },
  attested: { x: 490, y: 40 },
  timelock: { x: 735, y: 40 },
  executed: { x: 980, y: -10 },
  reverted: { x: 980, y: 150 },
}
const EDGES: [StepId, StepId, string?][] = [
  ['proposed', 'decoded'],
  ['decoded', 'attested'],
  ['attested', 'timelock'],
  ['timelock', 'executed'],
  ['attested', 'reverted', 'b'],
]

export default function Lifecycle() {
  const { state } = useIntentLock()
  const { isDark } = useTheme()
  const st = stepStatuses(state)
  const sub = subs(state)
  const sig = STEPS.map((id) => `${st[id]}|${sub[id]}`).join(',') + `|${isDark}`
  const rf = useRef<ReactFlowInstance<StepNode, Edge> | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  const nodes = useMemo<StepNode[]>(
    () => STEPS.map((id) => ({ id, type: 'step', position: POS[id], draggable: false, selectable: false, focusable: false, data: { label: LABELS[id], sub: sub[id], status: st[id], countdown: id === 'timelock' } })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig],
  )
  const edges = useMemo<Edge[]>(
    () =>
      EDGES.map(([a, b, handle]) => {
        const lit = (st[a] === 'done' || st[a] === 'failed') && (st[b] === 'done' || st[b] === 'active' || st[b] === 'failed')
        const idleStroke = isDark ? '#383129' : '#CBB994'
        const badStroke = isDark ? '#FF5A36' : '#B3261E'
        const activeStroke = isDark ? '#FF621F' : '#FF5B14'
        const okStroke = isDark ? '#7ACB8A' : '#2C7A45'
        const color = !lit ? idleStroke : st[b] === 'failed' ? badStroke : st[b] === 'active' ? activeStroke : okStroke
        return {
          id: `${a}-${b}`,
          source: a,
          target: b,
          sourceHandle: handle ?? 'r',
          targetHandle: 'l',
          type: 'smoothstep',
          animated: st[b] === 'active',
          style: { stroke: color, strokeWidth: 3 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig],
  )

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => rf.current?.fitView({ padding: 0.04 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tl = state.timelock
  const showTl = tl.totalMs > 0
  const tlPct = showTl ? (1 - tl.remainingMs / tl.totalMs) * 100 : 0

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 md:px-10">
      <PageHeader index="03" label="State machine" parts={[{ t: 'One path to' }, { t: 'Executed.', em: true }]}>
        Every transaction moves through the same lifecycle. The only exits are an execution the verifiers vouched for, or a revert.
      </PageHeader>
      <RunStrip />

      <Reveal>
        <div className="card p-4 md:p-6">
          <div ref={wrap} className="hidden h-[310px] md:block">
            <SafeBoundary label="The state machine diagram">
              <ReactFlow<StepNode, Edge>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onInit={(i) => { rf.current = i; i.fitView({ padding: 0.04 }) }}
                fitView
                minZoom={0.2}
                nodesDraggable={false}
                nodesConnectable={false}
                nodesFocusable={false}
                edgesFocusable={false}
                elementsSelectable={false}
                panOnDrag={false}
                panOnScroll={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                preventScrolling={false}
                proOptions={{ hideAttribution: false }}
              />
            </SafeBoundary>
          </div>
          <ol className="grid gap-2 md:sr-only" aria-label="Transaction lifecycle">
            {STEPS.map((id) => (
              <li key={id} className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${STYLE[st[id]]}`}>
                <StepIcon status={st[id]} />
                <span className="font-display font-bold uppercase">{LABELS[id]}</span>
                <span className="ml-auto font-mono text-xs">{sub[id]} · {st[id]}</span>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <div className={`card h-full p-7 transition-colors duration-500 ${tl.active ? '!bg-flame !text-on-flame' : 'bg-sand'}`}>
            <p className={`eyebrow flex items-center gap-2 ${tl.active ? '!text-on-flame' : ''}`}><Hourglass className={`size-4 ${tl.active ? 'animate-pulse' : ''}`} aria-hidden /> Timelock</p>
            <p className={`mt-4 font-mono text-6xl font-bold tabular-nums md:text-7xl ${tl.active ? 'text-on-flame' : showTl ? 'text-soft' : 'text-ink/25'}`} role="timer" aria-label={showTl ? `Timelock remaining ${fmtClock(tl.remainingMs)}` : 'Timelock not started'}>
              {showTl ? fmtClock(tl.remainingMs, true) : '--:--.-'}
            </p>
            <div className="mt-5 h-3 overflow-hidden rounded-full border-2 border-edge bg-paper" aria-hidden>
              <div className="h-full rounded-full bg-flame transition-[width] duration-100 ease-linear" style={{ width: `${tlPct}%` }} />
            </div>
            <p className={`mt-4 ${tl.active ? 'text-on-flame/85' : 'text-soft'}`}>
              {tl.active
                ? 'High-risk transaction. Owners can still pause it. 24 h in production, compressed to 6 s for this demo.'
                : showTl
                  ? 'Timelock elapsed. The queued transaction was released for execution.'
                  : state.scenario === 'attack'
                    ? 'Skipped: the guard reverted before a timelock could start.'
                    : state.scenario === 'normal'
                      ? 'This multisig has no timelock. Quorum is enough.'
                      : 'High-risk transactions that clear attestation wait here before executing.'}
            </p>
          </div>
        </Reveal>
        <Reveal className="lg:col-span-7" delay={0.1}>
          <div className="on-dark h-full rounded-[22px] border-2 border-edge bg-contrast p-7 text-on-contrast">
            <p className="eyebrow flex items-center gap-2 !text-on-contrast/70"><ScrollText className="size-4 text-flame" aria-hidden /> Event ledger</p>
            <ol className="mt-4 max-h-[17rem] space-y-1 overflow-y-auto pr-1 font-mono text-sm" role="log" aria-live="polite" tabIndex={0} aria-label="Chain event ledger">
              {state.log.length === 0 && <li className="text-on-contrast/60">No events yet. Run a scenario.</li>}
              {[...state.log].reverse().map((l) => (
                <motion.li layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={l.atMs + l.text} className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-on-contrast/10 py-1.5">
                  <span className="tabular-nums text-on-contrast/60">T+{fmtClock(l.atMs)}</span>
                  <span className={l.level === 'danger' ? 'text-bad-light' : l.level === 'ok' ? 'text-ok-light' : l.level === 'warn' ? 'text-flame' : 'text-on-contrast'}>{l.text}</span>
                </motion.li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
