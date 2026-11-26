import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LazyMarkdownRenderer } from "../../components/LazyMarkdownRenderer";
import { Button } from "../../components/ui/button";
import { sendMessage } from "../../services/api/context";
import { fetchLedgerTail } from "../../services/api/messaging";
import type { ChatMessageData, GroupMeta, LedgerEvent } from "../../types";
import { newClientId } from "../../utils/clientId";
import { answersTo, LAST_ASKED_KEY, NO_REPLY_AFTER_MS, type Asked } from "./askModel";
import { useAge } from "./useAge";

const GROUP_KEY = "cccc-overview-ask-group";
const LAST_KEY = LAST_ASKED_KEY;
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
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!groupId && groups.length) setGroupId(defaultGroup(groups));
  }, [groupId, groups]);

  const answered = answers.length > 0;
  useEffect(() => {
    if (!asked || answered) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [asked, answered]);
  const noReply = !!asked && !answered && now - new Date(asked.ts).getTime() > NO_REPLY_AFTER_MS;
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

  const ask = async (question: string, target = groupId) => {
    const body = question.trim();
    if (!body || !target || sending || readOnly) return;
    setSending(true);
    setFailed(false);
    const sentAt = new Date().toISOString();
    // No recipients: the Group's default recipient policy applies, as in its own composer.
    const response = await sendMessage(target, body, [], undefined, "send", newClientId()).catch(
      () => null,
    );
    setSending(false);
    if (!response?.ok) {
      setFailed(true);
      return;
    }
    const event = ((response.result ?? {}) as { event?: LedgerEvent }).event;
    const next: Asked = {
      groupId: target,
      question: body,
      ts: String(event?.ts || sentAt),
      eventId: String(event?.id || ""),
    };
    setText("");
    setAnswers([]);
    setExpanded(false);
    setNow(Date.now());
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
    <div className="grid gap-3.5" data-overview-ask-area>
      <h2
        className="px-1 pt-2 text-[19px] font-semibold text-[var(--color-text-primary)]"
        data-overview-ask-title
      >
        {t("overview.ask.title")}
      </h2>
      <div className="px-4 pb-3 pt-3.5" data-overview-ask>
        <textarea
          ref={inputRef}
          rows={3}
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
          className="block min-h-[88px] w-full resize-none bg-transparent px-1 text-[15px] leading-7 outline-none"
          data-overview-ask-input
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-tertiary)]">{t("overview.ask.to")}</span>
          <select
            value={groupId}
            onChange={(event) => chooseGroup(event.target.value)}
            aria-label={t("overview.ask.groupLabel")}
            className="max-w-[12rem] shrink-0 truncate rounded-full border px-2.5 py-1 text-xs"
            data-overview-ask-group
          >
            {groups.map((group) => (
              <option key={group.group_id} value={group.group_id}>
                {group.title || group.group_id}
              </option>
            ))}
          </select>
          <span className="ml-auto hidden text-[11.5px] text-[var(--color-text-tertiary)] sm:inline">
            {t("overview.ask.enterHint")}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={readOnly || sending || !text.trim()}
            onClick={() => void ask(text)}
            className="h-9 w-9 shrink-0 rounded-full p-0"
            aria-label={t("overview.send")}
            data-overview-ask-send
          >
            ↑
          </Button>
        </div>
        {failed ? (
          <p className="mt-2 text-xs text-[var(--color-accent-danger)]">
            {t("overview.sendFailed")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 px-1">
        {quick.map((question) => (
          <button
            key={question}
            type="button"
            disabled={readOnly || sending}
            onClick={() => void ask(question)}
            className="rounded-full border px-3 py-1 text-[12.5px]"
            data-overview-ask-chip
          >
            {question}
          </button>
        ))}
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
            <button
              type="button"
              className="shrink-0 px-1 text-[var(--color-text-tertiary)]"
              aria-label={t("overview.ask.close")}
              title={t("overview.ask.close")}
              onClick={() => {
                setAsked(null);
                setAnswers([]);
                try {
                  window.localStorage.removeItem(LAST_KEY);
                } catch {
                  // Nothing remembered to forget.
                }
              }}
              data-overview-answer-close
            >
              ✕
            </button>
          </header>
          {answered ? (
            <div
              className="relative overflow-hidden px-5 py-3"
              style={expanded ? undefined : { maxHeight: "16rem" }}
              data-overview-answer-body={expanded ? "expanded" : "folded"}
            >
              <div className="grid max-w-[46rem] gap-3">
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
              {expanded ? null : (
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
                  data-overview-answer-fade
                  aria-hidden="true"
                />
              )}
            </div>
          ) : noReply ? (
            <div className="px-5 py-4 text-[13px]" data-overview-answer-noreply>
              <p className="text-[var(--color-text-secondary)]">
                {t("overview.ask.noReply", { group: groupTitle(asked.groupId) })}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={readOnly || sending}
                  onClick={() => {
                    chooseGroup(asked.groupId);
                    void ask(asked.question, asked.groupId);
                  }}
                >
                  {t("overview.ask.resend")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenGroup(asked.groupId)}
                >
                  {t("overview.ask.check", { group: groupTitle(asked.groupId) })}
                </Button>
              </div>
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
            {answered ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setExpanded((value) => !value)}
                data-overview-answer-toggle
              >
                {expanded ? t("overview.ask.collapse") : t("overview.ask.expand")}
              </Button>
            ) : null}
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
