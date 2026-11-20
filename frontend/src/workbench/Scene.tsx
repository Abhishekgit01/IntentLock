import { Suspense, useEffect, useRef, type ComponentRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { CAMERA, WORLD, type CameraKey } from './scenes'
import { VERIFIER_IDS } from './engine'
import type { Workbench } from './useWorkbench'
import { Beam, COL, GuardGate, PayloadCrate, ProposalBillboard, RegistryRing, ReducedMotionProvider, VaultCube, VerifierOrb } from './objects'
import { BlockRow, StorageGrid } from './chain'

/** Pull the camera back on narrow screens so the whole pipeline stays in frame. */
function poseFor(key: CameraKey, aspect: number) {
  const pose = CAMERA[key]
  const target = new THREE.Vector3(...pose.target)
  const offset = new THREE.Vector3(...pose.pos).sub(target)
  const k = Math.min(2.7, Math.max(1, 1.85 / Math.max(aspect, 0.3)))
  const pos = target.clone().add(offset.multiplyScalar(k))
  return { pos, target }
}

function CameraRig({ focus, tick, reduced }: { focus: CameraKey; tick: number; reduced: boolean }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as ComponentRef<typeof OrbitControls> | null
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height
  const goal = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3(), flying: false, first: true })

  useEffect(() => {
    if (!controls) return
    const { pos, target } = poseFor(focus, aspect)
    const g = goal.current
    g.pos.copy(pos)
    g.target.copy(target)
    if (reduced || g.first) {
      camera.position.copy(pos)
      controls.target.copy(target)
      controls.update()
      g.first = false
      g.flying = false
      controls.enabled = true
    } else {
      g.flying = true
      controls.enabled = false
    }
    // aspect is intentionally excluded: resizing should not re-fly the camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, tick, controls, reduced, camera])

  useFrame((_, dt) => {
    const g = goal.current
    if (!g.flying || !controls) return
    const k = 1 - Math.exp(-dt * 3.2)
    camera.position.lerp(g.pos, k)
    controls.target.lerp(g.target, k)
    controls.update()
    if (camera.position.distanceTo(g.pos) < 0.04 && controls.target.distanceTo(g.target) < 0.04) {
      g.flying = false
      controls.enabled = true
    }
  })
  return null
}

function World({ wb }: { wb: Workbench }) {
  const { derived: d, mode, payload } = wb
  const guardOn = mode === 'guarded' || wb.ref.kind === 'break'
  const st = d.status
  const slots = VERIFIER_IDS.map((v) => st[v]) as [typeof st.verifierA, typeof st.verifierB, typeof st.verifierC]
  const slot0 = d.receipt.stateDiff?.find((r) => r.field.startsWith('Storage slot 0')) ?? null

  return (
    <>
      <color attach="background" args={[COL.void]} />
      <fog attach="fog" args={[COL.void, 20, 52]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 9, 6]} intensity={60} color={COL.orange} distance={40} decay={2} />
      <pointLight position={[-9, 4, 6]} intensity={22} color="#ffd9b8" distance={30} decay={2} />
      <directionalLight position={[4, 10, 8]} intensity={0.5} />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#0c0a08" roughness={1} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        args={[60, 60]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#2a241d"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#5a2d14"
        fadeDistance={42}
        fadeStrength={1.4}
        infiniteGrid
      />

      <ProposalBillboard status={st.proposal} onSelect={wb.focusNode} />
      <PayloadCrate stage={d.stage} status={st.payload} open={wb.crateOpen} payload={payload} onSelect={wb.focusNode} onToggle={wb.toggleCrate} />

      {(['verifierA', 'verifierB', 'verifierC'] as const).map((id) => (
        <VerifierOrb key={id} id={id} letter={id.slice(-1)} status={st[id]} onSelect={wb.focusNode} />
      ))}
      {(['verifierA', 'verifierB', 'verifierC'] as const).map((id) => (
        <Beam key={id} from={WORLD[id]} to={WORLD.registry} status={st[id]} />
      ))}
      <RegistryRing status={st.registry} slots={slots} attested={d.attested} onSelect={wb.focusNode} />
      <Beam from={[0, WORLD.registry[1] - 1.35, WORLD.registry[2]]} to={[0, 3.7, WORLD.gate[2]]} status={st.registry} />

      <GuardGate status={st.gate} guardOn={guardOn} delegate={payload.operation === 'DELEGATECALL'} onSelect={wb.focusNode} />
      <VaultCube balance={d.vault.balance} core={d.vault.core} status={st.vault} onSelect={wb.focusNode} />

      <BlockRow receipt={d.receipt} />
      <StorageGrid visible={wb.selected === 'vault'} slot0={slot0} landed={d.receipt.landed} />

      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={3} maxDistance={36} minPolarAngle={0.2} maxPolarAngle={1.62} />
      <CameraRig focus={wb.focus} tick={wb.focusTick} reduced={wb.reducedMotion} />
    </>
  )
}

export default function Scene({ wb }: { wb: Workbench }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [-1.2, 6, 15], fov: 48, near: 0.1, far: 140 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'pan-y' }}
    >
      <ReducedMotionProvider value={wb.reducedMotion}>
        <Suspense fallback={null}>
          <World wb={wb} />
        </Suspense>
      </ReducedMotionProvider>
    </Canvas>
  )
}
