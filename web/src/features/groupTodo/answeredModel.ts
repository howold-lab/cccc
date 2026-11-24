import type { ChatMessageData, LedgerEvent } from "../../types";
import { CHET_PRINCIPAL, isChetAnswer } from "../../utils/chetIdentity";
import { splitTag } from "./todoModel";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type AnsweredStatus = "running" | "done" | "failed" | "reverted";

/** A question card answered recently, with what came of it. */
export type AnsweredTodo = {
  cardId: string;
  answerId: string;
  /** The answer's author: the user, or Chet on the user's behalf. */
  by: "user" | "chet";
  tag: string;
  summary: string;
  choice: string;
  answeredAt: string;
  status: AnsweredStatus;
  resultId: string;
  resultText: string;
};

type Answer = { option_id?: unknown; text?: unknown };
type Question = { prompt?: unknown; options?: { id?: unknown; label?: unknown }[] };

const str = (value: unknown) => (typeof value === "string" ? value : "");
const dataOf = (event: LedgerEvent) =>
  (event.data ?? {}) as ChatMessageData & Record<string, unknown>;

function statusOf(text: string): AnsweredStatus {
  const head = text.trim().slice(0, 40);
  if (/^(已恢复|已取消|已撤回)/.test(head)) return "reverted";
  if (/^失败|^没成功|^未完成/.test(head) || /失败[:：]/.test(head)) return "failed";
  return "done";
}

/**
 * Cards answered in the last day and their outcome: running until the asker replies to the
 * answer (or, failing that, to the card after it), then done, failed or reverted by the first
 * words of that reply ("已完成", "失败", "已恢复").
 */
export function answeredTodos(events: LedgerEvent[], now = Date.now()): AnsweredTodo[] {
  const chats = events
    .filter((event) => event.kind === "chat.message")
    .sort((a, b) => String(a.ts ?? "").localeCompare(String(b.ts ?? "")));
  const byId = new Map(chats.map((event) => [String(event.id ?? ""), event]));
  const out: AnsweredTodo[] = [];
  for (const event of chats) {
    const data = dataOf(event);
    const answer = (data.answer ?? null) as Answer | null;
    const fromUser = event.by === "user";
    if (!answer || !(fromUser || isChetAnswer(event))) continue;
    const ts = String(event.ts ?? "");
    if (now - new Date(ts).getTime() > WINDOW_MS) continue;
    const cardId = str(data.reply_to);
    const card = byId.get(cardId);
    const cardData = card ? dataOf(card) : null;
    const question = (cardData?.question ?? null) as Question | null;
    const prompt = str(question?.prompt) || str(cardData?.text) || str(data.quote_text);
    const { tag, rest } = splitTag(prompt);
    const optionId = str(answer.option_id);
    const option = question?.options?.find((candidate) => str(candidate.id) === optionId);
    const choice = option ? str(option.label) : optionId || str(answer.text);
    const answerId = String(event.id ?? "");
    const asker = card ? String(card.by ?? "") : "";
    const result = chats.find((candidate) => {
      if (candidate.by === "user" || candidate.by === CHET_PRINCIPAL) return false;
      if (String(candidate.ts ?? "") <= ts) return false;
      const replyTo = str(dataOf(candidate).reply_to);
      return replyTo === answerId || (replyTo === cardId && (!asker || candidate.by === asker));
    });
    const resultText = result ? str(dataOf(result).text) : "";
    out.push({
      cardId,
      answerId,
      by: fromUser ? "user" : "chet",
      tag,
      summary: rest,
      choice,
      answeredAt: ts,
      status: result ? statusOf(resultText) : "running",
      resultId: result ? String(result.id ?? "") : "",
      resultText,
    });
  }
  return out.reverse();
}
