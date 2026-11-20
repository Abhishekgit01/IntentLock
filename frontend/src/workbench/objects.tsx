import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Edges, Line, Text } from "@react-three/drei";
import * as THREE from "three";
// Bundled locally so labels render without a network request.
import FONT from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url";
import {
  PAYLOAD_STAGE_X,
  PROPOSAL,
  REGISTRY,
  STATUS_WORDS,
  VAULT,
  WORLD,
  type NodeId,
  type PayloadFields,
  type PayloadStage,
  type Status,
  type VaultCore,
} from "./scenes";

export const COL = {
  orange: "#FF5B14",
  green: "#7ACB8A",
  red: "#FF3B30",
  amber: "#E3A73B",
  cream: "#F5EEDF",
  dim: "#7a7064",
  off: "#3a352e",
  panel: "#15120f",
  void: "#070605",
} as const;

export const statusColor = (s: Status): string =>
  ({
    idle: COL.dim,
    active: COL.orange,
    ok: COL.green,
    bad: COL.red,
    warn: COL.amber,
    off: COL.off,
  })[s];

const MotionCtx = createContext(false);
export const ReducedMotionProvider = MotionCtx.Provider;
export const useReduced = () => useContext(MotionCtx);

type Vec3 = readonly [number, number, number];
const v3 = (a: Vec3) => [a[0], a[1], a[2]] as [number, number, number];

/* ---------- shared bits ---------- */

function T({
  children,
  size = 0.2,
  color = COL.cream,
  ...rest
}: { children: ReactNode; size?: number; color?: string } & Record<string, unknown>) {
  return (
    <Text
      font={FONT}
      fontSize={size}
      color={color}
      anchorX="center"
      anchorY="middle"
      outlineWidth={size * 0.06}
      outlineColor={COL.void}
      {...rest}
    >
      {children}
    </Text>
  );
}

function Glow({
  color,
  intensity = 1.6,
  opacity = 1,
}: {
  color: string;
  intensity?: number;
  opacity?: number;
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={intensity}
      toneMapped={false}
      transparent={opacity < 1}
      opacity={opacity}
    />
  );
}

function Halo({
  color,
  radius,
  opacity = 0.13,
}: {
  color: string;
  radius: number;
  opacity?: number;
}) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 24, 24]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Pick({
  id,
  onSelect,
  children,
  position,
  rotation,
}: {
  id: NodeId;
  onSelect: (id: NodeId) => void;
  children: ReactNode;
  position: Vec3;
  rotation?: [number, number, number];
}) {
  return (
    <group
      position={v3(position)}
      rotation={rotation}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      {children}
    </group>
  );
}

const damp = THREE.MathUtils.damp;

/* ---------- proposal billboard ---------- */

