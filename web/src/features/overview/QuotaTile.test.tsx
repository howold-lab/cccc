// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { ClaudeLimits } from "../../services/api/claudeUsage";
import { isStale, msUntilReset, quotaTone, remainingPct } from "./quotaModel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

import { QuotaTile } from "./OverviewTiles";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const NOW = Date.parse("2026-11-22T12:00:00Z");

it("colours usage, counts what is left and spots stale data", () => {
  expect([quotaTone(40), quotaTone(60), quotaTone(85), quotaTone(null)]).toEqual([
    "ok",
    "mid",
    "hot",
    "ok",
  ]);
  expect(remainingPct({ used_pct: 62.4, reset_at: null })).toBe(38);
  expect(remainingPct({ used_pct: null, reset_at: null })).toBeNull();
  expect(isStale("2026-11-22T11:00:00Z", NOW)).toBe(false);
  expect(isStale("2026-11-22T06:00:00Z", NOW)).toBe(true);
  expect(isStale(null, NOW)).toBe(true);
  expect(msUntilReset({ used_pct: 1, reset_at: "2026-11-22T13:00:00Z" }, NOW)).toBe(3_600_000);
  expect(msUntilReset({ used_pct: 1, reset_at: "2026-11-22T11:00:00Z" }, NOW)).toBe(0);
  expect(msUntilReset({ used_pct: 1, reset_at: null }, NOW)).toBeNull();
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const fresh = (): ClaudeLimits => ({
  installed: true,
  accounts: [
    {
      directory: "me",
      display_name: "Me",
      email: null,
      observed_at: new Date(Date.now() - 60_000).toISOString(),
      five_hour: { used_pct: 62, reset_at: null },
      seven_day: { used_pct: 90, reset_at: null },
    },
  ],
});

it("draws each window as a ring coloured by how much is used", () => {
  act(() => root.render(<QuotaTile limits={fresh()} />));

  const windows = host.querySelectorAll("[data-quota-window]");
  expect([...windows].map((item) => item.getAttribute("data-tone"))).toEqual(["mid", "hot"]);
  const rings = host.querySelectorAll("[data-quota-ring]");
  expect([...rings].map((item) => item.getAttribute("data-tone"))).toEqual(["mid", "hot"]);
  expect(host.querySelector("[data-quota-center]")!.textContent).toBe("62%");
});

it("explains why there is nothing yet", () => {
  act(() => root.render(<QuotaTile limits={{ installed: true, accounts: [] }} />));

  expect(host.querySelector("[data-quota-ring]")).toBeNull();
  expect(host.textContent).toContain("overview.quota.waiting");
});
