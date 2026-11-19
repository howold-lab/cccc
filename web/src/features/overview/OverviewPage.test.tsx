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
vi.mock("../../services/api/context", () => ({ fetchContext: api.context }));

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

beforeEach(() => {
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
          ? [{ id: "maintainer", title: "Maintainer", running: true, effective_working_state: "working" }]
          : [{ id: "watcher", running: false }],
    },
  }));
  api.context.mockImplementation(async (groupId: string) => ({
    ok: true,
    result: {
      agent_states:
        groupId === "kb" ? [{ id: "maintainer", hot: { focus: "Sorting 51 missed questions" } }] : [],
    },
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

const flush = () => act(async () => {
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

it("lists questions waiting on the user across Groups with their choices", async () => {
  await render();

  const row = host.querySelector("[data-overview-pending]")!;
  expect(row.textContent).toContain("Where should the price go?");
  expect(row.textContent).toContain("Knowledge base");
  expect(row.querySelectorAll("[data-overview-option]")).toHaveLength(2);
  expect(row.textContent).toContain("overview.recommended");
  expect(api.pending).toHaveBeenCalledWith("kb", undefined, expect.anything());
  expect(api.pending).not.toHaveBeenCalledWith("ops", undefined, expect.anything());
});

it("answers a choice in place and reads again", async () => {
  await render();

  await act(async () => {
    host.querySelector<HTMLButtonElement>('[data-overview-option="A"]')!.click();
  });
  await flush();

  expect(api.answer).toHaveBeenCalledWith("kb", "event-1", expect.any(String), {
    v: 1,
    option_id: "A",
  });
  expect(api.summary.mock.calls.length).toBeGreaterThan(1);
});

it("does not offer answers to a read-only viewer", async () => {
  await render({ readOnly: true });

  const option = host.querySelector<HTMLButtonElement>('[data-overview-option="A"]')!;
  expect(option.disabled).toBe(true);
});

it("shows what each agent is doing and opens its Group", async () => {
  const { onOpenGroup, onOpenPending } = await render();

  const working = host.querySelector('[data-overview-agent="working"]')!;
  expect(working.textContent).toContain("Maintainer");
  expect(working.textContent).toContain("Sorting 51 missed questions");
  expect(host.querySelector('[data-overview-agent="stopped"]')!.textContent).toContain("watcher");

  act(() => host.querySelector<HTMLButtonElement>('[data-overview-group="kb"] button')!.click());
  expect(onOpenGroup).toHaveBeenCalledWith("kb");

  const open = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "overview.openInGroup",
  )!;
  act(() => open.click());
  expect(onOpenPending).toHaveBeenCalledWith("kb");
});
