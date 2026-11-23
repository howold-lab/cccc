// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { CenteredMediaViewer } from "./CenteredMediaViewer";
import { useMediaViewerStore, type MediaViewerItem } from "../../stores/useMediaViewerStore";
import { useResourcePanelStore } from "../../stores/useResourcePanelStore";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<CenteredMediaViewer />));
});
afterEach(() => {
  act(() => useMediaViewerStore.getState().close());
  act(() => root.unmount());
  host.remove();
  useResourcePanelStore.setState({ groups: {} });
});

const item = (media: "image" | "video"): MediaViewerItem => ({
  media,
  src: `/blob/${media}`,
  title: `${media}.file`,
  downloadHref: `/blob/${media}?download=true`,
  downloadName: `${media}.file`,
  resource: {
    panelGroupId: "g",
    blobGroupId: "g",
    messageKey: "event",
    eventId: "event",
    index: 0,
    blobPath: `state/blobs/${media}`,
    siblings: [],
  },
});
const dialog = () => document.querySelector<HTMLElement>("[data-media-viewer]");

it("shows nothing until an attachment is opened", () => {
  expect(dialog()).toBeNull();
});

it("shows an image in a modal dialog and closes from the backdrop", () => {
  act(() => useMediaViewerStore.getState().open(item("image")));

  expect(dialog()?.getAttribute("role")).toBe("dialog");
  expect(dialog()?.getAttribute("aria-modal")).toBe("true");
  const image = dialog()!.querySelector("img[data-media-viewer-content]")!;
  expect(image.getAttribute("src")).toBe("/blob/image");

  act(() => image.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(dialog()).not.toBeNull();

  act(() => dialog()!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(dialog()).toBeNull();
});

it("plays a video with controls and closes from its close button", () => {
  act(() => useMediaViewerStore.getState().open(item("video")));

  const video = dialog()!.querySelector<HTMLVideoElement>("video[data-media-viewer-content]")!;
  expect(video.getAttribute("src")).toBe("/blob/video");
  expect(video.controls).toBe(true);

  act(() => dialog()!.querySelector<HTMLButtonElement>("[data-media-viewer-close]")!.click());
  expect(dialog()).toBeNull();
});

it("hands the attachment to the side panel on request", () => {
  act(() => useMediaViewerStore.getState().open(item("image")));

  const button = [...dialog()!.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "mediaViewer.openInPanel",
  )!;
  act(() => button.click());

  expect(dialog()).toBeNull();
  expect(useResourcePanelStore.getState().groups.g.tabs[0]).toMatchObject({
    kind: "attachment",
    media: "image",
    blobPath: "state/blobs/image",
  });
});
