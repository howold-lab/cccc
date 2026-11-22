import type { ClaudeLimitWindow } from "../../services/api/claudeUsage";

export type QuotaTone = "ok" | "mid" | "hot";

/** Data older than this is shown as stale: the windows may have moved on since. */
export const QUOTA_STALE_MS = 5 * 60 * 60 * 1000;

export function quotaTone(usedPct: number | null): QuotaTone {
  if (usedPct === null) return "ok";
  if (usedPct >= 85) return "hot";
  if (usedPct >= 60) return "mid";
  return "ok";
}

export function remainingPct(window: ClaudeLimitWindow): number | null {
  if (typeof window.used_pct !== "number") return null;
  return Math.max(0, Math.round(100 - window.used_pct));
}

export function isStale(observedAt: string | null, now = Date.now()): boolean {
  const time = new Date(String(observedAt || "")).getTime();
  return Number.isNaN(time) || now - time > QUOTA_STALE_MS;
}

/**
 * Milliseconds until the window resets, 0 once it has passed, null when unknown. Reset
 * times are inferred by the skill from falling percentages, so callers say "about".
 */
export function msUntilReset(window: ClaudeLimitWindow, now = Date.now()): number | null {
  const time = new Date(String(window.reset_at || "")).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, time - now);
}
