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

it("keeps the overview to the ask box, with one line while something waits", async () => {
  const { onOpenPending } = await render();

  expect(host.querySelector("[data-overview-project]")).toBeNull();
  expect(host.querySelector("[data-overview-strip]")).toBeNull();
  expect(host.querySelector('[data-overview-need="question"]')).toBeNull();
  const hint = host.querySelector<HTMLButtonElement>("[data-overview-needs-hint]")!;
  expect(hint.textContent).toContain("overview.needsHint");
  expect(api.pending).toHaveBeenCalledWith("kb", undefined, expect.anything());
  expect(api.pending).not.toHaveBeenCalledWith("ops", undefined, expect.anything());

  act(() => hint.click());
  expect(onOpenPending).toHaveBeenCalledWith("kb");
});

it("shows nothing to act on when nothing waits", async () => {
  api.summary.mockResolvedValue({ ok: true, result: { groups: [] } });
  ledgers.ops = [chat("u2", "user", hoursAgo(0.5), "Is the stream still recording?", ["watcher"])];
  await render();

  expect(host.querySelector("[data-overview-needs-hint]")).toBeNull();
});

it("counts a user message no agent has answered for two hours as waiting", async () => {
  api.summary.mockResolvedValue({ ok: true, result: { groups: [] } });
  const { onOpenPending } = await render();

  const hint = host.querySelector<HTMLButtonElement>("[data-overview-needs-hint]")!;
  act(() => hint.click());
  expect(onOpenPending).toHaveBeenCalledWith("ops");
});

it("shows what each agent is doing and opens its Group", async () => {
  const { onOpenGroup } = await render();

  const working = host.querySelector<HTMLButtonElement>('[data-overview-agent="working"]')!;
  expect(working.textContent).toContain("Maintainer");
  expect(working.textContent).toContain("Sorting 51 missed questions");
  expect(host.querySelector('[data-overview-agent="stopped"]')).toBeNull();
  expect(host.querySelector("[data-overview-quiet-agents]")!.textContent).toContain("watcher");

  act(() => working.click());
  expect(onOpenGroup).toHaveBeenCalledWith("kb");
});
