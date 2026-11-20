import { useTranslation } from "react-i18next";

/** "just now", "5 min ago", "3 h ago" or "2 d ago" for a timestamp, empty when it is not one. */
export function useAge() {
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
