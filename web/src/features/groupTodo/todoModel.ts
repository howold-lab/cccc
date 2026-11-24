import type { ChatMessageData, LedgerEvent } from "../../types";
import type { OverviewPendingItem } from "../overview/useOverviewData";

export type TodoBatch = { tag: string; items: OverviewPendingItem[] };

const TAG = /^\s*(?:\[([^\]]{1,24})\]|【([^】]{1,24})】)\s*/;

/** The source tag an agent puts in front of a question, like "[快手自测]", and the rest. */
export function splitTag(prompt: string): { tag: string; rest: string } {
  const match = TAG.exec(prompt);
  if (!match) return { tag: "", rest: prompt };
  return { tag: (match[1] ?? match[2] ?? "").trim(), rest: prompt.slice(match[0].length) };
}

export function promptOf(item: OverviewPendingItem) {
  return item.question?.prompt || item.text;
}

/** Groups open questions by source tag, oldest batch first; untagged ones stand alone. */
export function batchTodos(items: OverviewPendingItem[]): TodoBatch[] {
  const sorted = [...items].sort((a, b) => a.ts.localeCompare(b.ts));
  const batches: TodoBatch[] = [];
  const byTag = new Map<string, TodoBatch>();
  for (const item of sorted) {
    const { tag } = splitTag(promptOf(item));
    if (!tag) {
      batches.push({ tag: "", items: [item] });
      continue;
    }
    const existing = byTag.get(tag);
    if (existing) existing.items.push(item);
    else {
      const batch = { tag, items: [item] };
      byTag.set(tag, batch);
      batches.push(batch);
    }
  }
  return batches;
}

const STRAY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Words an agent uses when it waits on the user in plain text instead of a question card.
const WAITING =
  /回个|回一下|回复一下|你回|要不要|是否需要|需不需要|请确认|确认一下|你看看|你定|等你|行不行|可以吗|改吗|改不改|同意吗|拍板/;
// It must read as a question to the user: a question mark, or an explicit "reply with".
const ASKING = /[？?]|回个|你回|回一下|回复「|回「/;

/** Whether the end of a message asks the user something. */
export function asksUser(text: string) {
  const tail = text.slice(-160);
  return WAITING.test(tail) && ASKING.test(tail) && !/没有(要|需要)你|不用你|无需你/.test(tail);
}

/**
 * The newest plain message an agent wrote to the user that reads like a question, when the
 * user has not written since and it is not already an open question card.
 */
export function waitingWithoutCard(
  events: LedgerEvent[],
  openCardIds: Set<string>,
  now = Date.now(),
): LedgerEvent | null {
  const chats = events
    .filter((event) => event.kind === "chat.message")
    .sort((a, b) => String(a.ts ?? "").localeCompare(String(b.ts ?? "")));
  for (let index = chats.length - 1; index >= 0; index -= 1) {
    const event = chats[index];
    if (event.by === "user") return null;
    const data = (event.data ?? {}) as ChatMessageData;
    const toUser = Array.isArray(data.to) && data.to.includes("user");
    if (!toUser || openCardIds.has(String(event.id ?? ""))) continue;
    if (data.message_mode === "request_reply") continue;
    const text = typeof data.text === "string" ? data.text : "";
    // An ask older than a day is history, not a to-do; the user can still find it in the chat.
    if (now - new Date(String(event.ts ?? "")).getTime() > STRAY_MAX_AGE_MS) return null;
    if (asksUser(text)) return event;
  }
  return null;
}
