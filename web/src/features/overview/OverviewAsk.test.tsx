// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { GroupMeta, LedgerEvent } from "../../types";
import { answersTo } from "./askModel";

const api = vi.hoisted(() => ({ send: vi.fn(), tail: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));
vi.mock("../../services/api/context", () => ({ sendMessage: api.send }));
vi.mock("../../services/api/messaging", () => ({ fetchLedgerTail: api.tail }));
vi.mock("../../components/LazyMarkdownRenderer", () => ({
  LazyMarkdownRenderer: ({ content }: { content: string }) => <div data-md>{content}</div>,
}));

import { OverviewAsk } from "./OverviewAsk";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const chat = (
  id: string,
  by: string,
  ts: string,
  text: string,
  data: Record<string, unknown> = {},
) =>
  ({
    id,
    kind: "chat.message",
    by,
    ts,
    data: { text, to: ["user"], ...data },
  }) as unknown as LedgerEvent;

it("prefers the agent's replies that quote the question", () => {
  const asked = { groupId: "g", question: "q", ts: "2026-11-20T10:00:00Z", eventId: "q1" };
  const events = [
    chat("q1", "user", "2026-11-20T10:00:00Z", "q"),
    chat("a1", "claude-1", "2026-11-20T10:01:00Z", "answer"),
    chat("r", "claude-1", "2026-11-20T10:02:00Z", "linked", { reply_to: "q1", to: ["user"] }),
  ];
  expect(answersTo(asked, events).map((event) => event.id)).toEqual(["r"]);
});

it("otherwise takes messages to the user after the question, until the user speaks again", () => {
  const asked = { groupId: "g", question: "q", ts: "2026-11-20T10:00:00Z", eventId: "q1" };
  const events = [
    chat("old", "claude-1", "2026-11-20T09:00:00Z", "earlier"),
    chat("q1", "user", "2026-11-20T10:00:00Z", "q"),
    chat("a1", "claude-1", "2026-11-20T10:01:00Z", "answer"),
    chat("u2", "user", "2026-11-20T10:05:00Z", "something else"),
    chat("a2", "claude-1", "2026-11-20T10:06:00Z", "about something else"),
  ];
  expect(answersTo(asked, events).map((event) => event.id)).toEqual(["a1"]);
});

let root: Root;
let host: HTMLDivElement;
const groups: GroupMeta[] = [
  { group_id: "kb", title: "Knowledge base" },
  { group_id: "ops", title: "调度层" },
];

beforeEach(() => {
  window.localStorage.clear();
  api.send.mockResolvedValue({
    ok: true,
    result: { event: { id: "q1", ts: "2026-11-20T10:00:00Z" } },
  });
  api.tail.mockResolvedValue({
    ok: true,
    result: {
      events: [chat("a1", "claude-1", "2026-11-20T10:01:00Z", "Two things need you")],
      has_more: false,
      count: 1,
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function render(readOnly = false) {
  act(() =>
    root.render(
      <OverviewAsk
        groups={groups}
        readOnly={readOnly}
        isDark={false}
        onOpenGroup={vi.fn()}
        onOpenTasks={vi.fn()}
      />,
    ),
  );
}

it("asks the 调度层 Group by default and shows its agent's answer", async () => {
  render();
  expect(
    host
      .querySelector("[data-overview-ask-group][data-selected]")!
      .getAttribute("data-overview-ask-group"),
  ).toBe("ops");

  await act(async () => {
    host.querySelector<HTMLButtonElement>("[data-overview-ask-chip]")!.click();
  });
  await flush();
  await flush();

  expect(api.send).toHaveBeenCalledWith(
    "ops",
    "overview.ask.quickConfirm",
    [],
    undefined,
    "send",
    expect.any(String),
  );
  expect(host.querySelector('[data-overview-answer="answered"]')!.textContent).toContain(
    "Two things need you",
  );
});

it("cannot ask from a read-only view", () => {
  render(true);

  expect(host.querySelector<HTMLButtonElement>("[data-overview-ask-chip]")!.disabled).toBe(true);
});

it("says the question may not have arrived when no reply comes in two minutes", async () => {
  window.localStorage.setItem(
    "cccc-overview-ask-last",
    JSON.stringify({
      groupId: "ops",
      question: "Anything for me?",
      ts: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      eventId: "q9",
    }),
  );
  api.tail.mockResolvedValue({ ok: true, result: { events: [], has_more: false, count: 0 } });
  render();
  await flush();

  expect(host.querySelector("[data-overview-answer-noreply]")).not.toBeNull();
});

it("forgets the answer when it is closed", async () => {
  render();
  await act(async () => {
    host.querySelector<HTMLButtonElement>("[data-overview-ask-chip]")!.click();
  });
  await flush();

  act(() => host.querySelector<HTMLButtonElement>("[data-overview-answer-close]")!.click());
  expect(host.querySelector("[data-overview-answer]")).toBeNull();
  expect(window.localStorage.getItem("cccc-overview-ask-last")).toBeNull();
});