export function ProposalBillboard({
  status,
  title,
  tag,
  signerCount,
  safeTransactionCount,
  onSelect,
}: {
  status: Status;
  title?: string | null;
  tag?: string;
  signerCount?: number | null;
  safeTransactionCount?: number | null;
  onSelect: (id: NodeId) => void;
}) {
  const frame = status === "idle" ? COL.dim : statusColor(status);
  return (
    <Pick id="proposal" onSelect={onSelect} position={WORLD.proposal} rotation={[0, 0.38, 0]}>
      <mesh>
        <boxGeometry args={[4.6, 2.7, 0.14]} />
        <meshStandardMaterial color="#181410" roughness={0.85} />
        <Edges color={frame} lineWidth={2} />
      </mesh>
      <mesh position={[0, -1.875, -0.02]}>
        <cylinderGeometry args={[0.06, 0.06, 1.05, 10]} />
        <meshStandardMaterial color="#2a241d" />
      </mesh>
      <T position={[0, 0.92, 0.1]} size={0.17} color={COL.dim}>
        PROPOSAL · WHAT SIGNERS SEE
      </T>
      <T
        position={[0, 0.12, 0.1]}
        size={title && title.length > 30 ? 0.2 : 0.37}
        maxWidth={4}
        textAlign="center"
        lineHeight={1.15}
      >
        {title || PROPOSAL.title}
      </T>
      {signerCount && safeTransactionCount ? (
        <group position={[0, -0.36, 0.14]}>
          <group position={[0, 0.12, 0]}>
            {Array.from({ length: signerCount }, (_, index) => {
              const x = (index - (signerCount - 1) / 2) * 0.38;
              return (
                <group key={index} position={[x, 0, 0]}>
                  <mesh>
                    <sphereGeometry args={[0.11, 16, 16]} />
                    <meshStandardMaterial
                      color={COL.amber}
                      emissive={COL.amber}
                      emissiveIntensity={0.7}
                      toneMapped={false}
                    />
                  </mesh>
                  <T position={[0, 0, 0.12]} size={0.075} color={COL.void}>
                    {index + 1}
                  </T>
                </group>
              );
            })}
          </group>
          <T position={[0, -0.12, 0]} size={0.095} color={COL.amber}>
            {`${signerCount} SIGNERS · ${safeTransactionCount} SAFE TX`}
          </T>
        </group>
      ) : null}
      <mesh position={[0, -0.88, 0.09]}>
        <boxGeometry args={[1.9, 0.42, 0.04]} />
        <meshStandardMaterial color="#2a1e0b" />
        <Edges color={COL.amber} lineWidth={1.5} />
      </mesh>
      <T position={[0, -0.88, 0.13]} size={0.19} color={COL.amber}>
        {tag || PROPOSAL.tag}
      </T>
    </Pick>
  );
}

/* ---------- payload crate ---------- */

export function PayloadCrate({
  stage,
  status,
  open,
  payload,
  onSelect,
  onToggle,
}: {
  stage: PayloadStage;
  status: Status;
  open: boolean;
  payload: PayloadFields;
  onSelect: (id: NodeId) => void;
  onToggle: () => void;
}) {
  const reduced = useReduced();
  const root = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const lidL = useRef<THREE.Group>(null);
  const lidR = useRef<THREE.Group>(null);
  const card = useRef<THREE.Group>(null);
  const openT = useRef(0);
  const color = status === "bad" ? COL.red : status === "ok" ? COL.green : COL.orange;
  const danger = payload.operation === "DELEGATECALL";

  useFrame((s, dt) => {
    if (!root.current) return;
    const rate = reduced ? 1000 : stage === "bounce" ? 5 : 2.6;
    root.current.position.x = damp(root.current.position.x, PAYLOAD_STAGE_X[stage], rate, dt);
    root.current.position.y =
      WORLD.payload[1] + (reduced ? 0 : Math.sin(s.clock.elapsedTime * 1.4) * 0.05);
    openT.current = damp(openT.current, open ? 1 : 0, reduced ? 1000 : 5, dt);
    const o = openT.current;
    if (lidL.current) lidL.current.rotation.z = o * 1.15;
    if (lidR.current) lidR.current.rotation.z = -o * 1.15;
    if (card.current) {
      card.current.scale.setScalar(Math.max(0.0001, o));
      card.current.visible = o > 0.02;
    }
    if (core.current && !reduced) {
      core.current.rotation.y += dt * 0.9;
      core.current.rotation.x += dt * 0.5;
    }
  });

  const rows: [string, string, string?][] = [
    ["operation", payload.operation, danger ? COL.red : COL.green],
    ["to", payload.to],
    ["value", payload.value],
    ["data", payload.data],
    [
      "decoded intent",
      payload.decodedIntent,
      danger || payload.value === "10.000 ETH" ? COL.red : COL.cream,
    ],
  ];

  return (
    <group ref={root} position={[PAYLOAD_STAGE_X.home, WORLD.payload[1], WORLD.payload[2]]}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelect("payload");
          onToggle();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <mesh>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.16}
            depthWrite={false}
            roughness={0.3}
          />
          <Edges color={color} lineWidth={2} />
        </mesh>
        <mesh ref={core}>
          <octahedronGeometry args={[0.38, 0]} />
          <Glow color={color} intensity={2.2} />
        </mesh>
        <Halo color={color} radius={0.7} opacity={0.1} />
        <group ref={lidL} position={[-0.75, 0.76, 0]}>
          <mesh position={[0.375, 0, 0]}>
            <boxGeometry args={[0.75, 0.05, 1.5]} />
            <meshStandardMaterial color="#26201a" />
            <Edges color={color} />
          </mesh>
        </group>
        <group ref={lidR} position={[0.75, 0.76, 0]}>
          <mesh position={[-0.375, 0, 0]}>
            <boxGeometry args={[0.75, 0.05, 1.5]} />
            <meshStandardMaterial color="#26201a" />
            <Edges color={color} />
          </mesh>
        </group>
      </group>
      <T position={[0, 1.2, 0]} size={0.22} color={COL.cream}>
        PAYLOAD · WHAT RUNS
      </T>
      <group ref={card} position={[0, 2.9, 0]} visible={false}>
        <Billboard>
          <mesh>
            <planeGeometry args={[4.3, 2.6]} />
            <meshBasicMaterial color={COL.panel} transparent opacity={0.94} />
            <Edges color={COL.orange} lineWidth={1.5} />
          </mesh>
          {rows.map(([k, val, c], i) => {
            const y = [0.95, 0.52, 0.16, -0.26, -0.82][i];
            return (
              <group key={k} position={[-2.0, y, 0.02]}>
                <T size={0.12} color={COL.dim} anchorX="left" anchorY="top" position={[0, 0.1, 0]}>
                  {k.toUpperCase()}
                </T>
                <T
                  size={0.14}
                  color={c ?? COL.cream}
                  anchorX="left"
                  anchorY="top"
                  maxWidth={3.9}
                  position={[0, -0.08, 0]}
                >
                  {val}
                </T>
              </group>
            );
          })}
        </Billboard>
      </group>
    </group>
  );
}

