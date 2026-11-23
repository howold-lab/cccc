import { useState } from "react";
import { useTranslation } from "react-i18next";
import { sendMessage } from "../../services/api/context";
import { newClientId } from "../../utils/clientId";
import type { TaskGap } from "./taskGapModel";
import { useAge } from "./useAge";

function NudgeButton({ groupId, readOnly }: { groupId: string; readOnly: boolean }) {
  const { t } = useTranslation("layout");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  if (readOnly) return null;
  const nudge = async () => {
    setState("sending");
    // No recipients: the Group's default recipient policy applies, as in the composer.
    const response = await sendMessage(
      groupId,
      t("overview.tasks.nudgeText"),
      [],
      undefined,
      "send",
      newClientId(),
    ).catch(() => null);
    setState(response?.ok ? "sent" : "failed");
  };
  return (
    <button
      type="button"
      disabled={state === "sending" || state === "sent"}
      onClick={() => void nudge()}
      data-need-action={state === "sent" ? undefined : "more"}
      data-board-nudge={state}
      className="shrink-0"
    >
      {t(`overview.tasks.nudge.${state}`)}
    </button>
  );
}

/** Groups whose tasks trail their chat, each with a one-click ask to bring them up to date. */
export function TaskGapList({
  gaps,
  titles,
  readOnly,
}: {
  gaps: TaskGap[];
  titles: Record<string, string>;
  readOnly: boolean;
}) {
  const { t } = useTranslation("layout");
  const age = useAge();
  if (!gaps.length) return null;
  return (
    <section className="rounded-xl px-4 py-2.5" data-board-notice>
      <p className="text-[13px] font-medium">{t("overview.tasks.gapsTitle")}</p>
      <ul className="mt-1 grid gap-1">
        {gaps.map((gap) => (
          <li
            key={gap.groupId}
            className="flex min-w-0 items-center gap-3 text-[13px]"
            data-board-gap={gap.reason}
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{titles[gap.groupId] ?? gap.groupId}</span>
              {" · "}
              {gap.reason === "noTasks"
                ? t("overview.tasks.gapNoTasks", { chat: age(gap.lastChatTs) })
                : t("overview.tasks.gapBehind", {
                    task: gap.lastTaskTs ? age(gap.lastTaskTs) : "—",
                    chat: age(gap.lastChatTs),
                  })}
            </span>
            <NudgeButton groupId={gap.groupId} readOnly={readOnly} />
          </li>
        ))}
      </ul>
    </section>
  );
}
