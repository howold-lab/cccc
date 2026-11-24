import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "../../types";
import type { OverviewPendingItem } from "../overview/useOverviewData";
import { batchTodos, splitTag, waitingWithoutCard } from "./todoModel";

const item = (id: string, prompt: string, ts: string) =>
  ({
    groupId: "g",
    event: { id } as LedgerEvent,
    sender: "kb",
    ts,
    text: prompt,
    question: { v: 1, prompt, options: [] },
  }) as OverviewPendingItem;

const chat = (
  id: string,
  by: string,
  ts: string,
  text: string,
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    kind: "chat.message",
    by,
    ts,
    data: { text, to: by === "user" ? ["kb"] : ["user"], ...extra },
  }) as unknown as LedgerEvent;

describe("todo model", () => {
  it("reads the source tag in either bracket style", () => {
    expect(splitTag("[快手自测] 改不改？")).toEqual({ tag: "快手自测", rest: "改不改？" });
    expect(splitTag("【抖音巡检】两条要看")).toEqual({ tag: "抖音巡检", rest: "两条要看" });
    expect(splitTag("没有标签")).toEqual({ tag: "", rest: "没有标签" });
  });

  it("groups questions by tag, oldest batch first, untagged on their own", () => {
    const batches = batchTodos([
      item("b", "[主图] 排版？", "2026-11-24T02:00:00Z"),
      item("a", "[快手自测] 第一题", "2026-11-24T01:00:00Z"),
      item("c", "单独一件", "2026-11-24T03:00:00Z"),
      item("d", "[快手自测] 第二题", "2026-11-24T04:00:00Z"),
    ]);
    expect(batches.map((batch) => [batch.tag, batch.items.map((x) => x.event.id)])).toEqual([
      ["快手自测", ["a", "d"]],
      ["主图", ["b"]],
      ["", ["c"]],
    ]);
  });

  it("spots an agent waiting on the user in plain text, until the user answers", () => {
    const ask = chat("m1", "kb", "2026-11-24T01:00:00Z", "PDF 标了 4 题，你回个「改」我就上。");
    expect(waitingWithoutCard([ask], new Set())?.id).toBe("m1");
    expect(waitingWithoutCard([ask], new Set(["m1"]))).toBeNull();
    const answered = chat("u1", "user", "2026-11-24T02:00:00Z", "改");
    expect(waitingWithoutCard([ask, answered], new Set())).toBeNull();
    const report = chat("m2", "kb", "2026-11-24T03:00:00Z", "巡检报告：本时段 2 条弹幕。");
    expect(waitingWithoutCard([report], new Set())).toBeNull();
  });
});
