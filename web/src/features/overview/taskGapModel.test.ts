import { describe, expect, it } from "vitest";
import type { GroupMeta } from "../../types";
import { findTaskGaps } from "./taskGapModel";
import type { BoardTask } from "./useTaskOverviewData";
import type { OverviewActivity } from "./useOverviewData";

const now = new Date("2026-11-23T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const group = (id: string) => ({ group_id: id, title: id }) as GroupMeta;
const task = (groupId: string, column: BoardTask["column"], updatedHoursAgo: number) =>
  ({
    groupId,
    column,
    task: { id: `${groupId}-t`, updated_at: hoursAgo(updatedHoursAgo) },
  }) as BoardTask;
const active = (lastHoursAgo: number) => ({ lastTs: hoursAgo(lastHoursAgo) }) as OverviewActivity;

describe("findTaskGaps", () => {
  it("flags talk without open tasks and tasks left behind by the chat", () => {
    const gaps = findTaskGaps(
      [group("none"), group("behind"), group("fine"), group("quiet")],
      [
        task("behind", "active", 24 * 11),
        task("fine", "active", 3),
        task("quiet", "active", 24 * 9),
      ],
      { none: active(7), behind: active(1), fine: active(2), quiet: active(30) },
      now,
    );
    expect(gaps.map((gap) => [gap.groupId, gap.reason])).toEqual([
      ["none", "noTasks"],
      ["behind", "behind"],
    ]);
  });
});
