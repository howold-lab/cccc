import { useEffect, useRef } from "react";
import { create } from "zustand";
import { readActivity, type OverviewActivity } from "../features/overview/useOverviewData";
import type { GroupMeta } from "../types";

/** Each Group's latest chat facts, shared by the sidebar rows. */
type GroupActivityState = {
  byGroup: Record<string, OverviewActivity>;
  set: (byGroup: Record<string, OverviewActivity>) => void;
};

export const useGroupActivityStore = create<GroupActivityState>((set) => ({
  byGroup: {},
  set: (byGroup) => set({ byGroup }),
}));

const INTERVAL_MS = 30_000;

/** Keeps the shared activity current for the given Groups while enabled. */
export function useGroupActivityFeed(groups: GroupMeta[], enabled: boolean) {
  const key = groups.map((group) => group.group_id).join("\n");
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useEffect(() => {
    if (!enabled || !key) return undefined;
    const controller = new AbortController();
    let stopped = false;
    const pull = async () => {
      try {
        const next = await readActivity(groupsRef.current, controller.signal);
        if (!stopped) useGroupActivityStore.getState().set(next);
      } catch {
        // Keep what was shown; the next read tries again.
      }
    };
    void pull();
    // A hidden page skips the periodic reads and catches up when it is shown again.
    const timer = window.setInterval(() => {
      if (!document.hidden) void pull();
    }, INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, key]);
}
