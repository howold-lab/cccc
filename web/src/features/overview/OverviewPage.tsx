import { useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAge } from "./useAge";
import { ActorAvatar } from "../../components/ActorAvatar";
import { MenuIcon } from "../../components/Icons";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import { sendMessage } from "../../services/api/context";
import { answerPendingReply } from "../../services/api/pendingReplies";
import type { GroupMeta } from "../../types";
import { newClientId } from "../../utils/clientId";
import { PendingSummaryContext } from "../pendingReplies/context";
import { OverviewAsk } from "./OverviewAsk";
import { QuotaCard, QuotaChip } from "./QuotaCard";
import { useClaudeLimits } from "./useClaudeLimits";
import { readLastAsked } from "./askModel";
import { oneLine } from "./plainText";
import {
  useOverviewData,
  type OverviewActivity,
  type OverviewAgent,
  type OverviewPendingItem,
} from "./useOverviewData";

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
  children,
}: {
  title: string;
  count?: number;
  aside?: string;
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
      </header>
      {children}
    </section>
  );
}

function PendingRow({
  item,
  groupTitle,
  readOnly,
  onOpen,
  onAnswered,
}: {
  item: OverviewPendingItem;
  groupTitle: string;
  readOnly: boolean;
  onOpen: () => void;
  onAnswered: () => void;
}) {
  const { t, i18n } = useTranslation("layout");
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState(false);
  const question = item.question;
  const options = question?.options ?? [];
  const prompt = question?.prompt || item.text;

  const answer = async (optionId: string) => {
    setBusy(optionId);
    setFailed(false);
    const response = await answerPendingReply(item.groupId, item.event.id ?? "", newClientId(), {
      v: 1,
      option_id: optionId,
    }).catch(() => null);
    setBusy("");
    if (response?.ok) onAnswered();
    else setFailed(true);
  };

  return (
    <li className="px-4 py-3" data-overview-need="question">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            <span className="font-medium text-[var(--color-text-primary)]">{groupTitle}</span> ·{" "}
            {item.sender} · {formatTime(item.ts, i18n.language)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[var(--color-text-primary)]">
            {prompt}
          </p>
          {options.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {options.map((option) => {
                const recommended = question?.recommended?.option_id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={readOnly || !!busy}
                    onClick={() => void answer(option.id)}
                    title={option.consequence || undefined}
                    className="max-w-full rounded-lg border px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    data-overview-option={option.id}
                    data-recommended={recommended ? "" : undefined}
                  >
                    {option.id}. {option.label}
                    {recommended ? (
                      <span className="ml-1 text-[11px]"> · {t("overview.recommended")}</span>
                    ) : null}
                    {busy === option.id ? (
                      <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                        {t("overview.sending")}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {failed ? (
            <p className="mt-1 text-xs text-[var(--color-accent-danger)]">
              {t("overview.answerFailed")}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onOpen}>
          {t("overview.openInGroup")}
        </Button>
      </div>
    </li>
  );
}

function UnansweredRow({
  groupTitle,
  activity,
  onOpen,
}: {
  groupTitle: string;
  activity: OverviewActivity;
  onOpen: () => void;
}) {
  const { t } = useTranslation("layout");
  const age = useAge();
  const message = activity.unanswered;
  if (!message) return null;
  return (
    <li className="px-4 py-3" data-overview-need="unanswered">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            <span className="font-medium text-[var(--color-text-primary)]">{groupTitle}</span> ·{" "}
            <span data-overview-tag="unanswered">{t("overview.unanswered")}</span>
          </p>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            {t("overview.unansweredText", { age: age(message.ts) })}
          </p>
          <p className="mt-0.5 line-clamp-2 break-words text-sm text-[var(--color-text-primary)]">
            「{oneLine(message.text)}」
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onOpen}>
          {t("overview.openInGroup")}
        </Button>
      </div>
    </li>
  );
}

type ProjectRow = {
  group: GroupMeta;
  activity: OverviewActivity | undefined;
  pending: number;
  tone: Tone;
  needsYou: boolean;
};

function groupTone(group: GroupMeta, agents: OverviewAgent[]): Tone {
  if (agents.some((agent) => agentTone(agent) === "working")) return "working";
  if (agents.some((agent) => agentTone(agent) === "stuck")) return "stuck";
  if (agents.some((agent) => agent.running) || group.running) return "idle";
  return "stopped";
}

function QuickReply({
  groupId,
  groupTitle,
  onSent,
  onClose,
}: {
  groupId: string;
  groupTitle: string;
  onSent: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("layout");
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");
  const send = async () => {
    const body = text.trim();
    if (!body || state === "sending") return;
    setState("sending");
    // No recipients: the Group's default recipient policy applies, as in the composer.
    const response = await sendMessage(groupId, body, [], undefined, "send", newClientId()).catch(
      () => null,
    );
    if (response?.ok) {
      setText("");
      setState("idle");
      onSent();
    } else {
      setState("failed");
    }
  };
  return (
    <div className="px-4 pb-3 pl-9" data-overview-reply>
      <textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
          }
          if (event.key === "Escape") onClose();
        }}
        placeholder={t("overview.replyPlaceholder", { group: groupTitle })}
        className="block w-full resize-none rounded-xl border px-3 py-2 text-sm"
        data-lcd-field
      />
      <div className="mt-2 flex items-center gap-2">
        {state === "failed" ? (
          <span className="text-xs text-[var(--color-accent-danger)]">
            {t("overview.sendFailed")}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {t("overview.replyHint")}
          </span>
        )}
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
          {t("overview.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!text.trim() || state === "sending"}
          onClick={() => void send()}
          data-overview-send
        >
          {state === "sending" ? t("overview.sending") : t("overview.send")}
        </Button>
      </div>
    </div>
  );
}

function ProjectItem({
  row,
  answerAbove,
  readOnly,
  onOpen,
  onSent,
}: {
  row: ProjectRow;
  /** Its latest reply is the answer shown in the ask card, so it is not repeated. */
  answerAbove: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation("layout");
  const age = useAge();
  const [replying, setReplying] = useState(false);
  const [sent, setSent] = useState(false);
  const reply = row.activity?.lastReply;
  const lastTs = row.activity?.lastTs || "";
  const title = row.group.title || row.group.group_id;
  return (
    <li data-overview-project-row>
      <div className="flex min-w-0 items-stretch">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 pr-2 text-left transition-colors"
          data-overview-project={row.tone}
        >
          <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" data-overview-dot={row.tone} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                {title}
              </span>
              <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">
                {t(`overview.state.${row.tone}`)}
              </span>
              {row.pending > 0 ? (
                <span
                  className="shrink-0 rounded-full px-1.5 text-[11px] font-semibold"
                  data-pending-state
                >
                  {row.pending}
                </span>
              ) : null}
              <span className="ml-auto shrink-0 text-xs text-[var(--color-text-tertiary)]">
                {lastTs ? age(lastTs) : t("overview.quiet")}
              </span>
            </span>
            <span className="mt-0.5 line-clamp-2 break-words text-[13px] leading-5 text-[var(--color-text-secondary)]">
              {reply && answerAbove ? (
                <span className="text-[var(--color-text-tertiary)]">
                  {t("overview.answerAbove")}
                </span>
              ) : reply ? (
                <>
                  <span className="text-[var(--color-text-tertiary)]">{reply.by}：</span>
                  {oneLine(reply.text)}
                </>
              ) : (
                <span className="text-[var(--color-text-tertiary)]">{t("overview.noReply")}</span>
              )}
            </span>
          </span>
        </button>
        {readOnly ? null : (
          <span className="flex shrink-0 items-start py-2.5 pr-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={replying}
              onClick={() => {
                setSent(false);
                setReplying((value) => !value);
              }}
              data-overview-reply-toggle
            >
              {sent ? t("overview.sent") : t("overview.reply")}
            </Button>
          </span>
        )}
      </div>
      {replying ? (
        <QuickReply
          groupId={row.group.group_id}
          groupTitle={title}
          onClose={() => setReplying(false)}
          onSent={() => {
            setReplying(false);
            setSent(true);
            onSent();
          }}
        />
      ) : null}
    </li>
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
  const summary = useContext(PendingSummaryContext);
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
  const unansweredGroups = new Set(unanswered.map((activity) => activity.groupId));

  const rows: ProjectRow[] = groups
    .map((group) => {
      const agents = data.agents.filter((agent) => agent.groupId === group.group_id);
      const pending = data.pendingByGroup[group.group_id] ?? 0;
      return {
        group,
        activity: data.activity[group.group_id],
        pending,
        tone: groupTone(group, agents),
        needsYou: pending > 0 || unansweredGroups.has(group.group_id),
      };
    })
    .sort((a, b) => {
      if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
      return (b.activity?.lastTs || "").localeCompare(a.activity?.lastTs || "");
    });

  const runningGroups = rows.filter((row) => row.tone !== "stopped").length;
  const onlineAgents = data.agents.filter((agent) => agent.running).length;
  const workingAgents = data.agents.filter((agent) => agentTone(agent) === "working").length;
  const today = new Date().toDateString();
  const activeToday = rows.filter(
    (row) => row.activity?.lastTs && new Date(row.activity.lastTs).toDateString() === today,
  ).length;
  const agents = [...data.agents].sort((a, b) => {
    const order: Tone[] = ["working", "stuck", "waiting", "idle", "stopped"];
    const diff = order.indexOf(agentTone(a)) - order.indexOf(agentTone(b));
    if (diff) return diff;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });

  const answered = () => {
    data.refresh();
    summary?.refresh();
  };
  const busyAgents = agents.filter((agent) =>
    ["working", "stuck", "waiting"].includes(agentTone(agent)),
  );
  const quietAgents = agents.filter((agent) => !busyAgents.includes(agent));
  const lastAsked = readLastAsked();
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
        <div className="mx-auto grid w-full max-w-[1800px] gap-5">
          <OverviewAsk
            groups={groups}
            readOnly={readOnly}
            isDark={isDark}
            onOpenGroup={onOpenGroup}
            onOpenTasks={() => onOpenTasks?.()}
          />

          <p
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-[var(--color-text-tertiary)]"
            data-overview-strip
          >
            <span data-overview-strip-needs={needsTotal > 0 ? "alert" : "none"}>
              {needsTotal > 0
                ? t("overview.stripNeeds", { count: needsTotal })
                : t("overview.stripNoNeeds")}
            </span>
            <span>
              {t("overview.stripRunning", { running: runningGroups, total: groups.length })}
            </span>
            <span>
              {t("overview.stripWorking", { count: workingAgents, online: onlineAgents })}
            </span>
            <span>{t("overview.stripActive", { count: activeToday })}</span>
            <QuotaChip limits={limits} />
          </p>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid min-w-0 content-start gap-5">
              {data.loading || needsTotal > 0 ? (
                <Card
                  title={t("overview.needsTitleFact")}
                  count={needsTotal}
                  aside={t("overview.needsAside")}
                >
                  {data.loading ? (
                    <p className="px-4 py-4 text-sm text-[var(--color-text-tertiary)]">
                      {t("overview.loading")}
                    </p>
                  ) : needsTotal === 0 ? (
                    <p className="px-4 py-4 text-sm text-[var(--color-text-tertiary)]">
                      {t("overview.needsEmpty")}
                    </p>
                  ) : (
                    <ul data-overview-list>
                      {data.pending.map((item) => (
                        <PendingRow
                          key={`${item.groupId}:${item.event.id}`}
                          item={item}
                          groupTitle={titles[item.groupId] ?? item.groupId}
                          readOnly={readOnly}
                          onOpen={() => onOpenPending(item.groupId)}
                          onAnswered={answered}
                        />
                      ))}
                      {unanswered.map((activity) => (
                        <UnansweredRow
                          key={`unanswered:${activity.groupId}`}
                          groupTitle={titles[activity.groupId] ?? activity.groupId}
                          activity={activity}
                          onOpen={() => onOpenGroup(activity.groupId)}
                        />
                      ))}
                    </ul>
                  )}
                </Card>
              ) : null}

              <Card title={t("overview.projectsTitle")} aside={t("overview.projectsAside")}>
                <ul data-overview-list>
                  {rows.map((row) => (
                    <ProjectItem
                      key={row.group.group_id}
                      row={row}
                      answerAbove={
                        !!lastAsked &&
                        lastAsked.groupId === row.group.group_id &&
                        !!row.activity?.lastReply &&
                        row.activity.lastReply.ts >= lastAsked.ts
                      }
                      readOnly={readOnly}
                      onOpen={() => onOpenGroup(row.group.group_id)}
                      onSent={data.refresh}
                    />
                  ))}
                </ul>
              </Card>
            </div>

            <div className="grid min-w-0 content-start gap-5">
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
    </div>
  );
}
