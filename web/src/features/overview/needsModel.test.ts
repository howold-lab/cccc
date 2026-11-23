import { describe, expect, it } from "vitest";
import type { OverviewPendingItem } from "./useOverviewData";
import {
  canTakeRecommendation,
  needsYouPersonally,
  recommendedOption,
  sortNeeds,
} from "./needsModel";

function need(
  id: string,
  prompt: string,
  recommended: string | null,
  ts = "2026-11-23T10:00:00Z",
): OverviewPendingItem {
  return {
    groupId: "g",
    event: { id } as OverviewPendingItem["event"],
    sender: "agent",
    ts,
    text: prompt,
    question: {
      v: 1,
      prompt,
      options: [
        { id: "A", label: "是" },
        { id: "B", label: "否" },
      ],
      recommended: recommended ? { option_id: recommended, reason: "理由" } : null,
    },
  };
}

describe("needs model", () => {
  it("keeps code, deletion, publishing, money and sign-in with the user", () => {
    expect(needsYouPersonally(need("1", "把快手接口合到 develop？", "A"))).toBe(true);
    expect(needsYouPersonally(need("2", "删除旧的工作区？", "A"))).toBe(true);
    expect(needsYouPersonally(need("3", "旗舰店要扫码登录", null))).toBe(true);
    expect(needsYouPersonally(need("4", "19.9 月卡按哪条改？", "A"))).toBe(false);
  });

  it("offers one click only for a recommended, non-personal question", () => {
    expect(canTakeRecommendation(need("1", "按哪条改？", "A"))).toBe(true);
    expect(canTakeRecommendation(need("2", "按哪条改？", null))).toBe(false);
    expect(canTakeRecommendation(need("3", "要不要合并？", "A"))).toBe(false);
    expect(recommendedOption(need("4", "按哪条改？", "Z"))).toBeNull();
  });

  it("puts quick ones first, then personal ones, then the rest", () => {
    const sorted = sortNeeds([
      need("rest", "选哪个排版？", null),
      need("personal", "合到 main？", "A"),
      need("quick", "按哪条改？", "B"),
    ]);
    expect(sorted.map((item) => item.event.id)).toEqual(["quick", "personal", "rest"]);
  });
});
