import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAge } from "./useAge";
import { ActorAvatar } from "../../components/ActorAvatar";
import { MenuIcon } from "../../components/Icons";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import type { GroupMeta } from "../../types";
import { OverviewAsk } from "./OverviewAsk";
import { QuotaCard } from "./QuotaCard";
import { useClaudeLimits } from "./useClaudeLimits";
import { oneLine } from "./plainText";
import { DecidedForYou, UnattendedRules, UnattendedSwitch } from "./Unattended";
import { useOverviewData, type OverviewActivity, type OverviewAgent } from "./useOverviewData";

type Tone = "working" | "waiting" | "stuck" | "idle" | "stopped";

/** A user message counts as unanswered once it has waited this long. */
const UNANSWERED_AFTER_MS = 2 * 60 * 60 * 1000;

function agentTone(agent: OverviewAgent): Tone {
  if (!agent.running) return "stopped";
  if (agent.workingState === "working") return "working";
  if (agent.workingState === "stuck" || agent.blockers.length) return "stuck";
  if (agent.workingState === "waiting") return "waiting";
  return "idle";
}

function formatTime(ts: string, locale: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Card({
  title,
  count,
  aside,
  action,
  children,
}: {
  title: string;
  count?: number;
  aside?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden" data-overview-card>
      <header className="flex items-center gap-2 px-4 py-3" data-overview-card-head>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {count ? (
          <span className="rounded-full px-1.5 text-[11px] font-semibold" data-overview-count>
            {count}
          </span>
        ) : null}
        {aside ? (
          <span className="ml-auto truncate text-xs text-[var(--color-text-tertiary)]">
            {aside}
          </span>
        ) : null}
        {action ? <span className={aside ? "shrink-0" : "ml-auto shrink-0"}>{action}</span> : null}
      </header>
      {children}
    </section>
  );
}

/** The home across Groups: what waits on the user, how each project is doing and what agents do. */
export function OverviewPage({
  groups,
  readOnly,
  onOpenGroup,
  onOpenPending,
  onOpenSidebar,
  onOpenTasks,
}: {
  groups: GroupMeta[];
  readOnly: boolean;
  onOpenGroup: (groupId: string) => void;
  onOpenPending: (groupId: string) => void;
  /** Opens the Group list on a phone, where the overview covers the page header. */
  onOpenSidebar?: () => void;
  /** Opens the cross-Group task board. */
  onOpenTasks?: () => void;
}) {
  const { t, i18n } = useTranslation("layout");
  const age = useAge();
  const data = useOverviewData(groups, true);
  const titles = useMemo(
    () =>
      Object.fromEntries(groups.map((group) => [group.group_id, group.title || group.group_id])),
    [groups],
  );

  const unanswered = groups
    .map((group) => data.activity[group.group_id])
    .filter(
      (activity): activity is OverviewActivity =>
        !!activity?.unanswered &&
        Date.now() - new Date(activity.unanswered.ts).getTime() >= UNANSWERED_AFTER_MS,
    );
  const needsTotal = data.pending.length + unanswered.length;
  const firstNeedGroup = data.pending[0]?.groupId ?? unanswered[0]?.groupId ?? "";
  const chetActs = Object.values(data.activity).flatMap((activity) => activity.chetActs ?? []);
  const agents = [...data.agents].sort((a, b) => {
    const order: Tone[] = ["working", "stuck", "waiting", "idle", "stopped"];
    const diff = order.indexOf(agentTone(a)) - order.indexOf(agentTone(b));
    if (diff) return diff;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
  const busyAgents = agents.filter((agent) =>
    ["working", "stuck", "waiting"].includes(agentTone(agent)),
  );
  const quietAgents = agents.filter((agent) => !busyAgents.includes(agent));
  const limits = useClaudeLimits();
  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-chat-bg)]" data-overview-page>
      <header
        className="flex h-[48px] shrink-0 items-center gap-3 border-b border-[var(--color-border-secondary)] px-4"
        data-overview-header
      >
        {onOpenSidebar ? (
          <IconButton
            type="button"
            className="-ml-1 h-[44px] w-[44px] text-[var(--color-text-secondary)] md:hidden"
            onClick={onOpenSidebar}
            data-sidebar-toggle="true"
            label={t("openSidebar")}
          >
            <MenuIcon size={18} />
          </IconButton>
        ) : null}
        <h1 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
          {t("overview.title")}
        </h1>
        <span className="truncate text-xs text-[var(--color-text-tertiary)]">
          {data.asOf
            ? t("overview.updatedAt", { time: formatTime(data.asOf, i18n.language) })
            : t("overview.loading")}
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={data.refresh}>
          {t("overview.refresh")}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
        <div className="mx-auto grid w-full max-w-[1800px] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 content-start gap-4">
            <OverviewAsk
              groups={groups}
              readOnly={readOnly}
              isDark={isDark}
              onOpenGroup={onOpenGroup}
              onOpenTasks={() => onOpenTasks?.()}
            />
            {needsTotal > 0 ? (
              // The only call for attention: one line while something waits, gone otherwise.
              <button
                type="button"
                onClick={() => (firstNeedGroup ? onOpenPending(firstNeedGroup) : undefined)}
                className="justify-self-center"
                data-overview-needs-hint
              >
                {firstNeedGroup
                  ? t("overview.needsHint", {
                      count: needsTotal,
                      group: titles[firstNeedGroup] ?? firstNeedGroup,
                    })
                  : t("overview.stripNeeds", { count: needsTotal })}
              </button>
            ) : null}
            <DecidedForYou
              acts={chetActs}
              titles={titles}
              readOnly={readOnly}
              onOpenGroup={onOpenGroup}
            />
          </div>

          <div className="grid min-w-0 content-start gap-5">
            <div className="flex justify-end px-1 text-[13px] text-[var(--color-text-tertiary)]">
              <UnattendedSwitch readOnly={readOnly} />
            </div>
            <UnattendedRules />
            <QuotaCard limits={limits} />
            <Card
              title={t("overview.agentsTitle")}
              aside={t("overview.agentsBusyAside", {
                busy: busyAgents.length,
                agents: agents.length,
              })}
            >
              {agents.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--color-text-tertiary)]">
                  {t("overview.loading")}
                </p>
              ) : (
                <ul data-overview-list>
                  {busyAgents.map((agent) => {
                    const tone = agentTone(agent);
                    const detail = agent.blockers[0] || agent.focus;
                    return (
                      <li key={`${agent.groupId}:${agent.actorId}`}>
                        <button
                          type="button"
                          onClick={() => onOpenGroup(agent.groupId)}
                          className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition-colors"
                          data-overview-agent={tone}
                        >
                          <span
                            className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                            data-overview-ring={tone}
                            aria-hidden="true"
                          >
                            <ActorAvatar
                              avatarUrl={agent.avatarUrl || undefined}
                              runtime={agent.runtime}
                              title={agent.title}
                              isDark={isDark}
                              sizeClassName="h-7 w-7"
                              textClassName="text-[0.625rem]"
                              className="lcd-tile"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-baseline gap-2">
                              <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                                {agent.title}
                              </span>
                              <span className="truncate text-xs text-[var(--color-text-tertiary)]">
                                {titles[agent.groupId]}
                              </span>
                              {agent.updatedAt ? (
                                <span className="ml-auto shrink-0 text-xs text-[var(--color-text-tertiary)]">
                                  {age(agent.updatedAt)}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 line-clamp-2 break-words text-[13px] leading-5 text-[var(--color-text-secondary)]">
                              {t(`overview.state.${tone}`)}
                              {detail ? ` · ${oneLine(detail)}` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {busyAgents.length === 0 ? (
                    <li className="px-4 py-3 text-[13px] text-[var(--color-text-tertiary)]">
                      {t("overview.noBusyAgents")}
                    </li>
                  ) : null}
                  {quietAgents.length > 0 ? (
                    <li
                      className="px-4 py-3 text-[13px] leading-5 text-[var(--color-text-tertiary)]"
                      data-overview-quiet-agents
                    >
                      {t("overview.quietAgents", {
                        count: quietAgents.length,
                        names: quietAgents.map((agent) => agent.title).join("、"),
                      })}
                    </li>
                  ) : null}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
