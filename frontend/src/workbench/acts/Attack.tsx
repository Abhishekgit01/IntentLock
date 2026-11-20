import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { ArrowRight, RotateCcw, Shield } from "lucide-react";
import { ATTACK, fill } from "../story";

/* Local palette for this act (the workbench keeps its own literal colors; no tokens are touched). */
const C = {
  cream: "#F5EEDF",
  dim: "#8a8071",
  line: "#3a332b",
  panel: "#14110e",
  orange: "#FF5B14",
  red: "#FF3B30",
  green: "#7ACB8A",
  amber: "#E3A73B",
  kraft: "#7d6244",
  kraftDark: "#5a4630",
  kraftTop: "#a07f55",
};

const { w: W, h: H, view: VIEW } = ATTACK.scene;
const BELT_Y = 400;
const SCANNER_X = 440;

function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** Animated count toward `target`. Counting down animates; counting up (going back a step) snaps. */
function useCounter(target: number, ms: number, reduced: boolean, resetKey: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced || target >= cur.current) {
      cur.current = target;
      setV(target);
      return;
    }
    const c = animate(cur.current, target, {
      duration: ms / 1000,
      ease: "easeInOut",
      onUpdate: (x) => {
        cur.current = x;
        setV(x);
      },
    });
    return () => c.stop();
  }, [target, ms, reduced, resetKey]);
  return v;
}

/** Tween the visible window of the scene. Used as a camera on narrow screens. */
function useWindow(x: number, w: number, reduced: boolean) {
  const [vb, setVb] = useState({ x, w });
  const cur = useRef(vb);
  useEffect(() => {
    if (reduced) {
      cur.current = { x, w };
      setVb(cur.current);
      return;
    }
    const from = cur.current;
    const c = animate(0, 1, {
      duration: 0.9,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (t) => {
        const n = { x: from.x + (x - from.x) * t, w: from.w + (w - from.w) * t };
        cur.current = n;
        setVb(n);
      },
    });
    return () => c.stop();
  }, [x, w, reduced]);
  return vb;
}

const CROWBAR =
  "M -34 -16 L 22 -92 M 22 -92 Q 40 -112 58 -96 Q 66 -86 54 -78 M -34 -16 Q -44 -8 -30 -4";

function Parcel({ xray, crowbar, reduced }: { xray: boolean; crowbar: boolean; reduced: boolean }) {
  const t = { duration: reduced ? 0 : 0.7 };
  return (
    <g>
      {/* crowbar sits inside the box and shows through the transparent shell */}
      <motion.g
        initial={false}
        animate={{ opacity: xray && crowbar ? 1 : 0 }}
        transition={t}
        transform="translate(0 0)"
      >
        <path
          d={CROWBAR}
          fill="none"
          stroke={C.red}
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(4 -6)"
        />
        <path
          d={CROWBAR}
          fill="none"
          stroke={C.cream}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(4 -6)"
          opacity="0.7"
        />
      </motion.g>
      <motion.g initial={false} animate={{ opacity: xray ? 0.2 : 1 }} transition={t}>
        <polygon
          points="85,-120 115,-150 115,-30 85,0"
          fill={C.kraftDark}
          stroke="#2a2016"
          strokeWidth="2"
        />
        <polygon
          points="-85,-120 -55,-150 115,-150 85,-120"
          fill={C.kraftTop}
          stroke="#2a2016"
          strokeWidth="2"
        />
        <rect
          x="-85"
          y="-120"
          width="170"
          height="120"
          fill={C.kraft}
          stroke="#2a2016"
          strokeWidth="2"
        />
        <rect x="-13" y="-120" width="26" height="120" fill="#c9b08a" opacity="0.55" />
        <polygon points="-13,-120 -3,-150 23,-150 13,-120" fill="#c9b08a" opacity="0.55" />
      </motion.g>
      <motion.g initial={false} animate={{ opacity: xray ? 0 : 1 }} transition={t}>
        <rect x="-74" y="-96" width="148" height="66" rx="3" fill="#efe6d2" />
        {ATTACK.parcel.labelLines.map((l, i) => (
          <text
            key={l}
            x="0"
            y={-74 + i * 19}
            textAnchor="middle"
            fontSize="16"
            fontWeight="800"
            fill="#1e1913"
            className="font-display"
          >
            {l}
          </text>
        ))}
        <rect x="-44" y="-52" width="88" height="17" rx="2" fill={C.amber} />
        <text
          x="0"
          y="-39.5"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          letterSpacing="1.2"
          fill="#1e1913"
          className="font-mono"
        >
          {ATTACK.parcel.tag}
        </text>
      </motion.g>
    </g>
  );
}

