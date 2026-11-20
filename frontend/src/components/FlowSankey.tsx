import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Sankey, sankeyJustify } from '@visx/sankey'
import { ADDRESSES, short, TRANSFER_AMOUNT, VAULT_TOTAL } from '@/lib/data'
import { useIntentLock } from '@/lib/useIntentLockEvents'
import { useTheme } from '@/lib/theme'
import type { FlowStage, ScenarioId } from '@/lib/types'

type Kind = 'drain' | 'request' | 'blocked' | 'ok'
interface NodeDatum {
  id: string
  label: string
  sub: string
  role: 'vault' | 'gate' | 'sink'
  [k: string]: unknown
}
interface LinkDatum {
  source: string
  target: string
  value: number
  kind: Kind
  [k: string]: unknown
}

const GRAPHS: Record<ScenarioId, { nodes: NodeDatum[]; links: LinkDatum[]; caption: string }> = {
  normal: {
    caption: 'Funds follow the delegatecall straight to the attacker.',
    nodes: [
      { id: 'vault', label: 'Multisig vault', sub: short(ADDRESSES.vault, 6, 4), role: 'vault' },
      { id: 'gate', label: 'Executor (no guard)', sub: short(ADDRESSES.malicious, 6, 4), role: 'gate' },
      { id: 'attacker', label: 'Attacker', sub: short(ADDRESSES.attacker, 6, 4), role: 'sink' },
      { id: 'mixer', label: 'Mixer', sub: short(ADDRESSES.mixer, 6, 4), role: 'sink' },
    ],
    links: [
      { source: 'vault', target: 'gate', value: VAULT_TOTAL, kind: 'drain' },
      { source: 'gate', target: 'attacker', value: VAULT_TOTAL * 0.8, kind: 'drain' },
      { source: 'gate', target: 'mixer', value: VAULT_TOTAL * 0.2, kind: 'drain' },
    ],
  },
  attack: {
    caption: 'The would-be drain path is shown dashed. It never carries funds.',
    nodes: [
      { id: 'vault', label: 'Multisig vault', sub: short(ADDRESSES.vault, 6, 4), role: 'vault' },
      { id: 'gate', label: 'IntentLock guard', sub: '2 of 3 required', role: 'gate' },
      { id: 'attacker', label: 'Attacker', sub: short(ADDRESSES.attacker, 6, 4), role: 'sink' },
    ],
    links: [
      { source: 'vault', target: 'gate', value: VAULT_TOTAL, kind: 'request' },
      { source: 'gate', target: 'attacker', value: VAULT_TOTAL, kind: 'blocked' },
    ],
  },
  legit: {
    caption: 'Link widths are floored for legibility; the real amount is 0.1 ETH.',
    nodes: [
      { id: 'vault', label: 'Multisig vault', sub: short(ADDRESSES.vault, 6, 4), role: 'vault' },
      { id: 'gate', label: 'IntentLock guard', sub: '2 of 3 required', role: 'gate' },
      { id: 'cold', label: 'Cold wallet', sub: short(ADDRESSES.coldWallet, 6, 4), role: 'sink' },
    ],
    links: [
      { source: 'vault', target: 'gate', value: 220, kind: 'ok' },
      { source: 'gate', target: 'cold', value: 220, kind: 'ok' },
    ],
  },
}

const W = 720
const H = 330

/** 0..1 draw progress of a link for the current flow stage. */
function linkProgress(kind: Kind, stage: FlowStage) {
  if (stage === 'idle') return 0
  if (kind === 'blocked') return stage === 'blocked' ? 0.2 : 0
  return 1
}