/* ---------- verifier orbs ---------- */

function KeyIcon({ color }: { color: string }) {
  return (
    <group rotation={[0, 0, 0.55]} scale={1.15}>
      <mesh position={[-0.3, 0, 0]}>
        <torusGeometry args={[0.16, 0.05, 12, 24]} />
        <Glow color={color} intensity={1.8} />
      </mesh>
      <mesh position={[0.05, 0, 0]}>
        <boxGeometry args={[0.6, 0.07, 0.07]} />
        <Glow color={color} intensity={1.8} />
      </mesh>
      <mesh position={[0.2, -0.1, 0]}>
        <boxGeometry args={[0.07, 0.16, 0.07]} />
        <Glow color={color} intensity={1.8} />
      </mesh>
      <mesh position={[0.32, -0.08, 0]}>
        <boxGeometry args={[0.07, 0.12, 0.07]} />
        <Glow color={color} intensity={1.8} />
      </mesh>
    </group>
  );
}

export function VerifierOrb({
  id,
  letter,
  status,
  onSelect,
}: {
  id: NodeId;
  letter: string;
  status: Status;
  onSelect: (id: NodeId) => void;
}) {
  const reduced = useReduced();
  const spin = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Mesh>(null);
  const color = statusColor(status);
  const pos = WORLD[id as "verifierA"];
  useFrame((s, dt) => {
    if (reduced) return;
    if (spin.current) spin.current.rotation.y += dt * 0.7;
    if (shell.current)
      shell.current.scale.setScalar(
        status === "active" ? 1 + Math.sin(s.clock.elapsedTime * 5) * 0.04 : 1,
      );
  });
  return (
    <Pick id={id} onSelect={onSelect} position={pos}>
      <mesh ref={shell}>
        <sphereGeometry args={[0.9, 32, 32]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={status === "off" ? 0.1 : 0.22}
          depthWrite={false}
          roughness={0.2}
        />
        <Edges threshold={30} color={color} lineWidth={1} />
      </mesh>
      <Halo color={color} radius={1.15} opacity={status === "off" ? 0 : 0.1} />
      <group ref={spin}>
        <KeyIcon color={status === "off" ? COL.dim : COL.cream} />
      </group>
      <T position={[0, -1.35, 0]} size={0.28}>{`VERIFIER ${letter}`}</T>
      <T position={[0, -1.72, 0]} size={0.19} color={color}>
        {STATUS_WORDS[status]}
      </T>
    </Pick>
  );
}

/* ---------- beams ---------- */

export function Beam({ from, to, status }: { from: Vec3; to: Vec3; status: Status }) {
  const reduced = useReduced();
  const line = useRef<{ material: { dashOffset: number } } | null>(null);
  const live = status === "ok" || status === "bad" || status === "active" || status === "warn";
  useFrame((_, dt) => {
    if (!reduced && live && line.current) line.current.material.dashOffset -= dt * 0.9;
  });
  const points = useMemo(() => [new THREE.Vector3(...from), new THREE.Vector3(...to)], [from, to]);
  return (
    <Line
      ref={line as never}
      points={points}
      color={statusColor(status)}
      lineWidth={live ? 2.6 : 1.2}
      dashed
      dashSize={0.28}
      gapSize={0.2}
      transparent
      opacity={live ? 0.95 : 0.4}
    />
  );
}

/* ---------- registry ring ---------- */

const SLOT_ANGLES = [90, 210, 330].map((d) => (d * Math.PI) / 180);

export function RegistryRing({
  status,
  slots,
  attested,
  onSelect,
}: {
  status: Status;
  slots: [Status, Status, Status];
  attested: number;
  onSelect: (id: NodeId) => void;
}) {
  const color = statusColor(status);
  return (
    <Pick id="registry" onSelect={onSelect} position={WORLD.registry}>
      <mesh>
        <torusGeometry args={[1.35, 0.1, 16, 72]} />
        <Glow color={color} intensity={status === "off" ? 0.2 : 1.4} />
      </mesh>
      <mesh>
        <circleGeometry args={[1.28, 48]} />
        <meshBasicMaterial color={COL.panel} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {SLOT_ANGLES.map((a, i) => (
        <group key={i} position={[Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.16, 28]} />
            <Glow
              color={statusColor(slots[i])}
              intensity={
                slots[i] === "ok" ? 2 : slots[i] === "idle" || slots[i] === "off" ? 0.25 : 1.2
              }
            />
          </mesh>
        </group>
      ))}
      <T
        position={[0, 0.2, 0.05]}
        size={0.25}
      >{`${REGISTRY.needed} OF ${REGISTRY.total} NEEDED`}</T>
      <T position={[0, -0.2, 0.05]} size={0.19} color={color}>{`${attested} attested`}</T>
      <T position={[0, -1.85, 0]} size={0.19} color={COL.cream}>
        ATTESTATION REGISTRY
      </T>
    </Pick>
  );
}

/* ---------- guard gate ---------- */

export function GuardGate({
  status,
  guardOn,
  delegate,
  onSelect,
}: {
  status: Status;
  guardOn: boolean;
  delegate: boolean;
  onSelect: (id: NodeId) => void;
}) {
  const reduced = useReduced();
  const frame = !guardOn
    ? COL.off
    : status === "bad"
      ? COL.red
      : status === "ok"
        ? COL.green
        : COL.orange;
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: COL.red,
        emissive: COL.red,
        emissiveIntensity: 1.6,
        toneMapped: false,
      }),
    [],
  );
  useFrame((s) => {
    const base = status === "bad" ? 2.6 : 1.5;
    mat.emissiveIntensity = reduced ? base : base + Math.sin(s.clock.elapsedTime * 6) * 0.5;
  });
  const lines = [0, 1, 2, 3, 4, 5, 6];
  return (
    <Pick id="gate" onSelect={onSelect} position={WORLD.gate}>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]}>
          <boxGeometry args={[0.5, 3.4, 0.5]} />
          <meshStandardMaterial color="#1d1813" roughness={0.7} />
          <Edges color={frame} lineWidth={2} />
        </mesh>
      ))}
      <mesh position={[0, 3.45, 0]}>
        <boxGeometry args={[3.7, 0.5, 0.5]} />
        <meshStandardMaterial color="#1d1813" roughness={0.7} />
        <Edges color={frame} lineWidth={2} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[3.7, 0.06, 1.1]} />
        <meshStandardMaterial color="#1d1813" />
        <Edges color={frame} />
      </mesh>
      {guardOn && delegate && (
        <group position={[0, 1.7, 0]}>
          {lines.map((i) => (
            <mesh key={`v${i}`} position={[-1.3 + i * 0.4333, 0, 0]} material={mat}>
              <boxGeometry args={[0.035, 2.95, 0.035]} />
            </mesh>
          ))}
          {lines.map((i) => (
            <mesh key={`h${i}`} position={[0, -1.3 + i * 0.4333, 0]} material={mat}>
              <boxGeometry args={[2.7, 0.035, 0.035]} />
            </mesh>
          ))}
        </group>
      )}
      {guardOn && !delegate && (
        <mesh position={[0, 1.7, 0]}>
          <planeGeometry args={[2.7, 2.95]} />
          <meshBasicMaterial
            color={status === "ok" ? COL.green : COL.orange}
            transparent
            opacity={0.09}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <T position={[0, 4.2, 0]} size={0.28}>
        GUARD GATE
      </T>
      <T
        position={[0, 3.9, 0]}
        size={0.17}
        color={guardOn ? (delegate ? COL.red : COL.orange) : COL.dim}
      >
        {!guardOn ? "NO GUARD" : delegate ? "LASER GRID · DELEGATECALL" : "SCANNING · PLAIN CALL"}
      </T>
    </Pick>
  );
}

