import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LazyMarkdownRenderer } from "../../components/LazyMarkdownRenderer";
import { Button } from "../../components/ui/button";
import { sendMessage } from "../../services/api/context";
import { fetchLedgerTail } from "../../services/api/messaging";
import type { ChatMessageData, GroupMeta, LedgerEvent } from "../../types";
import { newClientId } from "../../utils/clientId";
import { answersTo, type Asked } from "./askModel";
import { useAge } from "./useAge";

const GROUP_KEY = "cccc-overview-ask-group";
const LAST_KEY = "cccc-overview-ask-last";
/** A Group with this title is asked by default. */
const DEFAULT_TITLE = "调度层";
/** Reads while waiting for the answer, then slower so a follow-up message still shows. */
const WAITING_MS = 3_000;
const SETTLED_MS = 15_000;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The question still goes out; it is just not remembered across reloads.
  }
}

function defaultGroup(groups: GroupMeta[]): string {
  const saved = read<string>(GROUP_KEY);
  if (saved && groups.some((group) => group.group_id === saved)) return saved;
  return (
    groups.find((group) => (group.title || "").trim() === DEFAULT_TITLE)?.group_id ??
    groups[0]?.group_id ??
    ""
  );
}

/**
 * Ask a Group's agent from the overview: the question goes to the Group as an ordinary user
 * message, and the agent's reply is shown here. Nothing else answers it.
 */
export function OverviewAsk({
  groups,
  readOnly,
  isDark,
  onOpenGroup,
  onOpenTasks,
}: {
  groups: GroupMeta[];
  readOnly: boolean;
  isDark: boolean;
  onOpenGroup: (groupId: string) => void;
  onOpenTasks: () => void;
}) {
  const { t } = useTranslation("layout");
  const age = useAge();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [groupId, setGroupId] = useState(() => defaultGroup(groups));
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState<Asked | null>(() => read<Asked>(LAST_KEY));
  const [answers, setAnswers] = useState<LedgerEvent[]>([]);

  useEffect(() => {
    if (!groupId && groups.length) setGroupId(defaultGroup(groups));
  }, [groupId, groups]);

  const answered = answers.length > 0;
  useEffect(() => {
    if (!asked) return undefined;
    const controller = new AbortController();
    let stopped = false;
    const pull = async () => {
      const tail = await fetchLedgerTail(asked.groupId, 40, {
        includeStatuses: false,
        signal: controller.signal,
      }).catch(() => null);
      if (stopped || !tail?.ok) return;
      setAnswers(answersTo(asked, tail.result.events));
    };
    void pull();
    const timer = window.setInterval(() => void pull(), answered ? SETTLED_MS : WAITING_MS);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [asked, answered]);

  const ask = async (question: string) => {
    const body = question.trim();
    if (!body || !groupId || sending || readOnly) return;
    setSending(true);
    setFailed(false);
    const sentAt = new Date().toISOString();
    // No recipients: the Group's default recipient policy applies, as in its own composer.
    const response = await sendMessage(groupId, body, [], undefined, "send", newClientId()).catch(
      () => null,
    );
    setSending(false);
    if (!response?.ok) {
      setFailed(true);
      return;
    }
    const event = ((response.result ?? {}) as { event?: LedgerEvent }).event;
    const next: Asked = {
      groupId,
      question: body,
      ts: String(event?.ts || sentAt),
      eventId: String(event?.id || ""),
    };
    setText("");
    setAnswers([]);
    setAsked(next);
    write(LAST_KEY, next);
  };

  const chooseGroup = (id: string) => {
    setGroupId(id);
    write(GROUP_KEY, id);
  };
  const groupTitle = (id: string) => groups.find((group) => group.group_id === id)?.title || id;
  const quick = [
    t("overview.ask.quickConfirm"),
    t("overview.ask.quickProgress"),
    t("overview.ask.quickStuck"),
    t("overview.ask.quickDone"),
  ];

  return (
    <div className="grid gap-3" data-overview-ask-area>
      <div className="px-4 pb-3 pt-3.5" data-overview-ask>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
            data-overview-ask-mark
            aria-hidden="true"
          >
            ✦
          </span>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            disabled={readOnly}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void ask(text);
              }
            }}
            placeholder={t("overview.ask.placeholder", { group: groupTitle(groupId) })}
            aria-label={t("overview.ask.placeholder", { group: groupTitle(groupId) })}
            className="min-w-0 flex-1 resize-none bg-transparent py-1 text-[14.5px] leading-6 outline-none"
            data-overview-ask-input
          />
          <select
            value={groupId}
            onChange={(event) => chooseGroup(event.target.value)}
            aria-label={t("overview.ask.groupLabel")}
            className="max-w-[10rem] shrink-0 truncate rounded-full border px-2.5 py-1 text-xs"
            data-overview-ask-group
          >
            {groups.map((group) => (
              <option key={group.group_id} value={group.group_id}>
                {group.title || group.group_id}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={readOnly || sending || !text.trim()}
            onClick={() => void ask(text)}
            className="h-8 w-8 shrink-0 rounded-full p-0"
            aria-label={t("overview.send")}
            data-overview-ask-send
          >
            ↑
          </Button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2 pl-[38px]">
          {quick.map((question) => (
            <button
              key={question}
              type="button"
              disabled={readOnly || sending}
              onClick={() => void ask(question)}
              className="rounded-full border px-3 py-0.5 text-[12.5px]"
              data-overview-ask-chip
            >
              {question}
            </button>
          ))}
        </div>
        {failed ? (
          <p className="mt-2 pl-[38px] text-xs text-[var(--color-accent-danger)]">
            {t("overview.sendFailed")}
          </p>
        ) : null}
      </div>

      {asked ? (
        <section
          className="overflow-hidden"
          data-overview-answer={answered ? "answered" : "waiting"}
        >
          <header
            className="flex min-w-0 items-center gap-2 px-4 py-2.5 text-[13px] text-[var(--color-text-tertiary)]"
            data-overview-card-head
          >
            <span className="shrink-0">{t("overview.ask.youAsked")}</span>
            <span className="min-w-0 truncate text-[var(--color-text-primary)]">
              {asked.question}
            </span>
            <span className="shrink-0">
              · {groupTitle(asked.groupId)} · {age(asked.ts)}
            </span>
            <button
              type="button"
              className="ml-auto shrink-0 text-[var(--color-accent-secondary)]"
              onClick={() => onOpenGroup(asked.groupId)}
            >
              {t("overview.ask.openGroup", { group: groupTitle(asked.groupId) })} ›
            </button>
          </header>
          {answered ? (
            <div className="grid gap-3 px-5 py-3">
              {answers.map((event) => (
                <div key={String(event.id)} data-overview-answer-message>
                  <p className="mb-1 text-xs text-[var(--color-text-tertiary)]">
                    {String(event.by || "")} · {age(String(event.ts))}
                  </p>
                  <LazyMarkdownRenderer
                    content={String(((event.data ?? {}) as ChatMessageData).text || "")}
                    isDark={isDark}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p
              className="flex items-center gap-2 px-5 py-4 text-[13px] text-[var(--color-text-tertiary)]"
              data-overview-answer-waiting
            >
              <span className="lcd-reconnect-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {t("overview.ask.waiting", { group: groupTitle(asked.groupId) })}
            </p>
          )}
          <div className="flex gap-2 px-5 pb-3.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={readOnly}
              onClick={() => {
                chooseGroup(asked.groupId);
                inputRef.current?.focus();
              }}
            >
              {t("overview.ask.followUp")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onOpenTasks}>
              {t("overview.ask.openTasks")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
