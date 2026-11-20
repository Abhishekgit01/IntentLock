import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveRun, deriveCustomRun, resolveRun, type Derived } from "./engine";
import {
  TOUR,
  type BreakId,
  type CameraKey,
  type Mode,
  type NodeId,
  type RunRef,
  type ScenarioId,
} from "./scenes";
import {
  createLiveProposal,
  executeLiveProposal,
  getBackendConfig,
  getBackendHealth,
  getChainContext,
  subscribeToProposal,
  type ApiEvent,
  type BackendConfig,
  type BackendHealth,
  type ChainContext,
  type LiveExecutionResult,
  type LiveProposal,
} from "./backend";
import { loadReplayData } from "../replay/loader";
import { adaptReplayToScene, replayDurationMs } from "../replay/adapter";
import type { ReplayData, ReplayRunKey } from "../replay/types";

export type RunStatus = "idle" | "running" | "paused" | "done";
const TICK_MS = 80;

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export interface Workbench {
  reducedMotion: boolean;
  evidenceState: "loading" | "ready" | "unavailable";
  mode: Mode;
  ref: RunRef;
  runStatus: RunStatus;
  elapsedMs: number;
  durationMs: number;
  derived: Derived;
  payload: ReturnType<typeof resolveRun>["payload"];
  focus: CameraKey;
  /** increments on every focus request so the camera re-flies even to the same target */
  focusTick: number;
  selected: NodeId | null;
  crateOpen: boolean;
  tourStep: number | null;
  badges: readonly string[];
  replayEvents: ReturnType<typeof adaptReplayToScene>["events"];
  reportedLabel: string | null;
  reportedTag: string;
  replaySignerCount: number | null;
  replaySafeTransactionCount: number | null;
  replayData: ReplayData | null;
  activeReplayRun: ReplayRunKey;
  chooseReplayRun: (key: ReplayRunKey) => void;
  scrubElapsed: (ms: number) => void;
  togglePlayPause: () => void;
  liveBackend: {
    connection: "loading" | "ready" | "degraded" | "offline";
    health: BackendHealth | null;
    config: BackendConfig | null;
    context: ChainContext | null;
    proposal: LiveProposal | null;
    events: ApiEvent[];
    submitting: boolean;
    executing: boolean;
    executionResult: LiveExecutionResult | null;
    error: string | null;
    streamConnected: boolean;
  };
  setMode: (m: Mode) => void;
  chooseScenario: (id: ScenarioId) => void;
  breakIt: (id: BreakId) => void;
  replay: () => void;
  focusNode: (id: NodeId) => void;
  toggleCrate: () => void;
  startTour: () => void;
  tourNext: () => void;
  tourBack: () => void;
  endTour: () => void;
  analyzeLive: (transaction: Record<string, unknown>) => Promise<void>;
  executeLive: (safeSignatures: string) => Promise<void>;
}

