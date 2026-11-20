// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useQuickJumpStore } from "../../stores/useQuickJumpStore";
import type { GroupMeta } from "../../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import { QuickJump } from "./QuickJump";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
if (!("ResizeObserver" in globalThis)) {
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}
Element.prototype.scrollIntoView ||= () => {};

let root: Root;
let host: HTMLDivElement;
const groups: GroupMeta[] = [
  { group_id: "kb", title: "Knowledge base" },
  { group_id: "live", title: "Live monitor" },
];

beforeEach(() => {
  useQuickJumpStore.getState().setOpen(false);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(enabled = true) {
  const onOpenGroup = vi.fn();
  const onOpenOverview = vi.fn();
  act(() =>
    root.render(
      <QuickJump
        groups={groups}
        enabled={enabled}
        onOpenGroup={onOpenGroup}
        onOpenOverview={onOpenOverview}
      />,
    ),
  );
  return { onOpenGroup, onOpenOverview };
}

const pressCmdK = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  });

it("opens on ⌘K and jumps to the chosen Group", () => {
  const { onOpenGroup } = render();

  pressCmdK();
  const item = document.querySelector<HTMLElement>('[data-quick-jump-group="live"]')!;
  expect(item).not.toBeNull();
  act(() => item.click());

  expect(onOpenGroup).toHaveBeenCalledWith("live");
  expect(useQuickJumpStore.getState().open).toBe(false);
});

it("stays off where it is not available", () => {
  render(false);

  pressCmdK();
  expect(useQuickJumpStore.getState().open).toBe(false);
  expect(document.querySelector("[data-quick-jump]")).toBeNull();
});
