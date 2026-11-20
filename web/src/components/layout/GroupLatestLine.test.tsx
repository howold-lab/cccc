// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useGroupActivityStore } from "../../stores/useGroupActivityStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

import { GroupLatestAge, GroupLatestLine } from "./GroupLatestLine";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useGroupActivityStore.getState().set({});
});

it("shows a Group's latest reply as plain text and its age", () => {
  const ts = new Date(Date.now() - 3 * 3_600_000).toISOString();
  useGroupActivityStore
    .getState()
    .set({
      kb: {
        groupId: "kb",
        lastTs: ts,
        lastReply: { by: "maintainer", ts, text: "- **Price** page is live" },
        unanswered: null,
      },
    });
  act(() =>
    root.render(
      <>
        <GroupLatestAge groupId="kb" />
        <GroupLatestLine groupId="kb" />
      </>,
    ),
  );

  expect(host.querySelector("[data-group-latest]")!.textContent).toBe("Price page is live");
  expect(host.querySelector("[data-group-age]")!.textContent).toContain("overview.age.hours");
});

it("shows nothing for a Group without a reply", () => {
  act(() => root.render(<GroupLatestLine groupId="none" />));

  expect(host.innerHTML).toBe("");
});
