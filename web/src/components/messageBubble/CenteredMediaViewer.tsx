import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useModalA11y } from "../../hooks/useModalA11y";
import { useMediaViewerStore } from "../../stores/useMediaViewerStore";
import { AuthenticatedDownloadLink } from "../AuthenticatedDownloadLink";
import { CloseIcon, DownloadIcon } from "../Icons";
import { ModalFocusGuard } from "../ModalFocusGuard";

const BAR_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white/70";

/**
 * A message image or video opened in a centered window over a dimmed page.
 * Clicking the backdrop or pressing Escape closes it; the side panel stays one
 * click away for zooming, comparing and locating the message.
 */
export function CenteredMediaViewer() {
  const { t } = useTranslation("chat");
  const item = useMediaViewerStore((state) => state.item);
  const close = useMediaViewerStore((state) => state.close);
  const isOpen = item !== null;
  const { modalRef } = useModalA11y(isOpen, close);

  const openInPanel = useMediaViewerStore((state) => state.openInPanel);

  if (!item || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      data-media-viewer
      className="fixed inset-0 z-[70] flex animate-fade-in flex-col bg-black/80 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="flex min-w-0 items-center gap-2 px-4 py-3"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">
          {item.title}
        </span>
        <button type="button" className={BAR_BUTTON} onClick={openInPanel}>
          {t("mediaViewer.openInPanel")}
        </button>
        <AuthenticatedDownloadLink
          href={item.downloadHref}
          download={item.downloadName}
          title={t("download", { name: item.title })}
          aria-label={t("download", { name: item.title })}
          className={BAR_BUTTON}
        >
          <DownloadIcon size={14} />
        </AuthenticatedDownloadLink>
        <button
          type="button"
          className={BAR_BUTTON}
          onClick={close}
          aria-label={t("mediaViewer.close")}
          title={t("mediaViewer.close")}
          data-media-viewer-close
        >
          <CloseIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-10 sm:pb-10"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {item.media === "image" ? (
          <img
            src={item.src}
            alt={item.title}
            className="block max-h-full max-w-full rounded-md object-contain shadow-2xl"
            style={item.isSvg ? { backgroundColor: "#fff" } : undefined}
            data-media-viewer-content
          />
        ) : (
          <video
            src={item.src}
            controls
            autoPlay
            playsInline
            className="block max-h-full max-w-full rounded-md bg-black shadow-2xl"
            data-media-viewer-content
          />
        )}
      </div>
      <ModalFocusGuard />
    </div>,
    document.body,
  );
}
