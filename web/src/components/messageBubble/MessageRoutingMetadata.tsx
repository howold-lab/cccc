import { useTranslation } from "react-i18next";
import { destinationChipKey } from "../messageBubbleDelegation";
import { InboxIcon } from "../Icons";

export function MessageRoutingMetadata({
  toLabel,
  isMail,
  hasSource,
  sourceLabel,
  sourceTitle,
  isRemoteSource,
  srcGroupId,
  srcEventId,
  hasDestination,
  destinationLabel,
  dstTo,
  messageText,
  onOpenSource,
}: {
  toLabel: string;
  isMail: boolean;
  hasSource: boolean;
  sourceLabel: string;
  sourceTitle: string;
  isRemoteSource: boolean;
  srcGroupId: string;
  srcEventId: string;
  hasDestination: boolean;
  destinationLabel: string;
  dstTo: string[];
  messageText: string;
  onOpenSource?: (groupId: string, eventId: string) => void;
}) {
  const { t } = useTranslation("chat");
  const recipients = toLabel.trim();
  const routeClass =
    "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-xs text-[var(--color-text-secondary)]";
  const chipKey = hasDestination ? destinationChipKey(messageText) : "sentTo";
  const chipText = hasDestination
    ? t(chipKey, { label: destinationLabel, to: dstTo.join(", ") })
    : "";
  // A plain message to another Group names its recipients and their Group in one place,
  // the way an author is named: "→ name · Group". A delegation keeps its own chip, which
  // says the work was handed over.
  const destinationInRoute = hasDestination && chipKey === "sentTo" && !!destinationLabel;
  const showRecipients = !!recipients || destinationInRoute;
  return (
    <>
      {showRecipients && (
        <span
          className="min-w-0 max-w-[36ch] truncate text-[var(--color-text-tertiary)]"
          title={destinationInRoute ? chipText : recipients}
        >
          <span aria-hidden="true">→ </span>
          <span className="sr-only">{t("to")} </span>
          {recipients}
          {destinationInRoute ? (
            <span className="lcd-row-origin">
              {recipients ? " · " : ""}
              {destinationLabel}
            </span>
          ) : null}
        </span>
      )}
      {isMail && (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[var(--color-text-tertiary)]"
          title={t("mailMessageHint")}
          aria-label={t("mailMessageHint")}
        >
          <InboxIcon size={11} aria-hidden="true" />
          {t("modeMail")}
        </span>
      )}
      {hasSource && isRemoteSource && sourceLabel && (
        <span className={routeClass} title={sourceTitle}>
          {t("relayedFrom", { label: sourceLabel })}
        </span>
      )}
      {hasSource && !isRemoteSource && (
        <button
          type="button"
          className={`${routeClass} underline decoration-[var(--glass-border)] underline-offset-4 hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2`}
          disabled={!onOpenSource}
          onClick={() => onOpenSource?.(srcGroupId, srcEventId)}
          title={sourceTitle}
        >
          <span className="truncate">{t("relayedFrom", { label: sourceLabel })}</span>
        </button>
      )}
      {hasDestination && !destinationInRoute && (
        <span className={routeClass} title={chipText}>
          <span className="truncate">{chipText}</span>
        </span>
      )}
    </>
  );
}
