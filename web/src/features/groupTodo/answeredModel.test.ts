import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "../../types";
import { answeredTodos } from "./answeredModel";

const now = new Date("2026-11-24T12:00:00Z").getTime();
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
const ev = (id: string, by: string, minutesAgo: number, data: Record<string, unknown>) =>
  ({ id, kind: "chat.message", by, ts: at(minutesAgo), data }) as unknown as LedgerEvent;

const card = ev("c1", "kb", 30, {
  text: "[快手自测] 改不改？",
  to: ["user"],
  message_mode: "request_reply",
  question: {
    v: 1,
    prompt: "[快手自测] 「修图量不大」答成 1 年，要改吗？",
    options: [
      { id: "A", label: "改" },
      { id: "B", label: "不改" },
    ],
  },
});
const answer = ev("a1", "user", 20, { reply_to: "c1", answer: { v: 1, option_id: "A" } });

describe("answeredTodos", () => {
  it("is running until the asker replies to the answer", () => {
    const [item] = answeredTodos([card, answer], now);
    expect(item).toMatchObject({
      cardId: "c1",
      answerId: "a1",
      by: "user",
      tag: "快手自测",
      choice: "改",
      status: "running",
    });
  });

  it("reads done, failed and reverted from the first words of the reply", () => {
    const done = ev("r1", "kb", 10, { reply_to: "a1", text: "已完成：已改并重测通过" });
    expect(answeredTodos([card, answer, done], now)[0]).toMatchObject({
      status: "done",
      resultId: "r1",
    });
    const failed = ev("r2", "kb", 10, { reply_to: "a1", text: "失败：库接口超时" });
    expect(answeredTodos([card, answer, failed], now)[0].status).toBe("failed");
    const reverted = ev("r3", "kb", 10, { reply_to: "c1", text: "已恢复：改回原来的说法" });
    expect(answeredTodos([card, answer, reverted], now)[0].status).toBe("reverted");
  });

  it("ignores answers older than a day and plain user replies", () => {
    const old = ev("a0", "user", 60 * 30, { reply_to: "c1", answer: { v: 1, option_id: "B" } });
    const plain = ev("u1", "user", 5, { reply_to: "c1", text: "好的" });
    expect(answeredTodos([card, old, plain], now)).toEqual([]);
  });
});
