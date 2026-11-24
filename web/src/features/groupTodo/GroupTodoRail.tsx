import { useState } from "react";
import { useTranslation } from "react-i18next";
import { replyMessage } from "../../services/api/context";
import { newClientId } from "../../utils/clientId";
import {
  answerNeed,
  canTakeRecommendation,
  needsYouPersonally,
  recommendedOption,
} from "../overview/needsModel";
import { oneLine } from "../overview/plainText";
import { useAge } from "../overview/useAge";
import type { OverviewPendingItem } from "../overview/useOverviewData";
import type { AnsweredTodo } from "./answeredModel";
import { batchTodos, promptOf, splitTag } from "./todoModel";
import { useGroupTodo } from "./useGroupTodo";

const OPEN_KEY = (groupId: string) => `cccc-todo-rail:${groupId}`;

function readOpen(groupId: string) {
  try {
    return window.localStorage.getItem(OPEN_KEY(groupId)) !== "0";
  } catch {
    return true;
  }
}

type Handled = {
  groupId: string;
  eventId: string;
  summary: string;
  choice: string;
  undone?: boolean;
};

function TodoCard({
  item,
  readOnly,
  onLocate,
  onAnswered,
}: {
  item: OverviewPendingItem;
  readOnly: boolean;
  onLocate: (eventId: string) => void;
  onAnswered: (choice: string) => void;
}) {
  const { t } = useTranslation("layout");
  const age = useAge();
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState(false);
  const { tag, rest } = splitTag(promptOf(item));
  const options = item.question?.options ?? [];
  const recommended = recommendedOption(item);
  const personal = needsYouPersonally(item);
  const eventId = String(item.event.id ?? "");

  const answer = async (optionId: string, label: string) => {
    setBusy(optionId);
    setFailed(false);
    const ok = await answerNeed(item, optionId);
    setBusy("");
    if (ok) onAnswered(label);
    else setFailed(true);
  };

  return (
    <li
      className="rounded-xl px-3 py-2.5"
      data-todo-card
      data-todo-personal={personal || undefined}
    >
      <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
        {tag ? <span data-todo-tag>{tag}</span> : null}
        <span className="truncate">
          {item.sender} · {age(item.ts)}
        </span>
        {personal ? (
          <span className="shrink-0" data-need-tag="personal">
            {t("overview.needs.personal")}
          </span>
        ) : null}
      </p>
      <p className="mt-1 line-clamp-3 break-words text-[13px] leading-5 text-[var(--color-text-primary)]">
        {oneLine(rest)}
      </p>
      {recommended ? (
        <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-secondary)]" data-need-rec>
          {t("overview.needs.recommend")} <b>{recommended.option.label}</b>
          {recommended.reason ? ` · ${oneLine(recommended.reason)}` : ""}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {!readOnly
          ? options.slice(0, 3).map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={!!busy}
                title={option.consequence || undefined}
                onClick={() => void answer(option.id, option.label)}
                data-need-action={recommended?.option.id === option.id ? "take" : "more"}
              >
                {busy === option.id ? t("overview.sending") : option.label}
              </button>
            ))
          : null}
        <button
          type="button"
          onClick={() => onLocate(eventId)}
          data-need-action="more"
          data-todo-locate
        >
          {options.length > 3 || options.length === 0 || readOnly
            ? t("todo.openInChat")
            : t("todo.locate")}
        </button>
      </div>
      {failed ? (
        <p className="mt-1 text-xs text-[var(--color-accent-danger)]">
          {t("overview.answerFailed")}
        </p>
      ) : null}
    </li>
  );
}

/**
 * A Group's open questions to the user, beside the chat: one small card each, batches by the
 * agent's source tag, one-click recommended answers, and a pointer to asks that never became
 * a card. Nothing is shown when nothing waits.
 */
