import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { BLOCK_OUTCOME_TEXT, CHAIN, VAULT, WORLD, type BlockOutcome, type StateDiffRow } from './scenes'
import type { Receipt } from './engine'
import { COL, useReduced } from './objects'

/* New in the Inspector layer. Every technical string here is a DOM overlay (drei <Html>), never 3D text. */

const damp = THREE.MathUtils.damp
const OUTCOME_COLOR: Record<BlockOutcome, string> = { reverted: COL.red, included: COL.green, drained: COL.amber }
const BLOCK_X = 9.9
const BLOCK_Z0 = 3.4
const BLOCK_STEP = 3.3

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ borderColor: color, color }} className="whitespace-nowrap rounded border bg-[#0b0a08]/90 px-2 py-1 font-mono text-[11px] font-bold tracking-wider">
      {children}
    </span>
  )
}

/** Recent blocks receding in depth. The newest, nearest block receives the transaction. */
export function BlockRow({ receipt }: { receipt: Receipt }) {
  const reduced = useReduced()
  const chip = useRef<THREE.Mesh>(null)
  const t = useRef(0)
  const outcomeColor = receipt.outcome ? OUTCOME_COLOR[receipt.outcome] : COL.dim
  const blocks = Array.from({ length: CHAIN.blocksShown }, (_, i) => i)

  useFrame((_, dt) => {
    t.current = damp(t.current, receipt.landed ? 1 : 0, reduced ? 1000 : 6, dt)
    if (chip.current) {
      chip.current.scale.setScalar(Math.max(0.0001, t.current))
      chip.current.position.y = 0.95 + (1 - t.current) * 1.8
      chip.current.visible = t.current > 0.01
    }
  })

  return (
    <group position={[BLOCK_X, 0, 0]}>
      <Line
        points={[new THREE.Vector3(0, 0.45, BLOCK_Z0 + 1.5), new THREE.Vector3(0, 0.45, BLOCK_Z0 - BLOCK_STEP * (CHAIN.blocksShown - 1) - 1.5)]}
        color="#3a332b"
        lineWidth={1.2}
        dashed
        dashSize={0.25}
        gapSize={0.2}
      />
      {blocks.map((i) => {
        const z = BLOCK_Z0 - i * BLOCK_STEP
        const newest = i === 0
        const edge = newest ? outcomeColor : '#4a4238'
        return (
          <group key={i} position={[0, 0.45, z]}>
            <mesh>
              <boxGeometry args={[2.4, 0.9, 2.5]} />
              <meshStandardMaterial color={newest && receipt.outcome ? outcomeColor : '#17130f'} transparent opacity={newest && receipt.outcome ? 0.22 : 0.7} roughness={0.8} depthWrite={false} />
              <Edges color={edge} lineWidth={newest ? 2.4 : 1} />
            </mesh>
            {newest && (
              <mesh ref={chip} position={[0, 0.95, 0]} visible={false}>
                <boxGeometry args={[0.7, 0.7, 0.7]} />
                <meshStandardMaterial color={outcomeColor} emissive={outcomeColor} emissiveIntensity={1.6} toneMapped={false} />
              </mesh>
            )}
            {newest && (
              <Html position={[0, 2.1, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="whitespace-nowrap font-mono text-[11px] font-bold tracking-wider text-[#F5EEDF]">
                    {receipt.blockNumber
                      ? `BLOCK #${receipt.blockNumber.toLocaleString('en-US')}`
                      : 'SIMULATED BLOCK'}
                  </span>
                  <Pill color={receipt.outcome ? outcomeColor : COL.dim}>{receipt.outcome ? BLOCK_OUTCOME_TEXT[receipt.outcome] : 'AWAITING TX'}</Pill>
                </div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

const GRID = 4
const TILE = 0.52
const GAP = 0.2

/** Opens in front of the vault when it is selected. Slot 0 holds the implementation. */
export function StorageGrid({ visible, slot0, landed }: { visible: boolean; slot0: StateDiffRow | null; landed: boolean }) {
  const reduced = useReduced()
  const root = useRef<THREE.Group>(null)
  const s = useRef(0)
  const changed = !!slot0 && slot0.before !== slot0.after
  const color = !landed ? COL.orange : changed ? COL.red : COL.green
  const step = TILE + GAP
  const off = ((GRID - 1) * step) / 2

  useFrame((st, dt) => {
    s.current = damp(s.current, visible ? 1 : 0, reduced ? 1000 : 7, dt)
    if (!root.current) return
    root.current.scale.set(Math.max(0.0001, s.current), Math.max(0.0001, s.current), 1)
    root.current.visible = s.current > 0.01
  })

  return (
    <group ref={root} position={[WORLD.vault[0], WORLD.vault[1] + 0.2, WORLD.vault[2] + 2.8]} visible={false}>
      <mesh position={[0, 0, -0.1]}>
        <planeGeometry args={[GRID * step + 0.4, GRID * step + 0.4]} />
        <meshBasicMaterial color={COL.void} transparent opacity={0.55} />
        <Edges color="#4a4238" lineWidth={1} />
      </mesh>
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const col = i % GRID
        const row = Math.floor(i / GRID)
        const first = i === 0
        return (
          <mesh key={i} position={[-off + col * step, off - row * step, 0]}>
            <boxGeometry args={[TILE, TILE, first ? 0.16 : 0.06]} />
            {first ? (
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={changed ? 2.4 : 1.4} toneMapped={false} />
            ) : (
              <meshStandardMaterial color="#1f1a15" roughness={0.9} />
            )}
            <Edges color={first ? color : '#3a332b'} lineWidth={first ? 2.5 : 1} />
          </mesh>
        )
      })}
      {visible && (
        <>
          <Html position={[0, off + 0.75, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <div className="w-[230px] rounded-lg border border-[#3a332b] bg-[#0b0a08]/92 p-2.5 text-center">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#a89f90]">Vault storage slots</p>
              <p className="mt-1 font-mono text-[11px] leading-snug text-[#F5EEDF]">
                slot 0 = implementation
                <br />
                {slot0 && landed ? (
                  changed ? (
                    <span className="font-bold text-[#ff6a5e]">{`${slot0.before} → ${slot0.after}`}</span>
                  ) : (
                    <span className="text-[#7ACB8A]">{`${slot0.after} (unchanged)`}</span>
                  )
                ) : (
                  <span className="text-[#E3A73B]">{VAULT.cores.good}</span>
                )}
              </p>
            </div>
          </Html>
          <Html position={[-off - 0.85, off, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <span className="whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider" style={{ borderColor: color, color }}>
              SLOT 0
            </span>
          </Html>
        </>
      )}
    </group>
  )
}
