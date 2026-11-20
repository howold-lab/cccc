// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { GroupMeta, LedgerEvent, Task } from "../../types";
import { boardTask } from "./useTaskOverviewData";

const api = vi.hoisted(() => ({ pages: vi.fn(), tail: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
    i18n: { language: "en" },
  }),
}));
vi.mock("../../services/api/tasks", () => ({ fetchTaskPages: api.pages }));
vi.mock("../../services/api/messaging", () => ({ fetchLedgerTail: api.tail }));
vi.mock("../../services/api/actors", () => ({ fetchActors: vi.fn() }));
vi.mock("../../services/api/context", () => ({ fetchContext: vi.fn() }));
vi.mock("../../services/api/pendingReplies", () => ({
  fetchPendingReplySummary: vi.fn(),
  fetchPendingReplies: vi.fn(),
  answerPendingReply: vi.fn(),
}));

import { TaskOverviewPage } from "./TaskOverviewPage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const NOW = Date.parse("2026-11-20T06:00:00Z");
const hoursAgo = (hours: number, from = Date.now()) =>
  new Date(from - hours * 3_600_000).toISOString();
const task = (fields: Partial<Task>): Task => ({ id: "T1", title: "Task", ...fields });

it("places tasks in columns by their own facts", () => {
  expect(boardTask("g", task({ status: "planned" }), NOW)?.column).toBe("planned");
  expect(
    boardTask("g", task({ status: "active", updated_at: hoursAgo(1, NOW) }), NOW)?.column,
  ).toBe("active");
  const waiting = boardTask("g", task({ status: "active", waiting_on: "user" }), NOW)!;
  expect(waiting.column).toBe("stuck");
  expect(waiting.waitingOn).toBe("user");
  const blocked = boardTask("g", task({ status: "planned", open_blocked_by: ["T9"] }), NOW)!;
  expect(blocked.column).toBe("stuck");
  expect(blocked.blockedBy).toEqual(["T9"]);
});

it("marks an active task not updated for a day as possibly stale", () => {
  expect(
    boardTask("g", task({ status: "active", updated_at: hoursAgo(30, NOW) }), NOW)?.stale,
  ).toBe(true);
  expect(boardTask("g", task({ status: "active", updated_at: hoursAgo(2, NOW) }), NOW)?.stale).toBe(
    false,
  );
});

it("keeps done tasks for a week and counts checklist progress", () => {
  expect(boardTask("g", task({ status: "done", updated_at: hoursAgo(24, NOW) }), NOW)?.column).toBe(
    "done",
  );
  expect(
    boardTask("g", task({ status: "done", updated_at: hoursAgo(24 * 8, NOW) }), NOW),
  ).toBeNull();
  expect(boardTask("g", task({ status: "archived" }), NOW)).toBeNull();
  const progress = boardTask(
    "g",
    task({
      status: "active",
      checklist: [
        { id: "1", text: "a", status: "done" },
        { id: "2", text: "b", status: "pending" },
      ],
    }),
    NOW,
  )!;
  expect([progress.checklistDone, progress.checklistTotal]).toEqual([1, 2]);
});

let root: Root;
let host: HTMLDivElement;
const groups: GroupMeta[] = [
  { group_id: "kb", title: "Knowledge base", running: true },
  { group_id: "live", title: "Live", running: true },
];
const pagesFor: Record<string, Task[]> = {};

beforeEach(() => {
  pagesFor.kb = [
    task({
      id: "T1",
      title: "Price image",
      status: "active",
      waiting_on: "user",
      assignee: "maintainer",
    }),
    task({ id: "T2", title: "Import catalogue", status: "planned" }),
    task({ id: "T3", title: "Sub step", status: "planned", parent_id: "T2" }),
  ];
  pagesFor.live = [];
  api.pages.mockImplementation(async (groupId: string) => ({
    ok: true,
    result: { pages: { planned: { tasks: pagesFor[groupId] ?? [] } }, tasksVersion: "1" },
  }));
  api.tail.mockImplementation(async (groupId: string) => ({
    ok: true,
    result: {
      events:
        groupId === "live"
          ? [
              {
                id: "m",
                kind: "chat.message",
                by: "agent",
                ts: hoursAgo(1),
                data: { to: ["user"] },
              } as unknown as LedgerEvent,
            ]
          : [],
      has_more: false,
      count: 0,
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

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function render() {
  const onOpenGroup = vi.fn();
  act(() => root.render(<TaskOverviewPage groups={groups} onOpenGroup={onOpenGroup} />));
  await flush();
  await flush();
  return { onOpenGroup };
}

it("shows top-level tasks across Groups, with why a stuck one waits", async () => {
  const { onOpenGroup } = await render();

  const stuck = host.querySelector('[data-board-column="stuck"]')!;
  expect(stuck.textContent).toContain("Price image");
  expect(stuck.textContent).toContain("overview.tasks.waitingUser");
  expect(host.querySelector('[data-board-column="planned"]')!.textContent).toContain(
    "Import catalogue",
  );
  expect(host.textContent).not.toContain("Sub step");

  act(() => stuck.querySelector<HTMLButtonElement>("[data-board-task]")!.click());
  expect(onOpenGroup).toHaveBeenCalledWith("kb");
});

it("flags a Group that is active without any open task", async () => {
  await render();

  expect(host.querySelector("[data-board-notice]")!.textContent).toContain("Live");
});

it("filters to stuck tasks only", async () => {
  await render();

  const toggle = [...host.querySelectorAll<HTMLButtonElement>("[data-board-chip]")].find((chip) =>
    chip.textContent?.includes("overview.tasks.onlyStuck"),
  )!;
  act(() => toggle.click());

  expect(host.querySelectorAll("[data-board-column]")).toHaveLength(1);
  expect(host.querySelector('[data-board-column="stuck"]')).not.toBeNull();
});