function Brain() {
  return (
    <g>
      <path
        d="M -62 8 C -84 -32 -42 -74 0 -62 C 42 -78 88 -36 62 6 C 78 42 30 62 0 50 C -32 64 -78 46 -62 8 Z"
        fill="#2a1d15"
        stroke={C.orange}
        strokeWidth="3"
      />
      <path
        d="M 0 -60 C -8 -30 8 -10 0 48 M -40 -20 C -20 -12 -20 8 -44 14 M 40 -22 C 20 -12 22 10 46 14"
        fill="none"
        stroke={C.orange}
        strokeWidth="2"
        opacity="0.7"
      />
      <circle cx="0" cy="-6" r="7" fill={C.orange} />
    </g>
  );
}

function Scene({
  step,
  balance,
  reduced,
  vb,
}: {
  step: number;
  balance: number;
  reduced: boolean;
  vb: { x: number; w: number };
}) {
  const s = ATTACK.steps[step].scene;
  const dur = reduced ? 0 : 0.9;
  const rerouted = s.pointer === "attacker";
  const draining = step === ATTACK.steps.length - 1;
  const arrowHome = "M 972 278 Q 1012 250 1060 238";
  const arrowAttacker = "M 972 292 Q 1018 330 1060 372";

  return (
    <svg
      viewBox={`${vb.x} ${VIEW.y} ${vb.w} ${VIEW.h}`}
      className="block h-auto w-full"
      role="img"
      aria-label={ATTACK.stageLabel}
    >
      <style>{`
        @keyframes a1-belt { to { stroke-dashoffset: -44 } }
        @keyframes a1-scan { 0% { transform: translateY(0) } 100% { transform: translateY(210px) } }
        .a1-belt { animation: a1-belt 1.1s linear infinite }
        .a1-scan { animation: a1-scan 1.3s ease-in-out infinite alternate }
        @media (prefers-reduced-motion: reduce) { .a1-belt, .a1-scan { animation: none } }
      `}</style>
      <defs>
        <marker
          id="a1-arrow-home"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.cream} />
        </marker>
        <marker
          id="a1-arrow-bad"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.red} />
        </marker>
      </defs>

      {/* floor + faint grid */}
      <rect x="0" y="470" width={W} height={H - 470} fill="#0c0a08" />
      <g stroke="#1f1a15" strokeWidth="1">
        {Array.from({ length: 33 }, (_, i) => (
          <line key={i} x1={i * 40} y1="470" x2={i * 40} y2={H} />
        ))}
        {[490, 515, 545].map((y) => (
          <line key={y} x1="0" y1={y} x2={W} y2={y} />
        ))}
      </g>

      {/* conveyor belt */}
      <rect
        x="30"
        y={BELT_Y}
        width="720"
        height="44"
        rx="22"
        fill="#1b1713"
        stroke={C.line}
        strokeWidth="2"
      />
      <line
        x1="56"
        y1={BELT_Y + 22}
        x2="724"
        y2={BELT_Y + 22}
        stroke="#4a4238"
        strokeWidth="4"
        strokeDasharray="14 30"
        className="a1-belt"
      />
      <circle cx="52" cy={BELT_Y + 22} r="14" fill="#0e0c0a" stroke={C.dim} strokeWidth="2" />
      <circle cx="728" cy={BELT_Y + 22} r="14" fill="#0e0c0a" stroke={C.dim} strokeWidth="2" />
      <rect x="120" y={BELT_Y + 44} width="12" height="40" fill="#1b1713" />
      <rect x="650" y={BELT_Y + 44} width="12" height="40" fill="#1b1713" />

      {/* scanner arch */}
      <motion.polygon
        points={`${SCANNER_X - 70},172 ${SCANNER_X + 70},172 ${SCANNER_X + 128},${BELT_Y} ${SCANNER_X - 128},${BELT_Y}`}
        fill={C.amber}
        initial={false}
        animate={{ opacity: s.scanning ? 0.16 : 0.04 }}
        transition={{ duration: dur }}
      />
      {s.scanning && !reduced && (
        <rect
          x={SCANNER_X - 118}
          y="176"
          width="236"
          height="6"
          fill={C.amber}
          opacity="0.85"
          className="a1-scan"
        />
      )}
      <rect
        x="316"
        y="150"
        width="26"
        height={BELT_Y - 150}
        fill="#1d1813"
        stroke={C.line}
        strokeWidth="2"
      />
      <rect
        x="538"
        y="150"
        width="26"
        height={BELT_Y - 150}
        fill="#1d1813"
        stroke={C.line}
        strokeWidth="2"
      />
      <rect
        x="306"
        y="126"
        width="268"
        height="48"
        rx="8"
        fill="#1d1813"
        stroke={s.scanning ? C.amber : C.line}
        strokeWidth="2.5"
      />
      <text
        x={SCANNER_X}
        y="157"
        textAnchor="middle"
        fontSize="20"
        fontWeight="800"
        letterSpacing="3"
        fill={s.scanning ? C.amber : C.dim}
        className="font-mono"
      >
        {ATTACK.scanner.label}
      </text>

      {/* parcel */}
      <motion.g
        initial={false}
        animate={{ x: s.parcelX, opacity: s.parcelOpacity }}
        transition={{ duration: dur * 1.3, ease: [0.4, 0, 0.2, 1] }}
        style={{ y: BELT_Y }}
      >
        <Parcel xray={s.xray} crowbar={s.crowbar} reduced={reduced} />
      </motion.g>

      {/* crowbar callout */}
      <motion.g
        initial={false}
        animate={{ opacity: s.crowbar && s.parcelOpacity > 0 ? 1 : 0 }}
        transition={{ duration: dur }}
      >
        <rect
          x={SCANNER_X - 104}
          y="186"
          width="208"
          height="52"
          rx="6"
          fill="#1a0f0c"
          stroke={C.red}
          strokeWidth="2"
        />
        <text
          x={SCANNER_X}
          y="209"
          textAnchor="middle"
          fontSize="19"
          fontWeight="800"
          fill={C.red}
          className="font-display"
        >
          {ATTACK.crowbar.label}
        </text>
        <text
          x={SCANNER_X}
          y="228"
          textAnchor="middle"
          fontSize="15"
          fontWeight="700"
          fill={C.cream}
          className="font-mono"
        >
          {`${ATTACK.crowbar.arrow} ${ATTACK.crowbar.target}`}
        </text>
      </motion.g>

      {/* vault */}
      <g>
        <rect
          x="790"
          y="150"
          width="270"
          height="290"
          rx="14"
          fill={C.panel}
          stroke={rerouted ? C.red : C.line}
          strokeWidth="3"
        />
        <rect
          x="806"
          y="166"
          width="238"
          height="258"
          rx="8"
          fill="#0d0b09"
          stroke="#2a241d"
          strokeWidth="2"
        />
        <text
          x="925"
          y="146"
          textAnchor="middle"
          fontSize="15"
          fontWeight="800"
          letterSpacing="3"
          fill={C.dim}
          className="font-mono"
        >
          {ATTACK.vault.title}
        </text>
        <g transform="translate(900 290)">
          <Brain />
        </g>
        <text x="900" y="378" textAnchor="middle" fontSize="13" fill={C.dim} className="font-mono">
          {ATTACK.vault.brainLabel}
        </text>
        <rect
          x="820"
          y="396"
          width="82"
          height="22"
          rx="4"
          fill="#2a1410"
          stroke={C.red}
          strokeWidth="1.5"
        />
        <text
          x="861"
          y="411.5"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          letterSpacing="1.4"
          fill={C.red}
          className="font-mono"
        >
          {ATTACK.vault.noGuard}
        </text>
      </g>

      {/* balance */}
      <text
        x="925"
        y="62"
        textAnchor="middle"
        fontSize="13"
        letterSpacing="2"
        fill={C.dim}
        className="font-mono"
      >
        {ATTACK.vault.balanceLabel.toUpperCase()}
      </text>
      <text
        x="925"
        y="102"
        textAnchor="middle"
        fontSize="40"
        fontWeight="700"
        fill={balance <= 0.0005 ? C.red : draining ? C.red : C.cream}
        className="font-mono"
      >
        {`${balance.toFixed(3)} ${ATTACK.vault.unit}`}
      </text>
      {/* implementation pointer and its targets */}
      <g>
        <motion.g
          initial={false}
          animate={{ opacity: rerouted ? 0.3 : 1 }}
          transition={{ duration: dur }}
        >
          <rect
            x="1060"
            y="208"
            width="200"
            height="58"
            rx="6"
            fill={C.panel}
            stroke={C.cream}
            strokeWidth="2"
          />
          <text
            x="1160"
            y="231"
            textAnchor="middle"
            fontSize="13"
            fill={C.dim}
            className="font-mono"
          >
            {ATTACK.vault.logic.label}
          </text>
          <text
            x="1160"
            y="253"
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            fill={C.cream}
            className="font-mono"
          >
            {ATTACK.vault.logic.value}
          </text>
        </motion.g>
        <motion.g
          initial={false}
          animate={{ opacity: rerouted ? 1 : 0.35 }}
          transition={{ duration: dur }}
        >
          <rect
            x="1060"
            y="346"
            width="200"
            height="58"
            rx="6"
            fill="#1a0f0c"
            stroke={C.red}
            strokeWidth="2"
          />
          <text
            x="1160"
            y="369"
            textAnchor="middle"
            fontSize="13"
            fill={C.red}
            className="font-mono"
          >
            {ATTACK.vault.attacker.label}
          </text>
          <text
            x="1160"
            y="391"
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            fill={C.cream}
            className="font-mono"
          >
            {ATTACK.vault.attacker.value}
          </text>
        </motion.g>
        <motion.path
          initial={false}
          animate={{ d: rerouted ? arrowAttacker : arrowHome, stroke: rerouted ? C.red : C.cream }}
          transition={{ duration: dur * 1.2, ease: [0.4, 0, 0.2, 1] }}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          markerEnd={rerouted ? "url(#a1-arrow-bad)" : "url(#a1-arrow-home)"}
        />
        {draining &&
          !reduced &&
          [0, 1, 2, 3, 4].map((i) => (
            <motion.circle
              key={`${i}-${step}`}
              r="7"
              fill={C.amber}
              initial={{ cx: 940, cy: 300, opacity: 0 }}
              animate={{ cx: [940, 1060], cy: [300, 372], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.9, delay: i * 0.45, repeat: 4, ease: "easeIn" }}
            />
          ))}
      </g>
    </svg>
  );
}

