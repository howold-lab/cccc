import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { replyMessage } from "../../services/api/context";
import { useUnattendedStore } from "../../stores/useUnattendedStore";
import { newClientId } from "../../utils/clientId";
import type { ChetAct } from "./chetActs";
import { PERSONAL } from "./needsModel";
import { oneLine } from "./plainText";
import { useAge } from "./useAge";

const DAY_MS = 24 * 60 * 60 * 1000;
const SHOWN = 5;

function clock(ts: string, locale: string) {
  return new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** The instance-wide unattended switch, where the overview's status line can show it. */
export function UnattendedSwitch({ readOnly }: { readOnly: boolean }) {
  const { t, i18n } = useTranslation("layout");
  const unattended = useUnattendedStore((state) => state.unattended);
  const saving = useUnattendedStore((state) => state.saving);
  const error = useUnattendedStore((state) => state.error);
  useEffect(() => {
    void useUnattendedStore.getState().refresh();
  }, []);
  if (!unattended) return null;
  const on = unattended.enabled;
  return (
    <span className="ml-auto inline-flex items-center gap-2" data-unattended={on ? "on" : "off"}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={readOnly || saving}
        onClick={() => void useUnattendedStore.getState().setEnabled(!on)}
        title={t("overview.unattended.hint")}
        className="inline-flex items-center gap-2"
        data-unattended-switch
      >
        <span data-unattended-track aria-hidden="true">
          <span data-unattended-knob />
        </span>
        <span className="font-medium text-[var(--color-text-primary)]">
          {t("overview.unattended.label")}
        </span>
      </button>
      {on && unattended.since ? (
        <span>
          {t("overview.unattended.since", { time: clock(unattended.since, i18n.language) })}
        </span>
      ) : null}
      {error ? (
        <span className="text-[var(--color-accent-danger)]">{t("overview.unattended.failed")}</span>
      ) : null}
    </span>
  );
}

function ChangeIt({ act, readOnly }: { act: ChetAct; readOnly: boolean }) {
  const { t } = useTranslation("layout");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  if (readOnly) return null;
  if (state === "sent") return <span className="text-xs">{t("overview.unattended.changed")}</span>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs" data-chet-act-change>
        {t("overview.unattended.change")}
      </button>
    );
  const send = async () => {
    if (!text.trim()) return;
    setState("sending");
    // No recipients: a reply to Chet's answer goes to the member who asked.
    const response = await replyMessage(
      act.groupId,
      text.trim(),
      [],
      act.eventId,
      undefined,
      newClientId(),
    ).catch(() => null);
    setState(response?.ok ? "sent" : "failed");
  };
  return (
    <form
      className="mt-1.5 flex w-full gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("overview.unattended.changePlaceholder")}
        className="min-w-0 flex-1 rounded-lg border px-2.5 py-1 text-sm"
        data-chet-act-input
      />
      <button type="submit" disabled={state === "sending" || !text.trim()} data-need-action="take">
        {state === "sending" ? t("overview.sending") : t("overview.unattended.send")}
      </button>
      {state === "failed" ? (
        <span className="self-center text-xs text-[var(--color-accent-danger)]">
          {t("overview.answerFailed")}
        </span>
      ) : null}
    </form>
  );
}

/**
 * What Chet decided or said for the user: since unattended mode was turned on, or over the
 * last day when it is off. Each line can be changed by replying to Chet's message.
 */
export function DecidedForYou({
  acts,
  titles,
  readOnly,
  onOpenGroup,
}: {
  acts: ChetAct[];
  titles: Record<string, string>;
  readOnly: boolean;
  onOpenGroup: (groupId: string) => void;
}) {
  const { t, i18n } = useTranslation("layout");
  const age = useAge();
  const unattended = useUnattendedStore((state) => state.unattended);
  const [all, setAll] = useState(false);
  const from =
    unattended?.enabled && unattended.since
      ? new Date(unattended.since).getTime()
      : Date.now() - DAY_MS;
  const recent = acts
    .filter((act) => new Date(act.ts).getTime() >= from)
    .sort((a, b) => b.ts.localeCompare(a.ts));
  if (!recent.length) return null;
  const shown = all ? recent : recent.slice(0, SHOWN);
  return (
    <section className="min-w-0 overflow-hidden" data-overview-card data-decided-for-you>
      <header className="flex items-center gap-2 px-4 py-3" data-overview-card-head>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t("overview.unattended.decidedTitle")}
        </h2>
        <span className="ml-auto truncate text-xs text-[var(--color-text-tertiary)]">
          {t("overview.unattended.decidedAside", { count: recent.length })}
        </span>
      </header>
      <ul data-overview-list>
        {shown.map((act) => {
          const personal = act.kind === "answer" && PERSONAL.test(act.question);
          return (
            <li key={act.eventId} className="px-4 py-2.5" data-chet-act={act.kind}>
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0" data-chet-act-tag={act.kind}>
                  {act.kind === "answer"
                    ? t("overview.unattended.answered")
                    : t("overview.unattended.replied")}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenGroup(act.groupId)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-[var(--color-text-primary)]"
                  title={act.text}
                >
                  {act.kind === "answer" && act.choice
                    ? t("overview.unattended.chose", { choice: act.choice })
                    : oneLine(act.text)}
                </button>
                <span
                  className="shrink-0 text-xs text-[var(--color-text-tertiary)]"
                  title={age(act.ts)}
                >
                  {clock(act.ts, i18n.language)}
                </span>
                <ChangeIt act={act} readOnly={readOnly} />
              </div>
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
                <span className="truncate">
                  {titles[act.groupId] ?? act.groupId}
                  {act.asker ? ` · ${act.asker}` : ""}
                  {act.question ? ` · ${oneLine(act.question)}` : ""}
                </span>
                {personal ? (
                  <span className="shrink-0" data-need-tag="personal">
                    {t("overview.unattended.shouldBeYou")}
                  </span>
                ) : null}
              </p>
              {act.kind === "answer" && act.text ? (
                <p className="truncate text-xs text-[var(--color-text-secondary)]">
                  {oneLine(act.text)}
                </p>
              ) : null}
            </li>
          );
        })}
        {recent.length > SHOWN ? (
          <li>
            <button
              type="button"
              onClick={() => setAll((value) => !value)}
              className="w-full px-4 py-2 text-left text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            >
              {all
                ? t("overview.needs.fold")
                : t("overview.needs.more", { count: recent.length - SHOWN })}
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/** What Chet may decide while the switch is on, in four lines. */
export function UnattendedRules() {
  const { t } = useTranslation("layout");
  const unattended = useUnattendedStore((state) => state.unattended);
  if (!unattended?.enabled) return null;
  return (
    <section className="min-w-0 overflow-hidden" data-overview-card data-unattended-rules>
      <header className="flex items-center gap-2 px-4 py-3" data-overview-card-head>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t("overview.unattended.rulesTitle")}
        </h2>
      </header>
      <dl className="grid gap-1 px-4 pb-3 text-xs leading-5 text-[var(--color-text-secondary)]">
        {(["may", "leaves", "scope", "who"] as const).map((key) => (
          <div key={key} className="flex gap-1.5">
            <dt className="shrink-0 font-semibold text-[var(--color-text-primary)]">
              {t(`overview.unattended.rules.${key}Label`)}
            </dt>
            <dd>{t(`overview.unattended.rules.${key}`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
