import { useState } from "react";
import { useTranslation } from "react-i18next";
import { oneLine } from "./plainText";
import {
  answerNeed,
  canTakeRecommendation,
  needsYouPersonally,
  recommendedOption,
} from "./needsModel";
import type { OverviewPendingItem } from "./useOverviewData";

/**
 * One decision in two lines: what is asked, and what the asker recommends and why. The
 * full wording and every option open on demand, so the list stays quick to read.
 */
export function NeedRow({
  item,
  groupTitle,
  when,
  readOnly,
  onOpen,
  onAnswered,
}: {
  item: OverviewPendingItem;
  groupTitle: string;
  when: string;
  readOnly: boolean;
  onOpen: () => void;
  onAnswered: () => void;
}) {
  const { t } = useTranslation("layout");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState(false);
  const question = item.question;
  const options = question?.options ?? [];
  const prompt = question?.prompt || item.text;
  const recommended = recommendedOption(item);
  const personal = needsYouPersonally(item);
  const quick = canTakeRecommendation(item);

  const answer = async (optionId: string) => {
    setBusy(optionId);
    setFailed(false);
    const ok = await answerNeed(item, optionId);
    setBusy("");
    if (ok) onAnswered();
    else setFailed(true);
  };

  return (
    <li
      className="px-4 py-2.5"
      data-overview-need="question"
      data-need-personal={personal || undefined}
    >
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
          data-need-toggle
        >
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
            <span className="truncate">
              <span className="font-medium text-[var(--color-text-primary)]">{groupTitle}</span> ·{" "}
              {item.sender} · {when}
            </span>
            {personal ? (
              <span className="shrink-0" data-need-tag="personal">
                {t("overview.needs.personal")}
              </span>
            ) : null}
          </p>
          <p
            className={
              open
                ? "mt-0.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[var(--color-text-primary)]"
                : "mt-0.5 truncate text-sm font-medium leading-6 text-[var(--color-text-primary)]"
            }
          >
            {open ? prompt : oneLine(prompt)}
          </p>
          {recommended ? (
            <p
              className="truncate text-xs leading-5 text-[var(--color-text-secondary)]"
              data-need-rec
            >
              {t("overview.needs.recommend")}{" "}
              <b>
                {recommended.option.id}：{recommended.option.label}
              </b>
              {recommended.reason ? ` · ${oneLine(recommended.reason)}` : ""}
            </p>
          ) : null}
        </button>
        {!readOnly ? (
          <div className="flex shrink-0 items-center gap-1.5 pt-3">
            {quick && recommended ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void answer(recommended.option.id)}
                data-need-action="take"
              >
                {busy ? t("overview.sending") : t("overview.needs.take")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              data-need-action="more"
            >
              {quick ? t("overview.needs.other") : t("overview.needs.choose")}
            </button>
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 grid gap-2">
          {options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={readOnly || !!busy}
                  onClick={() => void answer(option.id)}
                  title={option.consequence || undefined}
                  className="max-w-full rounded-lg border px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  data-overview-option={option.id}
                  data-recommended={recommended?.option.id === option.id ? "" : undefined}
                >
                  {option.id}. {option.label}
                  {busy === option.id ? (
                    <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                      {t("overview.sending")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="w-fit text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            {t("overview.openInGroup")} →
          </button>
        </div>
      ) : null}
      {failed ? (
        <p className="mt-1 text-xs text-[var(--color-accent-danger)]">
          {t("overview.answerFailed")}
        </p>
      ) : null}
    </li>
  );
}
