import type { GroupMeta } from "../../types";
import type { BoardTask } from "./useTaskOverviewData";
import type { OverviewActivity } from "./useOverviewData";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TaskGap = {
  groupId: string;
  /** Latest task change the board knows of, or null when the Group has no tasks shown. */
  lastTaskTs: string | null;
  lastChatTs: string;
  reason: "noTasks" | "behind";
};

const ms = (ts: string | null | undefined) => (ts ? new Date(ts).getTime() : Number.NaN);

/**
 * Groups whose tasks have fallen behind their chat: talking within the last day with no
 * open task, or chatting more than a day after the last task change.
 */
export function findTaskGaps(
  groups: GroupMeta[],
  tasks: BoardTask[],
  activity: Record<string, OverviewActivity>,
  now = Date.now(),
): TaskGap[] {
  return groups.flatMap((group): TaskGap[] => {
    const groupId = group.group_id;
    const lastChatTs = activity[groupId]?.lastTs;
    if (!lastChatTs || now - ms(lastChatTs) > DAY_MS) return [];
    const own = tasks.filter((entry) => entry.groupId === groupId);
    const lastTaskTs =
      own
        .map((entry) => String(entry.task.updated_at || ""))
        .filter(Boolean)
        .sort()
        .pop() ?? null;
    const hasOpen = own.some((entry) => entry.column !== "done");
    if (!hasOpen) return [{ groupId, lastTaskTs, lastChatTs, reason: "noTasks" }];
    if (!lastTaskTs || ms(lastChatTs) - ms(lastTaskTs) > DAY_MS) {
      return [{ groupId, lastTaskTs, lastChatTs, reason: "behind" }];
    }
    return [];
  });
}
