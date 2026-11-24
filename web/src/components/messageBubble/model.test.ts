import { describe, expect, it } from "vite-plus/test";

import {
  buildToLabel,
  computeObligationSummary,
  getSenderDisplayName,
  getSenderIdentity,
} from "./model";

function labelFor(recipients: string[] | undefined): string {
  return buildToLabel({
    hasDestination: false,
    dstGroupId: "",
    dstTo: [],
    groupLabelById: {},
    recipients,
    displayNameMap: new Map([["peer1", "Peer One"]]),
    userLabel: "You",
  });
}

describe("buildToLabel", () => {
  it("falls back to @foreman when recipients are empty", () => {
    expect(labelFor([])).toBe("@foreman");
  });

  it("falls back to @foreman when recipients are missing", () => {
    expect(labelFor(undefined)).toBe("@foreman");
  });

  it("keeps explicit @all recipients", () => {
    expect(labelFor(["@all"])).toBe("@all");
  });

  it("names the Group's user as the message head names them", () => {
    expect(labelFor(["user"])).toBe("You");
    expect(labelFor(["peer1", "user"])).toBe("Peer One, You");
    expect(labelFor(["@user"])).toBe("You");
  });

  it("leaves a user in another Group or instance unnamed as the reader", () => {
    const label = buildToLabel({
      hasDestination: true,
      dstGroupId: "g_remote",
      dstTo: ["user"],
      groupLabelById: {},
      recipients: ["user"],
      displayNameMap: new Map(),
      userLabel: "You",
    });
    expect(label).toBe("user");
  });
});

describe("getSenderDisplayName", () => {
  it("names a cross-group sender first and its Group after", () => {
    expect(
      getSenderDisplayName({
        senderId: "g_source::master",
        senderActor: null,
        groupLabelById: { g_source: "wechat-agent" },
        displayNameMap: new Map(),
      }),
    ).toBe("master · wechat-agent");
  });

  it("uses the sender snapshot title for the actor part", () => {
    expect(
      getSenderDisplayName({
        senderId: "g_source::master",
        senderActor: null,
        senderTitle: "主控",
        groupLabelById: { g_source: "wechat-agent" },
        displayNameMap: new Map(),
      }),
    ).toBe("主控 · wechat-agent");
  });

  it("keeps the author and the Group apart for the message head", () => {
    expect(
      getSenderIdentity({
        senderId: "g_source::user",
        senderActor: null,
        groupLabelById: { g_source: "直播-胖虎" },
        displayNameMap: new Map(),
        userLabel: "用户",
      }),
    ).toEqual({ name: "用户", groupId: "g_source", groupLabel: "直播-胖虎" });
  });

  it("keeps the canonical sender id when the group name is unavailable", () => {
    expect(
      getSenderDisplayName({
        senderId: "g_source::master",
        senderActor: null,
        groupLabelById: {},
        displayNameMap: new Map(),
      }),
    ).toBe("g_source::master");
  });
});

describe("computeObligationSummary", () => {
  const status = (replied: boolean, cancelled: boolean) => ({
    reply_requested: true,
    replied,
    cancelled,
    delivery_state: "",
  });

  it("counts replies and cancellations separately", () => {
    expect(
      computeObligationSummary({
        hideDirectUserObligationSummary: false,
        obligationStatus: {
          a: status(true, false),
          b: status(false, true),
          c: status(false, false),
        },
      }),
    ).toEqual({ replied: 1, cancelled: 1, total: 3 });
  });

  it("counts a recipient once when stale data reports both outcomes", () => {
    expect(
      computeObligationSummary({
        hideDirectUserObligationSummary: false,
        obligationStatus: { a: status(true, true) },
      }),
    ).toEqual({ replied: 0, cancelled: 1, total: 1 });
  });

  it("has no summary without a requested reply or for a direct user request", () => {
    expect(
      computeObligationSummary({
        hideDirectUserObligationSummary: false,
        obligationStatus: { a: { ...status(false, false), reply_requested: false } },
      }),
    ).toBeNull();
    expect(
      computeObligationSummary({
        hideDirectUserObligationSummary: true,
        obligationStatus: { user: status(false, true) },
      }),
    ).toBeNull();
  });
});
