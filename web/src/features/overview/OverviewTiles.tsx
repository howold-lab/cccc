import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ClaudeLimitWindow, ClaudeLimits } from "../../services/api/claudeUsage";
import { useUnattendedStore } from "../../stores/useUnattendedStore";
import { groupColor, groupInitial, groupShortName } from "./groupBadge";
import { oneLine } from "./plainText";
import { isStale, msUntilReset, quotaTone } from "./quotaModel";
import { useAge } from "./useAge";
import { agentTone, isBusy, sortAgents } from "./agentModel";
import type { OverviewAgent } from "./useOverviewData";

const AVATARS_SHOWN = 7;

function Tile({
  title,
  aside,
  name,
  children,
}: {
  title: string;
  aside?: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col px-[18px] py-4" data-overview-tile={name}>
      <header className="flex min-w-0 items-baseline gap-2 text-xs">
        <h2 className="shrink-0 font-medium" data-overview-tile-title>
          {title}
        </h2>
        {aside ? (
          <span className="ml-auto truncate" data-overview-tile-aside>
            {aside}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

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

function usedPct(window: ClaudeLimitWindow): number | null {
  return typeof window.used_pct === "number" ? Math.round(window.used_pct) : null;
}

function Ring({ radius, used, name }: { radius: number; used: number | null; name: string }) {
  const length = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, used ?? 0)) / 100) * length;
  return (
    <g data-quota-ring={name} data-tone={quotaTone(used)}>
      <circle cx="48" cy="48" r={radius} fill="none" strokeWidth="7" data-quota-ring-track />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${length}`}
        transform="rotate(-90 48 48)"
        data-quota-ring-fill
      />
    </g>
  );
}

/** The Claude quota as two rings: the 5-hour window outside, the 7-day window inside. */
export function QuotaTile({ limits }: { limits: ClaudeLimits | null }) {
  const { t } = useTranslation("layout");
  const age = useAge();
  const duration = useDuration();
  const account = limits?.accounts[0];
  const stale = account ? isStale(account.observed_at) : false;
  const row = (label: string, window: ClaudeLimitWindow, name: string) => {
    const used = usedPct(window);
    const left = msUntilReset(window);
    return (
      <div data-quota-window={name} data-tone={quotaTone(used)}>
        <p className="text-[12.5px]" data-quota-label>
          <i aria-hidden="true" data-quota-key />
          <b data-quota-used>{used === null ? "—" : `${used}%`}</b>
          {label}
        </p>
        <p className="text-[11.5px]" data-quota-reset>
          {left === null
            ? ""
            : left === 0
              ? t("overview.quota.reset")
              : t("overview.quota.resetsIn", { time: duration(left) })}
        </p>
      </div>
    );
  };
  return (
    <Tile
      name="quota"
      title={t("overview.quota.title")}
      aside={
        account
          ? stale
            ? t("overview.quota.stale", { age: age(account.observed_at) })
            : t("overview.quota.updated", { age: age(account.observed_at) })
          : undefined
      }
    >
      {!account ? (
        <p className="mt-3 text-[12.5px] leading-5" data-overview-tile-empty>
          {limits?.installed === false
            ? t("overview.quota.notInstalled")
            : t("overview.quota.waiting")}
        </p>
      ) : (
        <div
          className="mt-3 flex items-center gap-4"
          data-quota-account
          data-stale={stale ? "" : undefined}
          title={t("overview.quota.note")}
        >
          <svg width="88" height="88" viewBox="0 0 96 96" className="shrink-0" aria-hidden="true">
            <Ring radius={42} used={usedPct(account.five_hour)} name="five" />
            <Ring radius={31} used={usedPct(account.seven_day)} name="seven" />
            <text x="48" y="54" textAnchor="middle" data-quota-center>
              {usedPct(account.five_hour) === null ? "—" : `${usedPct(account.five_hour)}%`}
            </text>
          </svg>
          <div className="grid min-w-0 gap-2.5">
            {row(t("overview.tiles.fiveHour"), account.five_hour, "five")}
            {row(t("overview.tiles.sevenDay"), account.seven_day, "seven")}
          </div>
        </div>
      )}
    </Tile>
  );
}

/** Every agent as a round badge — busy ones lit, idle ones dimmed — and what the busiest does. */
export function AgentsTile({
  agents,
  titles,
  onOpenGroup,
}: {
  agents: OverviewAgent[];
  titles: Record<string, string>;
  onOpenGroup: (groupId: string) => void;
}) {
  const { t } = useTranslation("layout");
  const age = useAge();
  const sorted = sortAgents(agents);
  const busy = sorted.filter(isBusy);
  const shown = sorted.slice(0, AVATARS_SHOWN);
  const lead = busy[0];
  const leadTone = lead ? agentTone(lead) : null;
  const detail = lead ? lead.blockers[0] || lead.focus : "";
  return (
    <Tile
      name="agents"
      title={t("overview.tiles.agents")}
      aside={
        agents.length
          ? t("overview.tiles.agentsAside", {
              busy: busy.length,
              idle: agents.length - busy.length,
            })
          : undefined
      }
    >
      {agents.length === 0 ? (
        <p className="mt-3 text-[12.5px]" data-overview-tile-empty>
          {t("overview.loading")}
        </p>
      ) : (
        <>
          <div className="mt-3.5 flex items-center" data-overview-avatars>
            {shown.map((agent) => {
              const tone = agentTone(agent);
              const group = titles[agent.groupId] ?? agent.groupId;
              return (
                <button
                  key={`${agent.groupId}:${agent.actorId}`}
                  type="button"
                  onClick={() => onOpenGroup(agent.groupId)}
                  title={`${agent.title} · ${group} · ${t(`overview.state.${tone}`)}`}
                  aria-label={`${agent.title} · ${group} · ${t(`overview.state.${tone}`)}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                  style={{ backgroundColor: groupColor(agent.groupId) }}
                  data-overview-avatar={tone}
                >
                  {groupInitial(group)}
                </button>
              );
            })}
            {sorted.length > shown.length ? (
              <span className="ml-2 text-xs" data-overview-avatars-more>
                +{sorted.length - shown.length}
              </span>
            ) : null}
          </div>
          {lead && leadTone ? (
            <button
              type="button"
              onClick={() => onOpenGroup(lead.groupId)}
              className="mt-3.5 block min-w-0 text-left"
              data-overview-agent={leadTone}
            >
              <span className="line-clamp-2 text-[13px] leading-5" data-overview-agent-now>
                <i aria-hidden="true" data-overview-agent-dot />
                {groupShortName(titles[lead.groupId] ?? lead.groupId)} · {lead.title}
                {detail ? ` · ${oneLine(detail)}` : ""}
              </span>
              <span className="mt-0.5 block text-[11.5px]" data-overview-agent-meta>
                {t(`overview.state.${leadTone}`)}
                {lead.updatedAt
                  ? ` · ${t("overview.tiles.noted", { age: age(lead.updatedAt) })}`
                  : ""}
                {busy.length > 1
                  ? ` · ${t("overview.tiles.moreBusy", { count: busy.length - 1 })}`
                  : ""}
              </span>
            </button>
          ) : (
            <p className="mt-3.5 text-[13px]" data-overview-agent-none>
              {t("overview.tiles.noneBusy")}
            </p>
          )}
        </>
      )}
    </Tile>
  );
}

