import { create } from "zustand";
import {
  openAttachmentResource,
  type MessageAttachmentSource,
} from "../components/resourcePanel/openAttachmentResource";

/** One image or video from a message, shown in the centered viewer. */
export type MediaViewerItem = {
  media: "image" | "video";
  /** What the viewer displays; an SVG arrives already resolved to a blob address. */
  src: string;
  title: string;
  downloadHref: string;
  downloadName: string;
  isSvg?: boolean;
  /** Lets the viewer hand the same attachment to the resource panel. */
  resource: MessageAttachmentSource;
};

type MediaViewerState = {
  item: MediaViewerItem | null;
  open: (item: MediaViewerItem) => void;
  close: () => void;
  /** Moves the shown attachment into the resource panel, for zooming or comparing. */
  openInPanel: () => void;
};

export const useMediaViewerStore = create<MediaViewerState>((set, get) => ({
  item: null,
  open: (item) => set({ item }),
  close: () => set({ item: null }),
  openInPanel: () => {
    const item = get().item;
    if (!item) return;
    openAttachmentResource(item.resource, item.media, item.title, item.isSvg);
    set({ item: null });
  },
}));
