import type { ReplayData } from "./types";

let cachedReplay: ReplayData | null = null;
let fetchPromise: Promise<ReplayData | null> | null = null;

export async function loadReplayData(): Promise<ReplayData | null> {
  if (cachedReplay) return cachedReplay;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch("/evidence/run.json", { cache: "no-store" });
      if (!res.ok) {
        console.warn("Could not load run.json for replay");
        return null;
      }
      const data: unknown = await res.json();
      if (!data || typeof data !== "object" || !("replay" in data)) return null;
      if (data.replay && typeof data.replay === "object") {
        cachedReplay = data.replay as ReplayData;
        return cachedReplay;
      }
      return null;
    } catch {
      return null;
    }
  })();

  return fetchPromise;
}

export function getCachedReplay(): ReplayData | null {
  return cachedReplay;
}

export function formatOrNotCaptured(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === "") return "not captured";
  return String(val);
}
