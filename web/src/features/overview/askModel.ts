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

/**
 * The agent's messages that answer this question. Replies quoting it win. Otherwise its
 * messages to the user after the question count, but only until the user's next message in
 * the Group: anything later answers something else.
 */
export function answersTo(asked: Asked, events: LedgerEvent[]): LedgerEvent[] {
  const chats = events
    .filter((event) => event.kind === "chat.message")
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const quoted = chats.filter(
    (event) =>
      event.by !== "user" &&
      !!asked.eventId &&
      ((event.data ?? {}) as ChatMessageData).reply_to === asked.eventId,
  );
  if (quoted.length) return quoted.slice(0, 3);

  const after = new Date(asked.ts).getTime() - CLOCK_SLACK_MS;
  const asking = new Date(asked.ts).getTime();
  const found: LedgerEvent[] = [];
  for (const event of chats) {
    const ts = new Date(String(event.ts)).getTime();
    if (event.by === "user") {
      const isQuestion = !!asked.eventId && event.id === asked.eventId;
      if (!isQuestion && ts > asking) break;
      continue;
    }
    const to = ((event.data ?? {}) as ChatMessageData).to;
    if (ts > after && Array.isArray(to) && to.includes("user")) found.push(event);
  }
  return found.slice(0, 3);
}
