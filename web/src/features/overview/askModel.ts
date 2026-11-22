import type { ChatMessageData, LedgerEvent } from "../../types";

/** A question sent from the overview to a Group's agent. */
export type Asked = { groupId: string; question: string; ts: string; eventId: string };

/** Where the overview remembers the last question across reloads. */
export const LAST_ASKED_KEY = "cccc-overview-ask-last";

/** The last question asked from the overview, if any. */
export function readLastAsked(): Asked | null {
  try {
    const raw = window.localStorage.getItem(LAST_ASKED_KEY);
    return raw ? (JSON.parse(raw) as Asked) : null;
  } catch {
    return null;
  }
}

/** With no reply after this long, the card says the question may not have arrived. */
export const NO_REPLY_AFTER_MS = 2 * 60 * 1000;

/** The send time is the browser's; allow for its clock running ahead of the daemon's. */
const CLOCK_SLACK_MS = 30_000;

/** The agent's messages to the user that answer this question: replies to it, or anything after it. */
export function answersTo(asked: Asked, events: LedgerEvent[]): LedgerEvent[] {
  const after = new Date(asked.ts).getTime() - CLOCK_SLACK_MS;
  return events
    .filter((event) => {
      if (event.kind !== "chat.message" || event.by === "user") return false;
      const data = (event.data ?? {}) as ChatMessageData;
      if (asked.eventId && data.reply_to === asked.eventId) return true;
      const to = Array.isArray(data.to) ? data.to : [];
      return to.includes("user") && new Date(String(event.ts)).getTime() > after;
    })
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
    .slice(-3);
}
