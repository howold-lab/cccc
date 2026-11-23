import type { ChatMessageData, LedgerEvent } from "../../types";
import { CHET_PRINCIPAL, isChetAnswer } from "../../utils/chetIdentity";

/** Something Chet did for the user while unattended: answered a question card, or replied. */
export type ChetAct = {
  groupId: string;
  eventId: string;
  ts: string;
  kind: "answer" | "reply";
  /** The member who wrote to the user. */
  asker: string;
  /** What was asked, in one line. */
  question: string;
  /** For an answer: the chosen option as "A：label", or the written answer. */
  choice: string;
  /** Chet's reason or reply text. */
  text: string;
};

type Answer = { option_id?: unknown; text?: unknown; note?: unknown };
type Question = { prompt?: unknown; options?: { id?: unknown; label?: unknown }[] };

const str = (value: unknown) => (typeof value === "string" ? value : "");
const dataOf = (event: LedgerEvent) =>
  (event.data ?? {}) as ChatMessageData & Record<string, unknown>;

/**
 * Chet's messages in a ledger tail that act for the user: recorded answers on the user's
 * behalf, and replies to messages members sent to the user. Chet's ordinary replies to
 * messages addressed to Chet are left out.
 */
export function chetActsFrom(groupId: string, events: LedgerEvent[]): ChetAct[] {
  const byId = new Map(events.map((event) => [String(event.id ?? ""), event]));
  return events.flatMap((event): ChetAct[] => {
    if (event.kind !== "chat.message" || event.by !== CHET_PRINCIPAL) return [];
    const data = dataOf(event);
    const source = byId.get(str(data.reply_to));
    const sourceData = source ? dataOf(source) : null;
    const answer = isChetAnswer(event);
    const toUser = Array.isArray(sourceData?.to) && sourceData.to.includes("user");
    if (!answer && !toUser) return [];
    const question = (sourceData?.question ?? null) as Question | null;
    const recorded = (data.answer ?? null) as Answer | null;
    const optionId = str(recorded?.option_id);
    const option = question?.options?.find((candidate) => str(candidate.id) === optionId);
    const choice = optionId
      ? `${optionId}${option ? `：${str(option.label)}` : ""}`
      : str(recorded?.text);
    return [
      {
        groupId,
        eventId: String(event.id ?? ""),
        ts: String(event.ts ?? ""),
        kind: answer ? "answer" : "reply",
        asker: String(source?.by ?? ""),
        question: str(question?.prompt) || str(sourceData?.text) || str(data.quote_text),
        choice,
        text: str(recorded?.note) || str(data.text),
      },
    ];
  });
}
