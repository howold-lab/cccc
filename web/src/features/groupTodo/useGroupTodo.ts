import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLedgerTail } from "../../services/api/messaging";
import type { LedgerEvent } from "../../types";
import { readGroupPending, type OverviewPendingItem } from "../overview/useOverviewData";
import { waitingWithoutCard } from "./todoModel";

const INTERVAL_MS = 30_000;
const TAIL = 40;

export type GroupTodo = {
  items: OverviewPendingItem[];
  /** An agent's plain-text ask the user has not answered and that is not a card. */
  stray: LedgerEvent | null;
  loaded: boolean;
  refresh: () => void;
};

/** One Group's open questions to the user, read now and every half minute. */
export function useGroupTodo(groupId: string, enabled: boolean): GroupTodo {
  const [items, setItems] = useState<OverviewPendingItem[]>([]);
  const [stray, setStray] = useState<LedgerEvent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const current = useRef(groupId);
  current.current = groupId;

  useEffect(() => {
    setItems([]);
    setStray(null);
    setLoaded(false);
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !enabled) return undefined;
    const controller = new AbortController();
    const pull = async () => {
      try {
        const [pending, tail] = await Promise.all([
          readGroupPending(groupId, controller.signal),
          fetchLedgerTail(groupId, TAIL, { includeStatuses: false, signal: controller.signal }),
        ]);
        if (current.current !== groupId) return;
        setItems(pending);
        const open = new Set(pending.map((item) => String(item.event.id ?? "")));
        setStray(tail.ok ? waitingWithoutCard(tail.result.events, open) : null);
      } catch {
        // Keep what was shown; the next read tries again.
      } finally {
        if (current.current === groupId) setLoaded(true);
      }
    };
    void pull();
    const timer = window.setInterval(() => {
      if (!document.hidden) void pull();
    }, INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, groupId, tick]);

  return { items, stray, loaded, refresh };
}