export function GroupTodoRail({
  groupId,
  readOnly,
  onLocate,
}: {
  groupId: string;
  readOnly: boolean;
  onLocate: (eventId: string) => void;
}) {
  const { t } = useTranslation("layout");
  const todo = useGroupTodo(groupId, true);
  const [openState, setOpenState] = useState<{ groupId: string; open: boolean }>(() => ({
    groupId,
    open: readOpen(groupId),
  }));
  const open = openState.groupId === groupId ? openState.open : readOpen(groupId);
  const [handled, setHandled] = useState<Handled[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const mine = handled.filter((entry) => entry.groupId === groupId);

  const setOpen = (next: boolean) => {
    setOpenState({ groupId, open: next });
    try {
      window.localStorage.setItem(OPEN_KEY(groupId), next ? "1" : "0");
    } catch {
      // Still applies for this visit.
    }
  };

  const items = todo.items.filter(
    (item) => !mine.some((entry) => entry.eventId === String(item.event.id ?? "")),
  );
  // Answered this visit but not yet in the ledger read: shown as running until it arrives.
  const pendingRecent: AnsweredTodo[] = mine
    .filter((entry) => !todo.answered.some((item) => item.cardId === entry.eventId))
    .map((entry) => ({
      cardId: entry.eventId,
      answerId: "",
      by: "user",
      tag: "",
      summary: entry.summary,
      choice: entry.choice,
      answeredAt: new Date().toISOString(),
      status: "running",
      resultId: "",
      resultText: "",
    }));
  const recent = [...pendingRecent, ...todo.answered];
  const undone = new Set(mine.filter((entry) => entry.undone).map((entry) => entry.eventId));
  if (!items.length && !todo.stray && !recent.length) return null;

  const remember = (item: OverviewPendingItem, choice: string) => {
    setHandled((list) => [
      {
        groupId,
        eventId: String(item.event.id ?? ""),
        summary: oneLine(splitTag(promptOf(item)).rest),
        choice,
      },
      ...list,
    ]);
    todo.refresh();
  };

  const takeAll = async (list: OverviewPendingItem[]) => {
    const quick = list.filter(canTakeRecommendation);
    if (!quick.length) return;
    if (!window.confirm(t("overview.needs.takeAllConfirm", { count: quick.length }))) return;
    setBulkBusy(true);
    for (const item of quick) {
      const option = recommendedOption(item);
      if (option && (await answerNeed(item, option.option.id))) remember(item, option.option.label);
    }
    setBulkBusy(false);
  };

  const undo = async (entry: AnsweredTodo) => {
    // Replying to the card reaches whoever asked it; its reply comes back as reverted.
    const response = await replyMessage(
      groupId,
      t("todo.undoText", { choice: entry.choice }),
      [],
      entry.cardId,
      undefined,
      newClientId(),
    ).catch(() => null);
    if (response?.ok) {
      setHandled((list) => {
        const known = list.some((item) => item.eventId === entry.cardId);
        return known
          ? list.map((item) => (item.eventId === entry.cardId ? { ...item, undone: true } : item))
          : [
              {
                groupId,
                eventId: entry.cardId,
                summary: entry.summary,
                choice: entry.choice,
                undone: true,
              },
              ...list,
            ];
      });
      todo.refresh();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-8 shrink-0 flex-col items-center gap-1.5 border-l pt-3 text-xs"
        data-todo-rail-tab
        aria-label={t("todo.open")}
      >
        <span style={{ writingMode: "vertical-rl" }}>{t("todo.title")}</span>
        {items.length ? <span data-todo-count>{items.length}</span> : null}
      </button>
    );
  }

  const batches = batchTodos(items);
  const quickCount = items.filter(canTakeRecommendation).length;

  return (
    <aside
      className="flex w-[300px] shrink-0 flex-col border-l"
      data-todo-rail
      aria-label={t("todo.title")}
    >
      <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        <h2 className="text-[13.5px] font-semibold text-[var(--color-text-primary)]">
          {t("todo.title")}
        </h2>
        {items.length ? <span data-todo-count>{items.length}</span> : null}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          {t("todo.close")}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5 pb-3">
        {!readOnly && quickCount > 1 ? (
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void takeAll(items)}
            className="mb-2 w-full"
            data-need-action="more"
          >
            {bulkBusy ? t("overview.sending") : t("overview.needs.takeAll", { count: quickCount })}
          </button>
        ) : null}
        {batches.map((batch, index) => {
          const quick = batch.items.filter(canTakeRecommendation).length;
          return (
            <section
              key={batch.tag || `single-${index}`}
              className="mb-2"
              data-todo-batch={batch.tag || undefined}
            >
              {batch.tag && batch.items.length > 1 ? (
                <p className="flex items-center gap-2 px-1 pb-1 text-[11.5px] font-medium text-[var(--color-text-secondary)]">
                  {t("todo.batch", { tag: batch.tag, count: batch.items.length })}
                  {!readOnly && quick > 1 ? (
                    <button
                      type="button"
                      disabled={bulkBusy}
                      onClick={() => void takeAll(batch.items)}
                      className="ml-auto text-[11.5px] font-normal text-[var(--lcd-accent)]"
                    >
                      {t("todo.batchTakeAll")}
                    </button>
                  ) : null}
                </p>
              ) : null}
              <ul className="grid gap-2">
                {batch.items.map((item) => (
                  <TodoCard
                    key={String(item.event.id)}
                    item={item}
                    readOnly={readOnly}
                    onLocate={onLocate}
                    onAnswered={(choice) => remember(item, choice)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
        {todo.stray ? (
          <button
            type="button"
            onClick={() => onLocate(String(todo.stray?.id ?? ""))}
            className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-xs"
            data-todo-stray
          >
            {t("todo.stray")}
          </button>
        ) : null}
        {recent.length ? (
          <section className="mt-3" data-todo-recent>
            <p className="px-1 pb-1 text-[11.5px] font-medium text-[var(--color-text-secondary)]">
              {t("todo.recentTitle")}
            </p>
            <ul className="grid min-w-0 grid-cols-1 gap-1.5">
              {recent.slice(0, 6).map((entry) => {
                const asked = undone.has(entry.cardId) && entry.status !== "reverted";
                const status = asked ? "reverting" : entry.status;
                return (
                  <li
                    key={entry.answerId || entry.cardId}
                    className="min-w-0 overflow-hidden rounded-lg px-2.5 py-2 text-[12px]"
                    data-todo-recent-item={status}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0" data-todo-status={status}>
                        {t(`todo.status.${status}`)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onLocate(entry.resultId || entry.answerId || entry.cardId)}
                        className="min-w-0 flex-1 truncate text-left text-[var(--color-text-primary)]"
                        title={entry.summary}
                      >
                        {entry.by === "chet"
                          ? t("todo.chetChose", { choice: entry.choice })
                          : t("todo.handled", { choice: entry.choice })}
                        {entry.summary ? ` · ${oneLine(entry.summary)}` : ""}
                      </button>
                      {!readOnly && entry.status !== "reverted" && !asked && entry.answerId ? (
                        <button
                          type="button"
                          onClick={() => void undo(entry)}
                          className="shrink-0 text-[var(--lcd-accent)]"
                        >
                          {t("todo.undo")}
                        </button>
                      ) : null}
                    </div>
                    {entry.resultText ? (
                      <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-text-tertiary)]">
                        {oneLine(entry.resultText)}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
