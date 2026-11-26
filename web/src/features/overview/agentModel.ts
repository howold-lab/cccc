import type { OverviewAgent } from "./useOverviewData";

export type AgentTone = "working" | "waiting" | "stuck" | "idle" | "stopped";

export function agentTone(agent: OverviewAgent): AgentTone {
  if (!agent.running) return "stopped";
  if (agent.workingState === "working") return "working";
  if (agent.workingState === "stuck" || agent.blockers.length) return "stuck";
  if (agent.workingState === "waiting") return "waiting";
  return "idle";
}

const TONE_ORDER: AgentTone[] = ["working", "stuck", "waiting", "idle", "stopped"];

/** Busy agents first, then the most recently updated. */
export function sortAgents(agents: OverviewAgent[]): OverviewAgent[] {
  return [...agents].sort((a, b) => {
    const diff = TONE_ORDER.indexOf(agentTone(a)) - TONE_ORDER.indexOf(agentTone(b));
    if (diff) return diff;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

export function isBusy(agent: OverviewAgent): boolean {
  return ["working", "stuck", "waiting"].includes(agentTone(agent));
}
