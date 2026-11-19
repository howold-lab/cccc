import { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { answerPendingReply } from "../../services/api/pendingReplies";
import type { GroupMeta } from "../../types";
import { classNames } from "../../utils/classNames";
import { newClientId } from "../../utils/clientId";
import { PendingSummaryContext } from "../pendingReplies/context";
import { useOverviewData, type OverviewAgent, type OverviewPendingItem } from "./useOverviewData";

type Tone = "working" | "waiting" | "stuck" | "idle" | "stopped";

function agentTone(agent: OverviewAgent): Tone {
  if (!agent.running) return "stopped";
  if (agent.workingState === "working") return "working";
  if (agent.workingState === "stuck" || agent.blockers.length) return "stuck";
  if (agent.workingState === "waiting") return "waiting";
  return "idle";
}

const TONE_DOT: Record<Tone, string> = {
  working: "bg-[#2F6FDB]",
  waiting: "bg-[#C27A12]",
  stuck: "bg-[#E5383B]",
  idle: "bg-[#2E8B57]",
  stopped: "bg-[var(--color-text-tertiary)] opacity-50",
};

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

function Card({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section
      className="min-w-0 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4"
      data-overview-card
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {aside ? <span className="text-xs text-[var(--color-text-tertiary)]">{aside}</span> : null}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, note, alert }: { label: string; value: string; note?: string; alert?: boolean }) {
  return (
    <div
      className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-4 py-3"
      data-overview-stat
    >
      <div className="text-xs text-[var(--color-text-tertiary)]">{label}</div>
      <div
        className={classNames(
          "mt-1 text-2xl font-semibold tabular-nums",
          alert ? "text-[#E5383B]" : "text-[var(--color-text-primary)]",
        )}
      >
        {value}
      </div>
      {note ? <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{note}</div> : null}
    </div>
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
    <li className="border-t border-[var(--color-border-primary)] py-3 first:border-t-0 first:pt-0" data-overview-pending>
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 shrink-0 rounded-md bg-[#FBF1DF] px-1.5 py-0.5 text-[11px] font-semibold text-[#C27A12]">
          {t("overview.awaitingYou")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-primary)]">
            {prompt}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
            {groupTitle} · {item.sender} · {formatTime(item.ts, i18n.language)}
          </p>
          {options.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {options.map((option) => {
                const recommended = question?.recommended?.option_id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={readOnly || !!busy}
                    onClick={() => void answer(option.id)}
                    className={classNames(
                      "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      "border-[var(--color-border-primary)] hover:bg-[var(--glass-tab-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                    data-overview-option={option.id}
                  >
                    <span className="font-semibold text-[var(--color-text-secondary)]">{option.id}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-[var(--color-text-primary)]">{option.label}</span>
                      {recommended ? (
                        <span className="ml-2 rounded border border-[var(--color-border-primary)] px-1 text-[11px] text-[var(--color-text-secondary)]">
                          {t("overview.recommended")}
                        </span>
                      ) : null}
                      {option.consequence ? (
                        <span className="block text-xs text-[var(--color-text-tertiary)]">
                          {option.consequence}
                        </span>
                      ) : null}
                    </span>
                    {busy === option.id ? (
                      <span className="text-xs text-[var(--color-text-tertiary)]">{t("overview.sending")}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {failed ? (
            <p className="mt-1 text-xs text-[#E5383B]">{t("overview.answerFailed")}</p>
          ) : null}
        </div>
        <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={onOpen}>
          {t("overview.openInGroup")}
        </Button>
      </div>
    </li>
  );
}

/** The home across Groups: what waits on the user, and what each agent is doing. */
export function OverviewPage({
  groups,
  readOnly,
  onOpenGroup,
  onOpenPending,
}: {
  groups: GroupMeta[];
  readOnly: boolean;
  onOpenGroup: (groupId: string) => void;
  onOpenPending: (groupId: string) => void;
}) {
  const { t, i18n } = useTranslation("layout");
  const summary = useContext(PendingSummaryContext);
  const data = useOverviewData(groups, true);
  const titles = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.group_id, group.title || group.group_id])),
    [groups],
  );
  const runningGroups = groups.filter((group) => group.running).length;
  const runningAgents = data.agents.filter((agent) => agent.running).length;
  const workingAgents = data.agents.filter((agent) => agentTone(agent) === "working").length;
  const stuckAgents = data.agents.filter((agent) => agentTone(agent) === "stuck").length;
  const pendingTotal = data.pending.length;
  const agentsByGroup = groups
    .map((group) => ({ group, agents: data.agents.filter((agent) => agent.groupId === group.group_id) }))
    .filter((entry) => entry.agents.length > 0);

  const answered = () => {
    data.refresh();
    summary?.refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-chat-bg)]" data-overview-page>
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border-primary)] px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">{t("overview.title")}</h1>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {data.asOf
              ? t("overview.updatedAt", { time: formatTime(data.asOf, i18n.language) })
              : t("overview.loading")}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={data.refresh}>
          {t("overview.refresh")}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto grid max-w-6xl gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label={t("overview.statPending")}
              value={String(pendingTotal)}
              note={t("overview.statPendingNote")}
              alert={pendingTotal > 0}
            />
            <Stat
              label={t("overview.statGroups")}
              value={`${runningGroups} / ${groups.length}`}
              note={t("overview.statGroupsNote")}
            />
            <Stat
              label={t("overview.statAgents")}
              value={`${runningAgents} / ${data.agents.length}`}
              note={t("overview.statAgentsNote", { count: workingAgents })}
            />
            <Stat
              label={t("overview.statStuck")}
              value={String(stuckAgents)}
              note={t("overview.statStuckNote")}
              alert={stuckAgents > 0}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card title={t("overview.pendingTitle")} aside={t("overview.pendingAside", { count: pendingTotal })}>
              {data.loading ? (
                <p className="text-sm text-[var(--color-text-tertiary)]">{t("overview.loading")}</p>
              ) : pendingTotal === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)]">{t("overview.pendingEmpty")}</p>
              ) : (
                <ul>
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
                </ul>
              )}
            </Card>

            <Card
              title={t("overview.agentsTitle")}
              aside={t("overview.agentsAside", { groups: agentsByGroup.length, agents: data.agents.length })}
            >
              {agentsByGroup.length === 0 ? (
                <p className="text-sm text-[var(--color-text-tertiary)]">{t("overview.loading")}</p>
              ) : (
                <ul className="grid gap-3">
                  {agentsByGroup.map(({ group, agents }) => (
                    <li key={group.group_id} data-overview-group={group.group_id}>
                      <button
                        type="button"
                        onClick={() => onOpenGroup(group.group_id)}
                        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      >
                        <span className="truncate">{titles[group.group_id]}</span>
                        {(data.pendingByGroup[group.group_id] ?? 0) > 0 ? (
                          <span className="shrink-0 rounded-full bg-[#E5383B] px-1.5 text-[11px] text-white">
                            {data.pendingByGroup[group.group_id]}
                          </span>
                        ) : null}
                      </button>
                      <ul className="mt-1">
                        {agents.map((agent) => {
                          const tone = agentTone(agent);
                          const detail = agent.blockers[0] || agent.focus;
                          return (
                            <li
                              key={agent.actorId}
                              className="flex min-w-0 items-center gap-2 border-t border-[var(--color-border-primary)] py-1.5 text-sm first:border-t-0"
                              data-overview-agent={tone}
                            >
                              <span className={classNames("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
                              <span className="shrink-0 font-medium text-[var(--color-text-primary)]">
                                {agent.title}
                              </span>
                              <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">
                                {t(`overview.state.${tone}`)}
                              </span>
                              <span
                                className="min-w-0 flex-1 truncate text-right text-xs text-[var(--color-text-secondary)]"
                                title={detail || undefined}
                              >
                                {detail}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
