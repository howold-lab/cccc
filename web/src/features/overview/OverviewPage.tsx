import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MenuIcon } from "../../components/Icons";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import type { GroupMeta } from "../../types";
import { OverviewAsk } from "./OverviewAsk";
import { isBusy } from "./agentModel";
import { AgentsTile, QuotaTile, UnattendedTile } from "./OverviewTiles";
import { useClaudeLimits } from "./useClaudeLimits";
import { DecidedForYou, UnattendedRules } from "./Unattended";
import { useOverviewData, type OverviewActivity } from "./useOverviewData";

/** A user message counts as unanswered once it has waited this long. */
const UNANSWERED_AFTER_MS = 2 * 60 * 60 * 1000;

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

function greetingKey(hour: number) {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 13) return "noon";
  if (hour >= 13 && hour < 18) return "afternoon";
  return "evening";
}

/**
 * The home across Groups: a greeting that says whether anything waits, the ask box, and three
 * small tiles for quota, agents and the unattended switch.
 */
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
  // Ask chips lead with the Groups that were active most recently.
  const recentGroups = useMemo(
    () =>
      [...groups].sort((a, b) =>
        (data.activity[b.group_id]?.lastTs || "").localeCompare(
          data.activity[a.group_id]?.lastTs || "",
        ),
      ),
    [groups, data.activity],
  );
  const busyCount = data.agents.filter(isBusy).length;
  const limits = useClaudeLimits();
  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-[var(--color-chat-bg)]"
      data-overview-page
    >
      <header
        className="relative z-[1] flex h-[48px] shrink-0 items-center gap-3 border-b border-[var(--color-border-secondary)] px-4"
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

      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 sm:px-8" data-overview-scroll>
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
          data-overview-glow
          aria-hidden="true"
        />
        <div className="relative mx-auto grid w-full max-w-[860px] content-start gap-5 pb-10 pt-8 sm:pt-12">
          <div className="px-1">
            <p className="text-[28px] font-semibold leading-tight" data-overview-greeting>
              {t(`overview.greeting.${greetingKey(new Date().getHours())}`)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[15px]" data-overview-pulse>
              <span aria-hidden="true" data-overview-pulse-dot={busyCount ? "busy" : "quiet"} />
              <span>
                {busyCount
                  ? t("overview.pulse.busy", { count: busyCount })
                  : t("overview.pulse.quiet")}
              </span>
              <span aria-hidden="true">·</span>
              {needsTotal > 0 ? (
                // The only call for attention: present while something waits, calm otherwise.
                <button
                  type="button"
                  onClick={() => (firstNeedGroup ? onOpenPending(firstNeedGroup) : undefined)}
                  data-overview-needs-hint
                >
                  {firstNeedGroup
                    ? t("overview.needsHint", {
                        count: needsTotal,
                        group: titles[firstNeedGroup] ?? firstNeedGroup,
                      })
                    : t("overview.stripNeeds", { count: needsTotal })}
                </button>
              ) : (
                <span data-overview-calm>{t("overview.pulse.calm")}</span>
              )}
            </p>
          </div>

          <OverviewAsk
            groups={recentGroups}
            readOnly={readOnly}
            isDark={isDark}
            onOpenGroup={onOpenGroup}
            onOpenTasks={() => onOpenTasks?.()}
          />

          <div className="grid gap-3.5 md:grid-cols-[1.15fr_1.15fr_0.9fr]" data-overview-tiles>
            <QuotaTile limits={limits} />
            <AgentsTile agents={data.agents} titles={titles} onOpenGroup={onOpenGroup} />
            <UnattendedTile readOnly={readOnly} />
          </div>

          <UnattendedRules />
          <DecidedForYou
            acts={chetActs}
            titles={titles}
            readOnly={readOnly}
            onOpenGroup={onOpenGroup}
          />
        </div>
      </div>
    </div>
  );
}
