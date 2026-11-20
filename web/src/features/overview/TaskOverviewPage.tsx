import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MenuIcon } from "../../components/Icons";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import type { GroupMeta } from "../../types";
import {
  STALE_AFTER_MS,
  useTaskOverviewData,
  type BoardColumn,
  type BoardTask,
} from "./useTaskOverviewData";

const COLUMNS: BoardColumn[] = ["planned", "active", "stuck", "done"];

function useAge() {
  const { t } = useTranslation("layout");
  return (ts: string | null | undefined) => {
    const time = new Date(String(ts || "")).getTime();
    if (!ts || Number.isNaN(time)) return "";
    const minutes = Math.floor((Date.now() - time) / 60_000);
    if (minutes < 1) return t("overview.age.justNow");
    if (minutes < 60) return t("overview.age.minutes", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("overview.age.hours", { count: hours });
    return t("overview.age.days", { count: Math.floor(hours / 24) });
  };
}

function TaskCard({
  entry,
  groupTitle,
  onOpen,
}: {
  entry: BoardTask;
  groupTitle: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation("layout");
  const age = useAge();
  const { task } = entry;
  const reason =
    entry.waitingOn === "user"
      ? t("overview.tasks.waitingUser")
      : entry.waitingOn === "actor"
        ? t("overview.tasks.waitingActor")
        : entry.waitingOn === "external"
          ? t("overview.tasks.waitingExternal")
          : entry.blockedBy.length
            ? t("overview.tasks.blockedBy", { ids: entry.blockedBy.join(", ") })
            : "";
  const updated = task.updated_at ? t("overview.tasks.since", { age: age(task.updated_at) }) : "";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full min-w-0 rounded-[10px] px-3 py-2.5 text-left"
        data-board-task={entry.column}
        data-stale={entry.stale ? "" : undefined}
        title={task.outcome || task.notes || undefined}
      >
        <span className="block break-words text-[13.5px] font-medium leading-5 text-[var(--color-text-primary)]">
          {task.title || task.id}
        </span>
        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
          <span className="max-w-[12rem] truncate rounded-full px-2 py-px" data-board-group>
            {groupTitle}
          </span>
          {entry.stale ? (
            <span
              className="rounded-full px-2 py-px"
              data-board-tag="stale"
              title={t("overview.tasks.staleTitle")}
            >
              {t("overview.tasks.stale")}
            </span>
          ) : null}
          {entry.column === "done" ? null : (
            <span className="ml-auto truncate">
              {task.assignee || t("overview.tasks.unassigned")}
            </span>
          )}
        </span>
        {entry.checklistTotal > 0 && entry.column !== "done" ? (
          <span className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
            <span className="h-1 flex-1 overflow-hidden rounded-full" data-board-bar>
              <span
                className="block h-full rounded-full"
                style={{ width: `${(entry.checklistDone / entry.checklistTotal) * 100}%` }}
              />
            </span>
            {entry.checklistDone}/{entry.checklistTotal}
          </span>
        ) : null}
        {reason || (entry.column === "stuck" && updated) ? (
          <span className="mt-1.5 block text-xs" data-board-reason>
            {[reason, updated].filter(Boolean).join(" · ")}
          </span>
        ) : entry.column !== "planned" && updated ? (
          <span className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">
            {updated}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** Every working Group's tasks on one board, checked against what the Groups actually did. */
export function TaskOverviewPage({
  groups,
  onOpenGroup,
  onOpenSidebar,
}: {
  groups: GroupMeta[];
  onOpenGroup: (groupId: string) => void;
  onOpenSidebar?: () => void;
}) {
  const { t } = useTranslation("layout");
  const data = useTaskOverviewData(groups);
  const [groupFilter, setGroupFilter] = useState("");
  const [onlyStuck, setOnlyStuck] = useState(false);
  const titles = useMemo(
    () =>
      Object.fromEntries(groups.map((group) => [group.group_id, group.title || group.group_id])),
    [groups],
  );

  const withTasks = groups.filter((group) =>
    data.tasks.some((entry) => entry.groupId === group.group_id),
  );
  const visible = data.tasks.filter(
    (entry) =>
      (!groupFilter || entry.groupId === groupFilter) && (!onlyStuck || entry.column === "stuck"),
  );
  const openCount = data.tasks.filter((entry) => entry.column !== "done").length;
  const recentlyActive = (groupId: string) => {
    const ts = data.activity[groupId]?.lastTs;
    return !!ts && Date.now() - new Date(ts).getTime() < STALE_AFTER_MS;
  };
  const quietGroups = data.loading
    ? []
    : groups.filter(
        (group) =>
          recentlyActive(group.group_id) &&
          !data.tasks.some((entry) => entry.groupId === group.group_id && entry.column !== "done"),
      );
  const columns = COLUMNS.filter((column) => !onlyStuck || column === "stuck");
  const sortTasks = (a: BoardTask, b: BoardTask) =>
    String(b.task.updated_at || "").localeCompare(String(a.task.updated_at || ""));

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-chat-bg)]" data-task-overview>
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
          {t("overview.tasks.title")}
        </h1>
        <span className="truncate text-xs text-[var(--color-text-tertiary)]">
          {data.loading
            ? t("overview.loading")
            : t("overview.tasks.summary", { groups: withTasks.length, open: openCount })}
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={data.refresh}>
          {t("overview.refresh")}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-2" data-board-toolbar>
          {[
            { id: "", label: t("overview.tasks.all") },
            ...withTasks.map((group) => ({ id: group.group_id, label: titles[group.group_id] })),
          ].map((chip) => (
            <button
              key={chip.id || "all"}
              type="button"
              aria-pressed={groupFilter === chip.id}
              onClick={() => setGroupFilter(chip.id)}
              className="max-w-[14rem] truncate rounded-full px-3 py-1 text-[13px]"
              data-board-chip
            >
              {chip.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={onlyStuck}
            onClick={() => setOnlyStuck((value) => !value)}
            className="ml-auto rounded-full px-3 py-1 text-[13px]"
            data-board-chip
          >
            {t("overview.tasks.onlyStuck")}
          </button>
        </div>

        {quietGroups.length > 0 ? (
          <p className="rounded-xl px-4 py-2.5 text-[13px]" data-board-notice>
            {t("overview.tasks.quietGroups", {
              names: quietGroups.map((group) => titles[group.group_id]).join("、"),
            })}
          </p>
        ) : null}

        <div
          className="grid min-h-[24rem] flex-1 gap-3 overflow-x-auto pb-1"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}
          data-board
        >
          {columns.map((column) => {
            const entries = visible.filter((entry) => entry.column === column).sort(sortTasks);
            return (
              <section
                key={column}
                className={`flex min-w-0 flex-col gap-2 rounded-[14px] p-2.5 ${column === "stuck" ? "max-md:order-first" : ""}`}
                data-board-column={column}
              >
                <h2 className="flex items-center gap-1.5 px-1 pt-0.5 text-[13px] font-semibold text-[var(--color-text-primary)]">
                  {t(`overview.tasks.columns.${column}`)}
                  <span
                    className="font-normal text-[var(--color-text-tertiary)]"
                    data-board-column-count
                  >
                    {entries.length}
                  </span>
                </h2>
                {entries.length === 0 ? (
                  <p className="px-1 text-xs text-[var(--color-text-tertiary)]">
                    {data.loading ? t("overview.loading") : t("overview.tasks.columnEmpty")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {entries.map((entry) => (
                      <TaskCard
                        key={`${entry.groupId}:${entry.task.id}`}
                        entry={entry}
                        groupTitle={titles[entry.groupId] ?? entry.groupId}
                        onOpen={() => onOpenGroup(entry.groupId)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
