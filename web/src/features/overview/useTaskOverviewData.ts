import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTaskPages } from "../../services/api/tasks";
import type { GroupMeta, Task } from "../../types";
import { readActivity, type OverviewActivity } from "./useOverviewData";

export type BoardColumn = "planned" | "active" | "stuck" | "done";

export type BoardTask = {
  groupId: string;
  task: Task;
  column: BoardColumn;
  /** Why a stuck task waits: on the user, an agent, something external, or other tasks. */
  waitingOn: "user" | "actor" | "external" | "";
  blockedBy: string[];
  /** In progress yet not updated for longer than STALE_AFTER_MS. */
  stale: boolean;
  checklistDone: number;
  checklistTotal: number;
};

export type TaskOverviewData = {
  tasks: BoardTask[];
  activity: Record<string, OverviewActivity>;
  loading: boolean;
  asOf: string | null;
  refresh: () => void;
};

const INTERVAL_MS = 30_000;
const PAGE_LIMIT = 100;
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const DONE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function age(ts: string | null | undefined, now: number) {
  const time = new Date(String(ts || "")).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : now - time;
}

/** Places one task on the board from its own facts; done tasks older than a week drop off. */
export function boardTask(groupId: string, task: Task, now: number): BoardTask | null {
  const status = String(task.status || "planned");
  const waiting = String(task.waiting_on || "none");
  const waitingOn =
    waiting === "user" || waiting === "actor" || waiting === "external" ? waiting : "";
  const blockedBy = (task.open_blocked_by ?? []).filter(Boolean);
  const checklist = (task.checklist ?? []).filter((item) => String(item.text || "").trim());
  const checklistDone = checklist.filter((item) => item.status === "done").length;
  let column: BoardColumn;
  if (status === "done") {
    if (age(task.updated_at, now) > DONE_WINDOW_MS) return null;
    column = "done";
  } else if (status === "planned" || status === "active") {
    column = waitingOn || blockedBy.length ? "stuck" : (status as BoardColumn);
  } else {
    return null;
  }
  return {
    groupId,
    task,
    column,
    waitingOn,
    blockedBy,
    stale: status === "active" && column !== "stuck" && age(task.updated_at, now) > STALE_AFTER_MS,
    checklistDone,
    checklistTotal: checklist.length,
  };
}

async function readTasks(groups: GroupMeta[], signal: AbortSignal) {
  const now = Date.now();
  const lists = await Promise.all(
    groups.map(async (group) => {
      const response = await fetchTaskPages(group.group_id, {
        statuses: ["planned", "active", "done"],
        limit: PAGE_LIMIT,
        signal,
      });
      if (!response.ok) return [];
      return Object.values(response.result.pages).flatMap((page) =>
        (page?.tasks ?? [])
          .filter((task) => !task.parent_id)
          .map((task) => boardTask(group.group_id, task, now))
          .filter((entry): entry is BoardTask => !!entry),
      );
    }),
  );
  return lists.flat();
}

/** Reads every working Group's top-level tasks, with each Group's chat activity to check them by. */
export function useTaskOverviewData(groups: GroupMeta[]): TaskOverviewData {
  const key = groups.map((group) => group.group_id).join("\n");
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [activity, setActivity] = useState<Record<string, OverviewActivity>>({});
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    const pull = async () => {
      try {
        const [nextTasks, nextActivity] = await Promise.all([
          readTasks(groupsRef.current, controller.signal),
          readActivity(groupsRef.current, controller.signal),
        ]);
        if (stopped) return;
        setTasks(nextTasks);
        setActivity(nextActivity);
        setAsOf(new Date().toISOString());
      } catch {
        // Keep what was shown; the next read tries again.
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), INTERVAL_MS);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [key, tick]);

  return { tasks, activity, loading, asOf, refresh };
}
