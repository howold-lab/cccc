import { answerPendingReply } from "../../services/api/pendingReplies";
import { newClientId } from "../../utils/clientId";
import type { OverviewPendingItem } from "./useOverviewData";

/** How many needs the overview shows before folding the rest. */
export const NEEDS_VISIBLE = 3;

// Decisions that stay with the user however clear the recommendation is: code going
// out, deleting, publishing, money, and signing in.
export const PERSONAL =
  /合并|合到|合进|快进|推送|push|merge|删除|删掉|清空|delete|remove|发布|上线|对外|publish|release|付款|支付|花钱|购买|充值|pay|purchase|登录|扫码|login|sign[\s-]?in|密钥|token|password|密码/i;

function questionText(item: OverviewPendingItem) {
  const question = item.question;
  return [
    question?.prompt ?? "",
    question?.context ?? "",
    item.text,
    ...(question?.options ?? []).map((option) => option.label),
  ].join(" ");
}

/** True when the question is one of the kinds only the user should decide. */
export function needsYouPersonally(item: OverviewPendingItem) {
  return PERSONAL.test(questionText(item));
}

/** The option the asker recommends, if it is one of the offered options. */
export function recommendedOption(item: OverviewPendingItem) {
  const question = item.question;
  const id = question?.recommended?.option_id;
  if (!id) return null;
  const option = question.options.find((candidate) => candidate.id === id);
  return option ? { option, reason: question.recommended?.reason ?? "" } : null;
}

/** One click can settle it: a recommendation exists and it is not a personal decision. */
export function canTakeRecommendation(item: OverviewPendingItem) {
  return !!recommendedOption(item) && !needsYouPersonally(item);
}

/** Quick ones first (one click clears them), then personal decisions, then the rest. */
export function sortNeeds(items: OverviewPendingItem[]) {
  const rank = (item: OverviewPendingItem) =>
    canTakeRecommendation(item) ? 0 : needsYouPersonally(item) ? 1 : 2;
  return [...items].sort((a, b) => rank(a) - rank(b) || a.ts.localeCompare(b.ts));
}

/** Answers a need with one of its options; true when the daemon accepted it. */
export async function answerNeed(item: OverviewPendingItem, optionId: string) {
  const response = await answerPendingReply(item.groupId, item.event.id ?? "", newClientId(), {
    v: 1,
    option_id: optionId,
  }).catch(() => null);
  return !!response?.ok;
}
