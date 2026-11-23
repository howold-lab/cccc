// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { GroupMeta, LedgerEvent } from "../../types";

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  pending: vi.fn(),
  answer: vi.fn(),
  actors: vi.fn(),
  context: vi.fn(),
  tail: vi.fn(),
  send: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
    i18n: { language: "en" },
  }),
}));
vi.mock("../../services/api/pendingReplies", () => ({
  fetchPendingReplySummary: api.summary,
  fetchPendingReplies: api.pending,
  answerPendingReply: api.answer,
}));
vi.mock("../../services/api/actors", () => ({ fetchActors: api.actors }));
vi.mock("../../services/api/context", () => ({ fetchContext: api.context, sendMessage: api.send }));
vi.mock("../../services/api/messaging", () => ({ fetchLedgerTail: api.tail }));

import { OverviewPage } from "./OverviewPage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;

const groups: GroupMeta[] = [
  { group_id: "kb", title: "Knowledge base", running: true },
  { group_id: "ops", title: "Operations", running: false },
];
const question: LedgerEvent = {
  id: "event-1",
  kind: "chat.message",
  by: "maintainer",
  ts: "2026-11-19T02:10:00Z",
  group_id: "kb",
  data: {
    text: "Where should the price go?",
    to: ["user"],
    message_mode: "request_reply",
    question: {
      v: 1,
      prompt: "Where should the price go?",
      options: [
        { id: "A", label: "Top left" },
        { id: "B", label: "Bottom bar" },
      ],
      recommended: { option_id: "A", reason: "Clearest" },
    },
  },
} as unknown as LedgerEvent;

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const chat = (id: string, by: string, ts: string, text: string, to: string[]): LedgerEvent =>
  ({ id, kind: "chat.message", by, ts, data: { text, to } }) as unknown as LedgerEvent;
let ledgers: Record<string, LedgerEvent[]> = {};

beforeEach(() => {
  ledgers = {
    kb: [
      chat("u1", "user", hoursAgo(5), "Please update the price page", ["maintainer"]),
      chat("r1", "maintainer", hoursAgo(4), "The price page is live", ["user"]),
    ],
    ops: [chat("u2", "user", hoursAgo(6), "Is the stream still recording?", ["watcher"])],
  };
  api.summary.mockResolvedValue({
    ok: true,
    result: { groups: [{ group_id: "kb", state: "fresh", pending: 1 }] },
  });
  api.pending.mockResolvedValue({
    ok: true,
    result: {
      events: [question],
      statuses: {
        "event-1": {
          user_request: { question: "valid", requester: "available" },
          obligation_status: { user: { reply_requested: true, replied: false, cancelled: false } },
        },
      },
      total: 1,
      has_more: false,
    },
  });
  api.answer.mockResolvedValue({ ok: true, result: { event: { id: "reply-1" } } });
  api.actors.mockImplementation(async (groupId: string) => ({
    ok: true,
    result: {
      actors:
        groupId === "kb"
          ? [
              {
                id: "maintainer",
                title: "Maintainer",
                running: true,
                effective_working_state: "working",
              },
            ]
          : [{ id: "watcher", running: false }],
    },
  }));
  api.context.mockImplementation(async (groupId: string) => ({
    ok: true,
    result: {
      agent_states:
        groupId === "kb"
          ? [{ id: "maintainer", hot: { focus: "Sorting 51 missed questions" } }]
          : [],
    },
  }));
  api.tail.mockImplementation(async (groupId: string) => ({
    ok: true,
    result: { events: ledgers[groupId] ?? [], has_more: false, count: 0 },
  }));
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

async function render(props: Partial<Parameters<typeof OverviewPage>[0]> = {}) {
  const onOpenGroup = vi.fn();
  const onOpenPending = vi.fn();
  act(() =>
    root.render(
      <OverviewPage
        groups={groups}
        readOnly={false}
        onOpenGroup={onOpenGroup}
        onOpenPending={onOpenPending}
        {...props}
      />,
    ),
  );
  await flush();
  await flush();
  return { onOpenGroup, onOpenPending };
}

it("lists questions waiting on the user in two lines, with every choice on demand", async () => {
  await render();

  const row = host.querySelector('[data-overview-need="question"]')!;
  expect(row.textContent).toContain("Where should the price go?");
  expect(row.textContent).toContain("Knowledge base");
  expect(row.querySelector("[data-need-rec]")!.textContent).toContain("Clearest");
  expect(row.querySelectorAll("[data-overview-option]")).toHaveLength(0);
  act(() => row.querySelector<HTMLButtonElement>("[data-need-toggle]")!.click());
  expect(row.querySelectorAll("[data-overview-option]")).toHaveLength(2);
  expect(api.pending).toHaveBeenCalledWith("kb", undefined, expect.anything());
  expect(api.pending).not.toHaveBeenCalledWith("ops", undefined, expect.anything());
});

it("takes the recommendation in one click and reads again", async () => {
  await render();

  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-need-action="take"]')!.click();
  });
  await flush();

  expect(api.answer).toHaveBeenCalledWith("kb", "event-1", expect.any(String), {
    v: 1,
    option_id: "A",
  });
  expect(api.summary.mock.calls.length).toBeGreaterThan(1);
});

