import type { LedgerEvent } from "../../types";

function localDay(ts: unknown): Date | null {
  const date = new Date(String(ts || ""));
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The local day a message starts, when it differs from the message before it (or it is the
 * first one shown); otherwise null, and no divider is drawn.
 */
export function dayStartingAt(
  previous: LedgerEvent | undefined,
  message: LedgerEvent | undefined,
): Date | null {
  const day = localDay(message?.ts);
  if (!day) return null;
  const before = localDay(previous?.ts);
  if (before && before.getTime() === day.getTime()) return null;
  return day;
}

/** "Today", "Yesterday" or a date with its weekday, the year only when it is not this year. */
export function dayLabel(
  day: Date,
  locale: string,
  today: Date,
  words: { today: string; yesterday: string },
) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.round((start - day.getTime()) / 86_400_000);
  if (diffDays === 0) return words.today;
  if (diffDays === 1) return words.yesterday;
  return day.toLocaleDateString(locale, {
    ...(day.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