function clock(ts: string, locale: string) {
  return new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** The instance-wide unattended switch, with what on and off mean in one sentence. */
export function UnattendedTile({ readOnly }: { readOnly: boolean }) {
  const { t, i18n } = useTranslation("layout");
  const unattended = useUnattendedStore((state) => state.unattended);
  const saving = useUnattendedStore((state) => state.saving);
  const error = useUnattendedStore((state) => state.error);
  useEffect(() => {
    void useUnattendedStore.getState().refresh();
  }, []);
  const on = !!unattended?.enabled;
  return (
    <Tile name="unattended" title={t("overview.unattended.label")}>
      <div data-unattended={on ? "on" : "off"} className="mt-3.5">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("overview.unattended.label")}
          disabled={readOnly || saving || !unattended}
          onClick={() => void useUnattendedStore.getState().setEnabled(!on)}
          title={t("overview.unattended.hint")}
          data-unattended-switch
        >
          <span data-unattended-track aria-hidden="true">
            <span data-unattended-knob />
          </span>
        </button>
        <p className="mt-3 text-[13px] font-medium" data-unattended-state>
          {on ? t("overview.tiles.on") : t("overview.tiles.off")}
          {on && unattended?.since
            ? ` ${t("overview.unattended.since", { time: clock(unattended.since, i18n.language) })}`
            : ""}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-[1.55]" data-unattended-desc>
          {error
            ? t("overview.unattended.failed")
            : on
              ? t("overview.tiles.onDesc")
              : t("overview.tiles.offDesc")}
        </p>
      </div>
    </Tile>
  );
}
