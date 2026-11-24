import type { Actor, LedgerEvent } from "../../types";
import { getRecipientDisplayName } from "../../hooks/useActorDisplayName";

export function buildToLabel({
  hasDestination,
  dstTo,
  recipients,
  displayNameMap,
  userLabel,
}: {
  hasDestination: boolean;
  dstGroupId: string;
  dstTo: string[];
  groupLabelById: Record<string, string>;
  recipients: string[] | undefined;
  displayNameMap: Map<string, string>;
  /** The Group's user, named as the message head names them as an author. */
  userLabel: string;
}): string {
  if (hasDestination) {
    if (!dstTo || dstTo.length === 0) return "";
    return dstTo.map((recipient) => getRecipientDisplayName(recipient, displayNameMap)).join(", ");
  }
  if (!recipients || recipients.length === 0) return "@foreman";
  // `@user` names the user too, as elsewhere in the Web; the daemon itself stores `user`.
  return recipients
    .map((recipient) =>
      recipient === "user" || recipient === "@user"
        ? userLabel
        : getRecipientDisplayName(recipient, displayNameMap),
    )
    .join(", ");
}

type SenderLabelInput = {
  senderId: string;
  senderActor: Actor | null;
  senderTitle?: string;
  remoteSourceName?: string;
  groupLabelById?: Record<string, string>;
  displayNameMap: Map<string, string>;
  /** How another Group's user is named; their ID alone is `user`. */
  userLabel?: string;
};

/**
 * Who wrote a message, as the head shows it: the author's own name, and apart from it
 * the Group they wrote in when that is another Group of this instance. A cross-group
 * sender ID reads `<group id>::<actor id>`; neither half is meant for people.
 */
export function getSenderIdentity({
  senderId,
  senderActor,
  senderTitle,
  remoteSourceName,
  groupLabelById = {},
  displayNameMap,
  userLabel,
}: SenderLabelInput): { name: string; groupId: string; groupLabel: string } {
  const none = { groupId: "", groupLabel: "" };
  if (!senderId || senderId === "user") return { name: senderId, ...none };
  const sourceName = String(remoteSourceName || "").trim();
  if ((senderId.startsWith("group_bridge:") || senderId.startsWith("connect:")) && sourceName)
    return { name: sourceName, ...none };
  const [senderGroupId, senderActorId] = senderId.split("::", 2);
  const senderGroupLabel = String(groupLabelById[senderGroupId] || "").trim();
  if (senderGroupLabel && senderActorId) {
    const senderActorLabel =
      String(senderTitle || "").trim() ||
      String(senderActor?.title || "").trim() ||
      (senderActorId === "user" && userLabel ? userLabel : senderActorId);
    return { name: senderActorLabel, groupId: senderGroupId, groupLabel: senderGroupLabel };
  }
  return {
    name:
      String(senderTitle || "").trim() ||
      String(senderActor?.title || "").trim() ||
      displayNameMap.get(senderId) ||
      senderId,
    ...none,
  };
}

/** The author in one line, for tips and notices: their name, then their Group. */
export function getSenderDisplayName(input: SenderLabelInput): string {
  const { name, groupLabel } = getSenderIdentity(input);
  return groupLabel ? `${name} · ${groupLabel}` : name;
}

export function buildVisibleReadStatusEntries(
  actors: Actor[],
  readStatus: LedgerEvent["_read_status"],
): [string, boolean][] {
  if (!readStatus) return [];
  return actors
    .map((actor) => String(actor.id || ""))
    .filter((id) => id && Object.prototype.hasOwnProperty.call(readStatus, id))
    .map((id) => [id, !!readStatus[id]] as [string, boolean]);
}

export function computeObligationSummary({
  hideDirectUserObligationSummary,
  obligationStatus,
}: {
  hideDirectUserObligationSummary: boolean;
  obligationStatus: LedgerEvent["_obligation_status"];
}): { replied: number; cancelled: number; total: number } | null {
  if (hideDirectUserObligationSummary) return null;
  if (!obligationStatus || typeof obligationStatus !== "object") return null;
  const ids = Object.keys(obligationStatus).filter((id) => obligationStatus[id]?.reply_requested);
  if (ids.length === 0) return null;
  let replied = 0;
  let cancelled = 0;
  for (const id of ids) {
    // The daemon never reports both; if stale data does, count the recipient
    // once and let cancellation win, as the recipients dialog does.
    if (obligationStatus[id]?.cancelled) cancelled += 1;
    else if (obligationStatus[id]?.replied) replied += 1;
  }
  return { replied, cancelled, total: ids.length };
}
