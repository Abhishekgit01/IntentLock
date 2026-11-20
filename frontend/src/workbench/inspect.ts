import type { GuardCheck, PayloadFields } from "./scenes";
import type { Receipt } from "./engine";

/* ---------- checks ---------- */

export type CheckView = { name: string; status: "pass" | "fail" | "skipped" | "pending" };

/** Enforces short-circuit: nothing after the first failure counts as run. */
export function normalizeChecks(checks: GuardCheck[]): CheckView[] {
  let failed = false;
  return checks.map((c) => {
    if (failed) return { name: c.name, status: "skipped" };
    if (c.status === "fail") failed = true;
    return { name: c.name, status: c.status };
  });
}

/* ---------- calldata ---------- */

export interface CalldataSegment {
  label: string;
  hex: string;
  kind: "selector" | "arg" | "operation";
}
export interface CalldataView {
  segments: CalldataSegment[];
  plain: string;
  bytes: number;
}

const pad64 = (h: string) => h.toLowerCase().padStart(64, "0");
const padRight64 = (h: string) => h.padEnd(Math.ceil(h.length / 64) * 64, "0");

export function buildCalldata(p: PayloadFields): CalldataView {
  const raw = p.raw.dataHex;
  const selector = /^0x[0-9a-fA-F]{8}/.test(raw) ? raw.slice(0, 10) : "";
  const segments: CalldataSegment[] = selector
    ? [
        { label: "raw selector", hex: selector, kind: "selector" },
        ...(raw.length > 10
          ? [{ label: "raw arguments", hex: raw.slice(10), kind: "arg" as const }]
          : []),
      ]
    : raw && raw !== "not captured"
      ? [{ label: "raw calldata", hex: raw, kind: "arg" }]
      : [];
  const op = p.operation === "not captured" ? "not captured" : p.operation;
  const plain = `Operation ${op}; target ${p.to}; value ${p.value}. Raw calldata is shown exactly as recorded.`;
  return {
    segments,
    plain,
    bytes: segments.reduce((n, s) => n + (s.hex.length - (s.kind === "selector" ? 2 : 0)) / 2, 0),
  };
}

/* ---------- reproduce ---------- */

export interface CastCommand {
  label: string;
  cmd: string;
}
export function castCommands(r: Receipt): CastCommand[] {
  void r;
  return [];
}
