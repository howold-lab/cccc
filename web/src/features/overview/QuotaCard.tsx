import { useTranslation } from "react-i18next";
import type {
  ClaudeLimitAccount,
  ClaudeLimitWindow,
  ClaudeLimits,
} from "../../services/api/claudeUsage";
import { isStale, msUntilReset, quotaTone, remainingPct } from "./quotaModel";
import { useAge } from "./useAge";

function useDuration() {
  const { t } = useTranslation("layout");
  return (ms: number) => {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (minutes < 60) return t("overview.quota.minutes", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("overview.quota.hoursMinutes", { hours, minutes: minutes % 60 });
    return t("overview.quota.daysHours", { days: Math.floor(hours / 24), hours: hours % 24 });
  };
}

function WindowBar({ label, window }: { label: string; window: ClaudeLimitWindow }) {
  const { t } = useTranslation("layout");
  const duration = useDuration();
  const used = typeof window.used_pct === "number" ? Math.round(window.used_pct) : null;
  const left = msUntilReset(window);
  return (
    <div className="mt-2.5" data-quota-window data-tone={quotaTone(used)}>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
        <span>
          {label} · {t("overview.quota.used")}{" "}
          <b className="font-semibold text-[var(--color-text-primary)]">
            {used === null ? "—" : `${used}%`}
          </b>
        </span>
        <span className="shrink-0 text-[var(--color-text-tertiary)]">
          {left === null
            ? ""
            : left === 0
              ? t("overview.quota.reset")
              : t("overview.quota.resetsIn", { time: duration(left) })}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" data-quota-track>
        <span className="block h-full rounded-full" style={{ width: `${used ?? 0}%` }} />
      </div>
    </div>
  );
}

function AccountBlock({ account, single }: { account: ClaudeLimitAccount; single: boolean }) {
  const { t } = useTranslation("layout");
  const age = useAge();
  const stale = isStale(account.observed_at);
  return (
    <div className="px-4 py-3" data-quota-account data-stale={stale ? "" : undefined}>
      <div className="flex items-baseline gap-2 text-[13px]">
        {single ? null : (
          <span className="font-medium text-[var(--color-text-primary)]">
            {account.display_name || account.email || account.directory}
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
          {stale
            ? t("overview.quota.stale", { age: age(account.observed_at) })
            : t("overview.quota.updated", { age: age(account.observed_at) })}
        </span>
      </div>
      <WindowBar label={t("overview.quota.fiveHour")} window={account.five_hour} />
      <WindowBar label={t("overview.quota.sevenDay")} window={account.seven_day} />
    </div>
  );
}

/** The overview's Claude quota card: each account's 5-hour and 7-day windows. */
export function QuotaCard({ limits }: { limits: ClaudeLimits | null }) {
  const { t } = useTranslation("layout");
  if (!limits) return null;
  const accounts = limits.accounts;
  return (
    <section className="min-w-0 overflow-hidden" data-overview-card data-quota-card>
      <header className="flex items-center gap-2 px-4 py-3" data-overview-card-head>
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t("overview.quota.title")}
        </h2>
        <span className="ml-auto truncate text-xs text-[var(--color-text-tertiary)]">
          {t("overview.quota.source")}
        </span>
      </header>
      {accounts.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-[var(--color-text-tertiary)]">
          {limits.installed ? t("overview.quota.waiting") : t("overview.quota.notInstalled")}
        </p>
      ) : (
        <div data-overview-list>
          {accounts.map((account) => (
            <AccountBlock
              key={account.directory}
              account={account}
              single={accounts.length === 1}
            />
          ))}
          <p className="px-4 pb-3 text-[11.5px] text-[var(--color-text-tertiary)]">
            {t("overview.quota.note")}
          </p>
        </div>
      )}
    </section>
  );
}

/** "Claude quota · 5h 38% left · 7d 12% left" for the overview's status line. */
export function QuotaChip({ limits }: { limits: ClaudeLimits | null }) {
  const { t } = useTranslation("layout");
  const account = limits?.accounts[0];
  if (!account || isStale(account.observed_at)) return null;
  const five = remainingPct(account.five_hour);
  const seven = remainingPct(account.seven_day);
  if (five === null && seven === null) return null;
  const tone = (left: number | null) => quotaTone(left === null ? null : 100 - left);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5"
      data-quota-chip
    >
      {t("overview.quota.chip")}
      {five === null ? null : (
        <>
          {" · 5h "}
          <b data-tone={tone(five)}>{t("overview.quota.left", { pct: five })}</b>
        </>
      )}
      {seven === null ? null : (
        <>
          {" · 7d "}
          <b data-tone={tone(seven)}>{t("overview.quota.left", { pct: seven })}</b>
        </>
      )}
    </span>
  );
}
