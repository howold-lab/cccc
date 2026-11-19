import { useCallback, useEffect, useRef, useState } from "react";
import { fetchActors } from "../../services/api/actors";
import { fetchContext } from "../../services/api/context";
import {
  fetchPendingReplies,
  fetchPendingReplySummary,
} from "../../services/api/pendingReplies";
import type { Actor, AgentState, ChatMessageData, GroupMeta, LedgerEvent } from "../../types";
import { pendingReplyView } from "../pendingReplies/model";
import type { StructuredQuestion } from "../pendingReplies/types";

export type OverviewPendingItem = {
  groupId: string;
  event: LedgerEvent;
  sender: string;
  ts: string;
  question: StructuredQuestion | null;
  /** The message itself, shown when the question carries no structured prompt. */
  text: string;
};

export type OverviewAgent = {
  groupId: string;
  actorId: string;
  title: string;
  role: string;
  running: boolean;
  workingState: string;
  focus: string;
  blockers: string[];
  updatedAt: string;
};

export type OverviewData = {
  pending: OverviewPendingItem[];
  pendingByGroup: Record<string, number>;
  agents: OverviewAgent[];
  loading: boolean;
  /** The time of the last complete read, for the page's "updated" line. */
  asOf: string | null;
  refresh: () => void;
};

const PENDING_INTERVAL_MS = 10_000;
const AGENT_INTERVAL_MS = 30_000;

async function readPending(groupIds: string[], signal: AbortSignal) {
  const summary = await fetchPendingReplySummary({ signal });
  const counts: Record<string, number> = {};
  if (summary.ok) {
    for (const entry of summary.result.groups) {
      if (entry.state === "fresh" && typeof entry.pending === "number") {
        counts[entry.group_id] = entry.pending;
      }
    }
  }
  const wanted = groupIds.filter((id) => (counts[id] ?? 0) > 0);
  const pages = await Promise.all(
    wanted.map(async (groupId) => {
      const page = await fetchPendingReplies(groupId, undefined, { signal });
      if (!page.ok) return [];
      return page.result.events.flatMap((event): OverviewPendingItem[] => {
        if (!event.id) return [];
        const view = pendingReplyView(event, page.result.statuses[event.id]);
        if (!view || view.state !== "pending") return [];
        const data = (event.data ?? {}) as ChatMessageData;
        return [
          {
            groupId,
            event,
            sender: String(event.by ?? ""),
            ts: String(event.ts ?? ""),
            question: view.question,
            text: typeof data.text === "string" ? data.text : "",
          },
        ];
      });
    }),
  );
  const pending = pages.flat().sort((a, b) => b.ts.localeCompare(a.ts));
  return { pending, counts };
}

async function readAgents(groups: GroupMeta[], signal: AbortSignal) {
  const lists = await Promise.all(
    groups.map(async (group): Promise<OverviewAgent[]> => {
      const [actors, context] = await Promise.all([
        fetchActors(group.group_id, false, { signal }),
        fetchContext(group.group_id),
      ]);
      if (!actors.ok) return [];
      const states = new Map<string, AgentState>(
        (context.ok ? (context.result.agent_states ?? []) : []).map((state) => [state.id, state]),
      );
      return actors.result.actors
        .filter((actor: Actor) => actor.enabled !== false)
        .map((actor: Actor) => {
          const state = states.get(actor.id);
          return {
            groupId: group.group_id,
            actorId: actor.id,
            title: actor.title || actor.id,
            role: actor.role || "",
            running: Boolean(actor.running),
            workingState: String(actor.effective_working_state || (actor.running ? "idle" : "stopped")),
            focus: String(state?.hot?.focus || ""),
            blockers: (state?.hot?.blockers ?? []).filter(Boolean),
            updatedAt: String(state?.updated_at || ""),
          };
        });
    }),
  );
  return lists.flat();
}

/** Reads what the overview shows across Groups: open questions to the user and each agent's state. */
export function useOverviewData(groups: GroupMeta[], enabled: boolean): OverviewData {
  const key = groups.map((group) => group.group_id).join("\n");
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const [pending, setPending] = useState<OverviewPendingItem[]>([]);
  const [pendingByGroup, setPendingByGroup] = useState<Record<string, number>>({});
  const [agents, setAgents] = useState<OverviewAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let stopped = false;
    const pull = async () => {
      try {
        const ids = groupsRef.current.map((group) => group.group_id);
        const result = await readPending(ids, controller.signal);
        if (stopped) return;
        setPending(result.pending);
        setPendingByGroup(result.counts);
        setAsOf(new Date().toISOString());
      } catch {
        // Keep what was shown; the next read tries again.
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), PENDING_INTERVAL_MS);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, key, tick]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let stopped = false;
    const pull = async () => {
      try {
        const result = await readAgents(groupsRef.current, controller.signal);
        if (!stopped) setAgents(result);
      } catch {
        // Keep what was shown; the next read tries again.
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), AGENT_INTERVAL_MS);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, key, tick]);

  return { pending, pendingByGroup, agents, loading, asOf, refresh };
}