export function FlowSankey() {
  const { state } = useIntentLock()
  const { isDark } = useTheme()
  const { scenario, flow, balance, moved } = state
  const g = GRAPHS[scenario]
  const root = useMemo(() => structuredClone({ nodes: g.nodes, links: g.links }), [g])
  const moveTotal = scenario === 'normal' ? VAULT_TOTAL : scenario === 'legit' ? TRANSFER_AMOUNT : 0
  const sinkLevel = moveTotal ? Math.min(1, moved / moveTotal) : 0
  const idle = flow === 'idle'

  const ok = isDark ? '#7ACB8A' : '#2C7A45'
  const bad = isDark ? '#FF5A36' : '#B3261E'
  const flame = isDark ? '#FF621F' : '#FF5B14'
  const neutral = isDark ? '#383129' : '#CBB994'
  const track = isDark ? '#1C1915' : '#EADFCB'
  const stroke = isDark ? '#4B4339' : '#1E1913'
  const ink = isDark ? '#E2DFD7' : '#1E1913'
  const soft = isDark ? '#A49B8E' : '#5E5446'
  const marchColor = isDark ? '#E2DFD7' : '#FCF8EF'

  const colors: Record<Kind, string> = { drain: bad, request: flame, blocked: bad, ok }
  const gateTone = scenario === 'attack' ? (flow === 'blocked' ? bad : flame) : scenario === 'legit' ? (state.thresholdMet ? ok : flame) : neutral
  const vaultTone = scenario === 'normal' ? bad : flow === 'blocked' || state.thresholdMet ? ok : flame

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Fund flow for ${state.scenario}. Vault balance ${balance.toFixed(2)} ETH, ${moved.toFixed(2)} ETH moved out.`}
      >
        <Sankey<NodeDatum, LinkDatum>
          root={root}
          nodeId={(n) => n.id as string}
          nodeWidth={16}
          nodePadding={30}
          nodeAlign={sankeyJustify}
          extent={[
            [12, 52],
            [W - 12, H - 20],
          ]}
        >
          {({ graph, createPath }) => (
            <g>
              {graph.links.map((l, i) => {
                const kind = (l as unknown as LinkDatum).kind
                const d = createPath(l) ?? ''
                const w = Math.max(l.width ?? 2, 2)
                const depth = (l.source as { depth?: number }).depth ?? 0
                const target = linkProgress(kind, flow)
                const delay = kind === 'blocked' ? 0.5 : depth * 0.9
                const dur = kind === 'blocked' ? 0.5 : 1.1
                const marching = flow === 'flowing' && kind !== 'blocked' && target === 1
                return (
                  <g key={i}>
                    {kind === 'blocked' && flow === 'blocked' && (
                      <>
                        <path d={d} fill="none" stroke={colors.blocked} strokeWidth={w} strokeOpacity={0.14} />
                        <path d={d} fill="none" stroke={colors.blocked} strokeWidth={2} strokeOpacity={0.9} strokeDasharray="5 7" />
                      </>
                    )}
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={colors[kind]}
                      strokeWidth={w}
                      strokeOpacity={kind === 'request' ? 0.6 : kind === 'blocked' ? 0.85 : 0.72}
                      initial={false}
                      animate={{ pathLength: target }}
                      transition={{ duration: idle ? 0 : dur, delay: idle ? 0 : delay, ease: 'easeInOut' }}
                    />
                    {marching && (
                      <path d={d} fill="none" stroke={marchColor} strokeOpacity={0.9} strokeWidth={2} strokeDasharray="4 12" className="flow-march" />
                    )}
                  </g>
                )
              })}
              {graph.nodes.map((n) => {
                const nd = n as unknown as NodeDatum & { x0: number; x1: number; y0: number; y1: number }
                const h = nd.y1 - nd.y0
                const isLast = nd.x1 > W - 40
                const isFirst = nd.x0 < 40
                const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle'
                const tx = isFirst ? nd.x0 : isLast ? nd.x1 : (nd.x0 + nd.x1) / 2
                const level = nd.role === 'vault' ? balance / VAULT_TOTAL : nd.role === 'sink' ? sinkLevel : 0
                const fillColor = nd.role === 'vault' ? vaultTone : nd.role === 'gate' ? gateTone : scenario === 'legit' ? ok : bad
                return (
                  <g key={nd.id}>
                    <rect x={nd.x0} y={nd.y0} width={nd.x1 - nd.x0} height={h} fill={track} stroke={stroke} strokeWidth={2} rx={6} />
                    {nd.role !== 'gate' ? (
                      <rect x={nd.x0} y={nd.y1 - h * level} width={nd.x1 - nd.x0} height={h * level} fill={fillColor} rx={4} />
                    ) : (
                      <rect x={nd.x0} y={nd.y0} width={nd.x1 - nd.x0} height={h} fill={gateTone} rx={2} opacity={scenario === 'normal' ? 0.5 : 1} />
                    )}
                    <text x={tx} y={nd.y0 - 24} textAnchor={anchor} fill={ink} fontFamily="Archivo, sans-serif" fontSize={14} fontWeight={800}>
                      {nd.label.toUpperCase()}
                    </text>
                    <text x={tx} y={nd.y0 - 8} textAnchor={anchor} fill={soft} fontFamily="JetBrains Mono, monospace" fontSize={11}>
                      {nd.sub}
                    </text>
                    {nd.role === 'gate' && scenario === 'attack' && flow === 'blocked' && (
                      <g>
                        <rect x={nd.x1 + 5} y={nd.y0 - 6} width={4} height={h + 12} fill={bad} />
                        <text x={nd.x1 + 16} y={nd.y1 + 22} fill={bad} fontFamily="JetBrains Mono, monospace" fontSize={11} fontWeight={700}>
                          BLOCKED
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          )}
        </Sankey>
      </svg>
      <p className="mt-2 text-sm text-soft">{g.caption}</p>
    </div>
  )
}