/* ---------- vault ---------- */

export function VaultCube({
  balance,
  core,
  implementation,
  status,
  onSelect,
}: {
  balance: number | null;
  core: VaultCore;
  implementation?: string | null;
  status: Status;
  onSelect: (id: NodeId) => void;
}) {
  const reduced = useReduced();
  const coreMesh = useRef<THREE.Mesh>(null);
  const coreColor = core === "bad" ? COL.red : COL.cream;
  const frame = status === "bad" ? COL.red : status === "ok" ? COL.green : COL.orange;
  const ratio = balance === null ? 0 : Math.min(1, balance / VAULT.startBalance);
  useFrame((_, dt) => {
    if (reduced || !coreMesh.current) return;
    coreMesh.current.rotation.y += dt * 0.8;
    coreMesh.current.rotation.x += dt * 0.35;
  });
  return (
    <Pick id="vault" onSelect={onSelect} position={WORLD.vault}>
      <mesh>
        <boxGeometry args={[2.6, 2.6, 2.6]} />
        <meshStandardMaterial color={frame} transparent opacity={0.1} depthWrite={false} />
        <Edges color={frame} lineWidth={2.2} />
      </mesh>
      {ratio > 0.002 && (
        <mesh position={[0, -1.2 + (2.4 * ratio) / 2, 0]}>
          <boxGeometry args={[2.4, 2.4 * ratio, 2.4]} />
          <meshStandardMaterial
            color={COL.amber}
            emissive={COL.amber}
            emissiveIntensity={0.5}
            transparent
            opacity={0.2}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh ref={coreMesh}>
        <icosahedronGeometry args={[0.55, 0]} />
        <Glow color={coreColor} intensity={core === "bad" ? 2.4 : 1.4} />
      </mesh>
      <Halo color={coreColor} radius={0.95} opacity={0.1} />
      <T position={[0, -1.02, 1.5]} size={0.14} color={coreColor}>
        {implementation
          ? `slot 0: ${implementation.slice(0, 12)}…${implementation.slice(-8)}`
          : `slot 0: ${VAULT.cores[core]}`}
      </T>
      <T position={[0, 2.7, 0]} size={0.24} color={COL.cream}>
        VAULT
      </T>
      <T
        position={[0, 2.2, 0]}
        size={balance === null ? 0.22 : 0.46}
        color={status === "bad" ? COL.red : COL.cream}
      >
        {balance === null ? "BALANCE NOT CAPTURED" : `${balance.toFixed(3)} ETH`}
      </T>
      <T position={[0, 1.85, 0]} size={0.15} color={COL.amber}>
        REPLAY VAULT
      </T>
    </Pick>
  );
}
