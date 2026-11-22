import { apiJson } from "./base";

export type ClaudeLimitWindow = { used_pct: number | null; reset_at: string | null };

export type ClaudeLimitAccount = {
  directory: string;
  display_name: string | null;
  email: string | null;
  observed_at: string | null;
  five_hour: ClaudeLimitWindow;
  seven_day: ClaudeLimitWindow;
};

export type ClaudeLimits = { installed: boolean; accounts: ClaudeLimitAccount[] };

/** Claude subscription limits from the claude-statusline skill's usage records (read-only). */
export async function fetchClaudeLimits(init?: RequestInit) {
  return apiJson<ClaudeLimits>("/api/v1/usage/claude-limits", { cache: "no-store", ...init });
}
