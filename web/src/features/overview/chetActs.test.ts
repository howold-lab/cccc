import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "../../types";
import { chetActsFrom } from "./chetActs";

const event = (id: string, by: string, data: Record<string, unknown>) =>
  ({
    id,
    kind: "chat.message",
    by,
    ts: `2026-11-23T10:0${id.length}:00Z`,
    data,
  }) as unknown as LedgerEvent;

const question = event("q1", "monitor-1", {
  text: "Rebuild the workspace?",
  to: ["user"],
  message_mode: "request_reply",
  question: {
    v: 1,
    prompt: "Rebuild the workspace?",
    options: [
      { id: "A", label: "Rebuild" },
      { id: "B", label: "Not now" },
    ],
  },
});

describe("chetActsFrom", () => {
  it("reads Chet's answers on the user's behalf with the chosen option and its reason", () => {
    const answer = event("a1", "svc:chet", {
      reply_to: "q1",
      to: ["monitor-1"],
      _cccc_chet_group_generation: "gen-1",
      _cccc_chet_on_behalf_of: "user",
      answer: { v: 2, option_id: "B", note: "All rooms run fine today" },
    });
    const [act] = chetActsFrom("mon", [question, answer]);
    expect(act).toMatchObject({
      groupId: "mon",
      eventId: "a1",
      kind: "answer",
      asker: "monitor-1",
      question: "Rebuild the workspace?",
      choice: "B：Not now",
      text: "All rooms run fine today",
    });
  });

  it("keeps Chet's replies to messages for the user and drops its ordinary replies", () => {
    const toUser = event("m1", "worker", { text: "Report is ready", to: ["user"] });
    const toChet = event("m2", "worker", { text: "@chet any idea?", to: ["@chet"] });
    const replyForUser = event("r1", "svc:chet", { text: "Thanks, looks right", reply_to: "m1" });
    const replyToChet = event("r2", "svc:chet", { text: "Try the cache", reply_to: "m2" });
    const acts = chetActsFrom("g", [toUser, toChet, replyForUser, replyToChet]);
    expect(acts.map((act) => [act.eventId, act.kind, act.text])).toEqual([
      ["r1", "reply", "Thanks, looks right"],
    ]);
  });
});