it("answers another choice from the opened question", async () => {
  await render();

  act(() => host.querySelector<HTMLButtonElement>('[data-need-action="more"]')!.click());
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-overview-option="B"]')!.click();
  });
  await flush();

  expect(api.answer).toHaveBeenCalledWith("kb", "event-1", expect.any(String), {
    v: 1,
    option_id: "B",
  });
});

it("does not offer answers to a read-only viewer", async () => {
  await render({ readOnly: true });

  expect(host.querySelector("[data-need-action]")).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>("[data-need-toggle]")!.click());
  const option = host.querySelector<HTMLButtonElement>('[data-overview-option="A"]')!;
  expect(option.disabled).toBe(true);
});

it("shows what each agent is doing and opens its Group", async () => {
  const { onOpenGroup, onOpenPending } = await render();

  const working = host.querySelector<HTMLButtonElement>('[data-overview-agent="working"]')!;
  expect(working.textContent).toContain("Maintainer");
  expect(working.textContent).toContain("Sorting 51 missed questions");
  expect(host.querySelector('[data-overview-agent="stopped"]')).toBeNull();
  expect(host.querySelector("[data-overview-quiet-agents]")!.textContent).toContain("watcher");

  act(() => working.click());
  expect(onOpenGroup).toHaveBeenCalledWith("kb");

  act(() => host.querySelector<HTMLButtonElement>("[data-need-toggle]")!.click());
  const open = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith("overview.openInGroup"),
  )!;
  act(() => open.click());
  expect(onOpenPending).toHaveBeenCalledWith("kb");
});

it("lists each project with its latest reply to the user, those needing the user first", async () => {
  await render();

  const projects = [...host.querySelectorAll("[data-overview-project]")];
  expect(projects.map((row) => row.textContent?.includes("Knowledge base"))).toEqual([true, false]);
  expect(projects[0].textContent).toContain("The price page is live");
  expect(projects[0].getAttribute("data-overview-project")).toBe("working");
  expect(projects[1].getAttribute("data-overview-project")).toBe("stopped");
  expect(projects[1].textContent).toContain("overview.noReply");
});

it("flags a user message no agent has answered for two hours", async () => {
  await render();

  const rows = host.querySelectorAll('[data-overview-need="unanswered"]');
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain("Operations");
  expect(rows[0].textContent).toContain("Is the stream still recording?");
});

it("does not flag a user message that is still recent", async () => {
  ledgers.ops = [chat("u2", "user", hoursAgo(0.5), "Is the stream still recording?", ["watcher"])];
  await render();

  expect(host.querySelector('[data-overview-need="unanswered"]')).toBeNull();
});

it("sends a quick reply to a project without leaving the overview", async () => {
  api.send.mockResolvedValue({ ok: true, result: {} });
  await render();

  const row = [...host.querySelectorAll("[data-overview-project-row]")].find((item) =>
    item.textContent?.includes("Knowledge base"),
  )!;
  act(() => row.querySelector<HTMLButtonElement>("[data-overview-reply-toggle]")!.click());
  const box = row.querySelector<HTMLTextAreaElement>("textarea")!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(box, "Ship the price image today");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    row.querySelector<HTMLButtonElement>("[data-overview-send]")!.click();
  });
  await flush();

  expect(api.send).toHaveBeenCalledWith(
    "kb",
    "Ship the price image today",
    [],
    undefined,
    "send",
    expect.any(String),
  );
  expect(row.querySelector("textarea")).toBeNull();
  expect(row.textContent).toContain("overview.sent");
});

it("offers no quick reply to a read-only viewer", async () => {
  await render({ readOnly: true });

  expect(host.querySelector("[data-overview-reply-toggle]")).toBeNull();
});
