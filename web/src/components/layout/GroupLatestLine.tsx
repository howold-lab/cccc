import { oneLine } from "../../features/overview/plainText";
import { useAge } from "../../features/overview/useAge";
import { useGroupActivityStore } from "../../stores/useGroupActivityStore";

/** The Group's latest reply to the user, one quiet line under the name. */
export function GroupLatestLine({ groupId }: { groupId: string }) {
  const reply = useGroupActivityStore((state) => state.byGroup[groupId]?.lastReply);
  if (!reply) return null;
  const text = oneLine(reply.text);
  return (
    <span
      className="block min-w-0 truncate text-xs leading-4 text-[var(--color-text-tertiary)]"
      data-group-latest
      title={text}
    >
      {text}
    </span>
  );
}

/** How long ago the Group last moved, beside its name. */
export function GroupLatestAge({ groupId }: { groupId: string }) {
  const lastTs = useGroupActivityStore((state) => state.byGroup[groupId]?.lastTs);
  const age = useAge();
  if (!lastTs) return null;
  return (
    <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]" data-group-age>
      {age(lastTs)}
    </span>
  );
}
