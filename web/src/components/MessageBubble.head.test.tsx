import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { MessageBubble } from "./MessageBubble";
import type { LedgerEvent } from "../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.label ? `${key}: ${values.label}` : key,
  }),
}));

function render(event: LedgerEvent) {
  return renderToStaticMarkup(
    <MessageBubble
      event={event}
      actorById={new Map()}
      actors={[]}
      displayNameMap={new Map([["helper", "辉总小助"]])}
      agentState={null}
      taskById={new Map()}
      isDark={false}
      groupId="g_local"
      groupLabelById={{ g_live: "直播-胖虎", g_ops: "直播中控平台" }}
      onReply={() => undefined}
      onShowRecipients={() => undefined}
      onOpenSource={() => undefined}
    />,
  );
}

function head(markup: string): string {
  return markup.match(/<div class="lcd-row-head">([^]*?)<div class="lcd-row-body">/)?.[1] ?? "";
}

describe("message head", () => {
  it("names another Group's user once, with their Group as the way to the source", () => {
    const markup = head(
      render({
        id: "e1",
        kind: "chat.message",
        by: "g_live::user",
        data: {
          text: "新视频已交付",
          to: ["helper"],
          src_group_id: "g_live",
          src_event_id: "src-1",
        },
      }),
    );
    expect(markup).toContain('<span class="lcd-row-name">senderUser</span>');
    expect(markup).toMatch(/<button[^>]*class="lcd-row-origin"[^>]*>直播-胖虎<\/button>/);
    expect(markup).not.toContain("relayedFrom");
    expect(markup).not.toContain("::");
  });

  it("keeps the From chip when a member relays a message from another Group", () => {
    const markup = head(
      render({
        id: "e2",
        kind: "chat.message",
        by: "helper",
        data: { text: "转一下", to: ["user"], src_group_id: "g_live", src_event_id: "src-2" },
      }),
    );
    expect(markup).toContain("relayedFrom: 直播-胖虎");
    expect(markup).not.toContain("lcd-row-origin");
  });

  it("names the recipients of your message to another Group once, with their Group", () => {
    const markup = head(
      render({
        id: "e3",
        kind: "chat.message",
        by: "user",
        data: {
          text: "今晚用这个版本",
          to: ["user"],
          dst_group_id: "g_ops",
          dst_to: ["secretary"],
        },
      }),
    );
    expect(markup).toContain('class="lcd-row-name sr-only"');
    expect(markup).toContain('secretary<span class="lcd-row-origin"> · 直播中控平台</span>');
    // The full wording stays in the tip; no chip repeats it on the line.
    expect(markup).not.toMatch(/>sentTo/);
    expect(markup.match(/→ /g)).toHaveLength(1);
  });
});
