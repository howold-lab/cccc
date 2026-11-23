import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronRightIcon, EditIcon, GroupDeleteIcon } from "../Icons";

type Props = {
  name: string;
  count: number;
  open: boolean;
  /** Something inside waits on the user; shown only while folded, as the rows show it open. */
  waiting: boolean;
  readOnly?: boolean;
  onToggle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  children?: ReactNode;
};

/** One sidebar section: a folder row, with its Groups indented beneath while open. */
export function SidebarSectionFolder({
  name,
  count,
  open,
  waiting,
  readOnly,
  onToggle,
  onRename,
  onDelete,
  children,
}: Props) {
  const { t } = useTranslation("layout");
  return (
    <div data-sidebar-section>
      <div className="group/folder flex items-center rounded-lg pr-1 hover:bg-[var(--color-sidebar-item-hover)]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-sm text-[var(--color-text-primary)]"
          data-sidebar-section-toggle
        >
          {open ? (
            <ChevronDownIcon size={14} className="shrink-0 text-[var(--color-text-tertiary)]" />
          ) : (
            <ChevronRightIcon size={14} className="shrink-0 text-[var(--color-text-tertiary)]" />
          )}
          <span className="min-w-0 truncate font-medium">{name}</span>
          {!open && (
            <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">{count}</span>
          )}
          {!open && waiting && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--lcd-danger, #d9534f)" }}
              title={t("sections.waitingInside")}
              data-sidebar-section-waiting
            />
          )}
        </button>
        {!readOnly && (onRename || onDelete) && (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/folder:opacity-100">
            {onRename && (
              <button
                type="button"
                onClick={onRename}
                className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                aria-label={`${t("sections.rename")} · ${name}`}
                title={t("sections.rename")}
              >
                <EditIcon size={13} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                aria-label={`${t("sections.delete")} · ${name}`}
                title={t("sections.delete")}
              >
                <GroupDeleteIcon size={13} />
              </button>
            )}
          </span>
        )}
      </div>
      {open && <div className="pl-2">{children}</div>}
    </div>
  );
}
