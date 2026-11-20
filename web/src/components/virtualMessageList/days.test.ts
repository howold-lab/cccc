import { expect, it } from "vite-plus/test";
import type { LedgerEvent } from "../../types";
import { dayLabel, dayStartingAt } from "./days";

const at = (ts: string) => ({ id: ts, kind: "chat.message", ts }) as unknown as LedgerEvent;
const words = { today: "Today", yesterday: "Yesterday" };

it("starts a day at the first message and where the local day changes", () => {
  const first = at(new Date(2026, 10, 18, 22, 0).toISOString());
  const sameDay = at(new Date(2026, 10, 18, 23, 30).toISOString());
  const nextDay = at(new Date(2026, 10, 19, 0, 10).toISOString());
  expect(dayStartingAt(undefined, first)?.getDate()).toBe(18);
  expect(dayStartingAt(first, sameDay)).toBeNull();
  expect(dayStartingAt(sameDay, nextDay)?.getDate()).toBe(19);
  expect(dayStartingAt(first, at("not a date"))).toBeNull();
});

it("names today and yesterday, and dates otherwise", () => {
  const today = new Date(2026, 10, 20, 15, 0);
  expect(dayLabel(new Date(2026, 10, 20), "en", today, words)).toBe("Today");
  expect(dayLabel(new Date(2026, 10, 19), "en", today, words)).toBe("Yesterday");
  expect(dayLabel(new Date(2026, 10, 18), "en", today, words)).toContain("18");
  expect(dayLabel(new Date(2025, 10, 18), "en", today, words)).toContain("2025");
});
