import { useTranslation } from "react-i18next";
import { dayLabel } from "./days";

/** A centred date between the messages of two different days. */
export function DayDivider({ day }: { day: Date }) {
  const { t, i18n } = useTranslation("chat");
  const label = dayLabel(day, i18n.language, new Date(), {
    today: t("dayToday"),
    yesterday: t("dayYesterday"),
  });
  return (
    <div className="flex items-center gap-3 pb-3 pt-1 text-xs" data-day-divider role="separator">
      <span className="h-px flex-1" aria-hidden="true" />
      <span className="shrink-0">{label}</span>
      <span className="h-px flex-1" aria-hidden="true" />
    </div>
  );
}