export function useWorkbench(): Workbench {
  const reducedMotion = usePrefersReducedMotion();
  const [mode, setModeState] = useState<Mode>("guarded");
  const [ref, setRef] = useState<RunRef>({ kind: "scenario", id: "delegatecall" });
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [elapsedMs, setElapsed] = useState(0);
  const [focus, setFocus] = useState<CameraKey>("overview");
  const [focusTick, setFocusTick] = useState(0);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [crateOpen, setCrateOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [evidenceState, setEvidenceState] = useState<Workbench["evidenceState"]>("loading");
  const [activeReplayRun, setActiveReplayRun] = useState<ReplayRunKey>("runC");
  const [replayPlayback, setReplayPlayback] = useState(true);

  useEffect(() => {
    let active = true;
    loadReplayData().then((data) => {
      if (!active) return;
      if (data) {
        setReplayData(data);
        setEvidenceState("ready");
      } else setEvidenceState("unavailable");
    });
    return () => {
      active = false;
    };
  }, []);

  const [liveBackend, setLiveBackend] = useState<Workbench["liveBackend"]>({
    connection: "loading",
    health: null,
    config: null,
    context: null,
    proposal: null,
    events: [],
    submitting: false,
    executing: false,
    executionResult: null,
    error: null,
    streamConnected: false,
  });
  const closeEventStream = useRef<(() => void) | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    if (timer.current !== undefined) window.clearInterval(timer.current);
    timer.current = undefined;
  }, []);

  const play = useCallback(
    (nextRef: RunRef, nextMode: Mode) => {
      stop();
      setReplayPlayback(false);
      setRef(nextRef);
      setModeState(nextMode);
      setElapsed(0);
      setRunStatus("running");
      const duration = resolveRun(nextRef, nextMode).durationMs;
      const t0 = performance.now();
      timer.current = window.setInterval(() => {
        const el = performance.now() - t0;
        if (el >= duration) {
          stop();
          setElapsed(duration);
          setRunStatus("done");
        } else setElapsed(el);
      }, TICK_MS);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getBackendHealth(), getBackendConfig(), getChainContext()]).then(
      ([health, config, context]) => {
        if (!active) return;
        const validHealth = health.status === "fulfilled" ? health.value : null;
        const validConfig = config.status === "fulfilled" ? config.value : null;
        const validContext = context.status === "fulfilled" ? context.value : null;
        const ready = Boolean(validHealth && validContext?.ready && validConfig?.safeAddress);
        setLiveBackend((current) => ({
          ...current,
          connection: ready ? "ready" : validConfig || validHealth ? "degraded" : "offline",
          health: validHealth,
          config: validConfig,
          context: validContext,
          error: ready ? null : "Backend, policy, or deployed Safe is not ready.",
        }));
      },
    );
    return () => {
      active = false;
      closeEventStream.current?.();
    };
  }, []);

  const analyzeLive = useCallback(async (transaction: Record<string, unknown>) => {
    closeEventStream.current?.();
    setLiveBackend((current) => ({
      ...current,
      submitting: true,
      error: null,
      proposal: null,
      events: [],
      streamConnected: false,
    }));
    try {
      const [config, context] = await Promise.all([getBackendConfig(), getChainContext()]);
      const proposal = await createLiveProposal(transaction);
      setLiveBackend((current) => ({
        ...current,
        connection: "ready",
        config,
        context,
        proposal,
        submitting: false,
        error: null,
      }));
      closeEventStream.current = subscribeToProposal(
        proposal,
        (event) =>
          setLiveBackend((current) => ({
            ...current,
            streamConnected: true,
            events: current.events.some((item) => item.sequence === event.sequence)
              ? current.events
              : [...current.events, event].sort((left, right) => left.sequence - right.sequence),
          })),
        () => setLiveBackend((current) => ({ ...current, streamConnected: false })),
      );
    } catch (error) {
      setLiveBackend((current) => ({
        ...current,
        submitting: false,
        connection: current.health ? "degraded" : "offline",
        error: error instanceof Error ? error.message : "Live proposal request failed.",
      }));
    }
  }, []);

  const executeLive = useCallback(
    async (safeSignatures: string) => {
      if (!liveBackend.proposal) return;
      setLiveBackend((current) => ({
        ...current,
        executing: true,
        error: null,
      }));
      try {
        const result = await executeLiveProposal(liveBackend.proposal.proposalId, safeSignatures);
        setLiveBackend((current) => ({
          ...current,
          executing: false,
          executionResult: result,
        }));
        const [config, context] = await Promise.all([getBackendConfig(), getChainContext()]);
        setLiveBackend((current) => ({ ...current, config, context }));
      } catch (err) {
        setLiveBackend((current) => ({
          ...current,
          executing: false,
          error: err instanceof Error ? err.message : "Execution failed.",
        }));
      }
    },
    [liveBackend.proposal],
  );

  const setMode = useCallback(
    (m: Mode) => {
      // a break-it run only makes sense with the guard on; toggling off returns to the attack scenario
      const nextRef: RunRef =
        ref.kind === "break" && m === "unguarded" ? { kind: "scenario", id: "delegatecall" } : ref;
      play(nextRef, m);
    },
    [play, ref],
  );
  const chooseScenario = useCallback(
    (id: ScenarioId) => play({ kind: "scenario", id }, mode),
    [play, mode],
  );
  const breakIt = useCallback((id: BreakId) => play({ kind: "break", id }, "guarded"), [play]);
  const replay = useCallback(() => play(ref, mode), [play, ref, mode]);

  const focusNode = useCallback((id: NodeId) => {
    // the vault opens its storage-slot grid, so it gets a closer pose than the tour's vault shot
    setFocus(id === "vault" ? "vaultSlots" : id);
    setFocusTick((n) => n + 1);
    setSelected(id);
  }, []);
  const toggleCrate = useCallback(() => setCrateOpen((o) => !o), []);

  const applyStep = useCallback(
    (i: number) => {
      const step = TOUR[i];
      setTourStep(i);
      setFocus(step.camera);
      setFocusTick((n) => n + 1);
      setSelected(step.select ?? null);
      const a = step.action;
      if (a?.crateOpen !== undefined) setCrateOpen(a.crateOpen);
      if (a?.run) play({ kind: "scenario", id: a.scenario ?? "delegatecall" }, a.mode ?? mode);
    },
    [play, mode],
  );
  const startTour = useCallback(() => applyStep(0), [applyStep]);
  const endTour = useCallback(() => {
    setTourStep(null);
    setFocus("overview");
    setFocusTick((n) => n + 1);
    setSelected(null);
  }, []);
  const tourNext = useCallback(() => {
    if (tourStep === null) return;
    if (tourStep >= TOUR.length - 1) endTour();
    else applyStep(tourStep + 1);
  }, [tourStep, applyStep, endTour]);
  const tourBack = useCallback(() => {
    if (tourStep !== null && tourStep > 0) applyStep(tourStep - 1);
  }, [tourStep, applyStep]);

  const chooseReplayRun = useCallback(
    (key: ReplayRunKey) => {
      stop();
      setReplayPlayback(true);
      setActiveReplayRun(key);
      setModeState(key === "runC" ? "guarded" : "unguarded");
      setCrateOpen(true);
      setElapsed(0);
      setRunStatus("running");
      const scene = adaptReplayToScene(replayData, key);
      const duration = replayDurationMs(scene.events);
      const t0 = performance.now();
      timer.current = window.setInterval(() => {
        const elapsed = performance.now() - t0;
        if (elapsed >= duration) {
          stop();
          setElapsed(duration);
          setRunStatus("done");
        } else setElapsed(elapsed);
      }, TICK_MS);
    },
    [stop, replayData],
  );

  useEffect(() => {
    if (replayData && runStatus === "idle") chooseReplayRun(activeReplayRun);
  }, [replayData, runStatus, activeReplayRun, chooseReplayRun]);

  const scrubElapsed = useCallback(
    (ms: number) => {
      stop();
      setElapsed(ms);
      setRunStatus("done");
    },
    [stop],
  );

  const replayScene = useMemo(
    () => adaptReplayToScene(replayData, activeReplayRun),
    [replayData, activeReplayRun],
  );

  const togglePlayPause = useCallback(() => {
    if (runStatus === "running") {
      stop();
      setRunStatus("paused");
    } else {
      stop();
      const duration = replayPlayback
        ? replayDurationMs(replayScene.events)
        : resolveRun(ref, mode).durationMs;
      const startAt = runStatus === "paused" ? elapsedMs : 0;
      setElapsed(startAt);
      setRunStatus("running");
      const t0 = performance.now() - startAt;
      timer.current = window.setInterval(() => {
        const el = performance.now() - t0;
        if (el >= duration) {
          stop();
          setElapsed(duration);
          setRunStatus("done");
        } else setElapsed(el);
      }, TICK_MS);
    }
  }, [runStatus, replayPlayback, replayScene, ref, mode, elapsedMs, stop]);

  const resolved = useMemo(() => resolveRun(ref, mode), [ref, mode]);
  const replayDuration = replayDurationMs(replayScene.events);
  const durationMs = replayPlayback ? replayDuration : resolved.durationMs;
  const derived = useMemo(() => {
    if (replayPlayback) {
      return deriveCustomRun(
        replayScene.events,
        activeReplayRun === "runC" ? "guarded" : "unguarded",
        runStatus === "idle" ? -1 : elapsedMs,
      );
    }
    return deriveRun(ref, mode, runStatus === "idle" ? -1 : elapsedMs);
  }, [replayPlayback, replayScene, activeReplayRun, runStatus, elapsedMs, ref, mode]);

  return {
    reducedMotion,
    evidenceState,
    mode,
    ref,
    runStatus,
    elapsedMs,
    durationMs,
    derived,
    payload: replayPlayback ? replayScene.payload : resolved.payload,
    focus,
    focusTick,
    selected,
    crateOpen,
    tourStep,
    badges: replayPlayback ? replayScene.badges : [],
    replayEvents: replayPlayback ? replayScene.events : [],
    reportedLabel: replayPlayback ? replayScene.reportedLabel : null,
    reportedTag: replayPlayback ? replayScene.reportedTag : "UNTRUSTED",
    replaySignerCount:
      replayPlayback && activeReplayRun === "runA"
        ? (replayData?.caseFacts?.approvingSignerCount ?? null)
        : null,
    replaySafeTransactionCount:
      replayPlayback && activeReplayRun === "runA"
        ? (replayData?.caseFacts?.safeTransactionCount ?? null)
        : null,
    replayData,
    activeReplayRun,
    chooseReplayRun,
    scrubElapsed,
    togglePlayPause,
    liveBackend,
    setMode,
    chooseScenario,
    breakIt,
    replay,
    focusNode,
    toggleCrate,
    startTour,
    tourNext,
    tourBack,
    endTour,
    analyzeLive,
    executeLive,
  };
}