function HexStrip({ shown }: { shown: boolean }) {
  const { segments, callouts, title, placeholder } = ATTACK.hex;
  const tone = (k: string) => (k === "selector" ? C.amber : k === "operation" ? C.red : C.cream);
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-[#2f2922] bg-[#0b0a08] p-4 md:p-5"
    >
      <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#a89f90]">
        {title}
      </h2>
      {shown ? (
        <>
          <div className="mt-3 overflow-x-auto pb-2" tabIndex={0} aria-label={title}>
            <dl className="w-max font-mono text-[13px] leading-[1.9]">
              {segments.map((s) => (
                <div key={s.label} className="flex items-baseline gap-4">
                  <dt className="w-[5.5rem] shrink-0 text-[10px] uppercase tracking-wider text-[#6a6154]">
                    {s.label}
                  </dt>
                  <dd>
                    {s.kind === "operation" ? (
                      <>
                        <span className="text-[#6a6154]">{s.hex.slice(0, -2)}</span>
                        <span
                          className="rounded bg-[#FF3B30]/25 px-0.5 font-bold"
                          style={{ color: C.red }}
                        >
                          {s.hex.slice(-2)}
                        </span>
                      </>
                    ) : s.kind === "selector" ? (
                      <span
                        className="rounded bg-[#E3A73B]/20 px-1 font-bold"
                        style={{ color: C.amber }}
                      >
                        {s.hex}
                      </span>
                    ) : (
                      <span className="text-[#c9bda8]">{s.hex}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {callouts.map((c) => (
              <li
                key={c.term}
                className="rounded-xl border px-3.5 py-2.5"
                style={{ borderColor: tone(c.kind) }}
              >
                <span className="font-mono text-[12px] font-bold" style={{ color: tone(c.kind) }}>
                  {c.term}
                </span>
                <span className="mt-0.5 block text-[14px] text-[#F5EEDF]">{c.note}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm text-[#a89f90]">{placeholder}</p>
      )}
    </section>
  );
}

export default function Attack({ onDefense }: { onDefense: () => void }) {
  const reducedPref = useReducedMotion();
  const reduced = !!reducedPref;
  const narrow = useNarrow();
  const [step, setStep] = useState(0);
  const [nonce, setNonce] = useState(0);
  const last = ATTACK.steps.length - 1;
  const s = ATTACK.steps[step];
  const balance = useCounter(s.scene.balance, ATTACK.vault.drainMs, reduced, nonce);
  const target = narrow ? s.scene.focus : { x: 0, w: W };
  const vb = useWindow(target.x, target.w, reduced);
  const c = ATTACK.controls;
  const hexRef = useRef<HTMLDivElement>(null);
  const hexShown = s.scene.hex;
  useEffect(() => {
    if (hexShown)
      hexRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }, [hexShown, reduced]);

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-5 md:px-6 md:py-6">
        <header>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#a89f90]">
            {ATTACK.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight md:text-5xl">
            {ATTACK.title}
          </h1>
          <p className="mt-2 max-w-2xl text-[#c9c0b0] md:text-lg">{ATTACK.intro}</p>
        </header>

        <div className="overflow-hidden rounded-3xl border border-[#2f2922] bg-[#0a0907]">
          <Scene step={step} balance={balance} reduced={reduced} vb={vb} />
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF5B14]">
              {fill(c.step, { n: step + 1, d: ATTACK.steps.length })}
            </p>
            <p
              aria-live="polite"
              className="mt-1 min-h-[3.5rem] font-display text-2xl font-bold leading-snug md:text-3xl"
            >
              {s.caption}
            </p>
          </div>
          <div role="group" aria-label={c.group} className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStep((n) => Math.max(0, n - 1))}
              disabled={step === 0}
              className="rounded-full border border-[#5a4d3f] px-5 py-2.5 text-sm font-bold hover:border-[#F5EEDF] disabled:opacity-35"
            >
              {c.back}
            </button>
            {step < last ? (
              <button
                type="button"
                onClick={() => setStep((n) => Math.min(last, n + 1))}
                className="inline-flex items-center gap-2 rounded-full bg-[#FF5B14] px-5 py-2.5 text-sm font-bold text-[#120f0c] hover:bg-[#ff7a3a]"
              >
                {c.next}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={onDefense}
                className="inline-flex items-center gap-2 rounded-full bg-[#FF5B14] px-5 py-2.5 text-sm font-bold text-[#120f0c] hover:bg-[#ff7a3a]"
              >
                <Shield className="size-4" aria-hidden />
                {c.toDefense}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStep(0);
                setNonce((n) => n + 1);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[#5a4d3f] px-4 py-2.5 text-sm font-bold hover:border-[#F5EEDF]"
            >
              <RotateCcw className="size-4" aria-hidden />
              {c.replay}
            </button>
          </div>
        </div>

        <div ref={hexRef}>
          <HexStrip shown={s.scene.hex} />
        </div>
      </div>
    </div>
  );
}
