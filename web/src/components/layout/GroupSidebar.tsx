import { useUIStore } from "../../stores/useUIStore";
import { groupConnectionCount } from "../../features/connect/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { instanceName } from "../../features/connect/instanceName";
import { useTranslation } from "react-i18next";
import { GroupMeta } from "../../types";
import { classNames } from "../../utils/classNames";
import type { GroupControl } from "../../utils/groupControls";
import { groupRunMenuActions } from "./groupRunMenuActions";
import { getGroupStatusFromSource } from "../../utils/groupStatus";
import {
  CloseIcon,
  FolderIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  GroupDeleteIcon,
  PlusIcon,
  HomeIcon,
  ClipboardIcon,
  SearchIcon,
  PinIcon,
} from "../Icons";
import { useSidebarSectionsStore, sectionOf } from "../../stores/useSidebarSectionsStore";
import { splitIntoSections, subsetMoveToFull } from "./sidebarSectionsModel";
import { SidebarSectionFolder } from "./SidebarSectionFolder";
import type { GroupMenuActionItem } from "./useGroupMenu";
import type { OverviewView } from "../../stores/useOverviewStore";
import { useQuickJumpStore } from "../../stores/useQuickJumpStore";
import { GroupSidebarSectionHeader } from "./GroupSidebarSectionHeader";
import { GroupSidebarItem } from "./GroupSidebarItem";
import { GroupSidebarSortableList } from "./GroupSidebarSortableList";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "../../stores/useUIStore";
import { useBrandingStore } from "../../stores";
import { resolveThemeAwareLogoUrl } from "../../utils/branding";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { getSidebarReorderActivation, groupSidebarScrollClass } from "./groupSidebarModel";
import { CodexVoiceSidebarDock } from "../../features/codexVoice/CodexVoiceShellSurfaces";
import type { CodexVoiceShellState } from "../../features/codexVoice/useCodexVoiceShell";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { SidebarMobileOverlay } from "./SidebarMobileOverlay";
import { ConnectSidebar } from "../../features/connect/ConnectSidebar";
import type { ConnectWorkbench } from "../../features/connect/useConnectWorkbench";

import { LocalSessionsButton } from "../../features/localSessions/LocalSessionsButton";
import { useVisiblePendingSummary } from "../../features/pendingReplies/useVisiblePendingSummary";
import { aggregatePendingIndicator } from "../../features/pendingReplies/indicator";
import { PendingIndicatorText } from "../../features/pendingReplies/PendingIndicator";

export interface GroupSidebarProps {
  canAccessLocalSessions?: boolean;
  connect?: ConnectWorkbench;
  orderedGroups: GroupMeta[];
  archivedGroupIds: string[];
  selectedGroupId: string;
  isOpen: boolean;
  isCollapsed: boolean;
  sidebarWidth: number;
  isDark: boolean;
  readOnly?: boolean;
  codexVoice?: CodexVoiceShellState;
  onSelectGroup: (groupId: string) => void;
  onWarmGroup?: (groupId: string) => void;
  onCreateGroup?: () => void;
  onClose: () => void;
  onToggleCollapse: () => void;
  onResizeWidth: (width: number) => void;
  onReorderSection: (section: "working" | "archived", fromIndex: number, toIndex: number) => void;
  onArchiveGroup: (groupId: string) => void;
  onRestoreGroup: (groupId: string) => void;
  onOpenGroupConnections?: (groupId: string) => void;
  /** Open a group's Automation settings from its menu; omitted for read-only viewers. */
  onOpenGroupAutomation?: (groupId: string) => void;
  /** Launch/pause/stop a group from its menu; omitted for read-only viewers. */
  onControlGroup?: (groupId: string, control: GroupControl) => void;
  /** Delete a group from its menu; the handler owns the confirmation. */
  onDeleteGroup?: (groupId: string) => void;
  /** Which cross-Group page (overview or task board) is on show, if any. */
  overviewView?: OverviewView | null;
  /** Opens a cross-Group page; omitted where they are unavailable. */
  onOpenOverview?: (view: OverviewView) => void;
}

export function GroupSidebar({
  connect,
  canAccessLocalSessions,
  orderedGroups,
  archivedGroupIds,
  selectedGroupId,
  isOpen,
  isCollapsed,
  sidebarWidth,
  isDark,
  readOnly,
  codexVoice,
  onSelectGroup,
  onWarmGroup,
  onCreateGroup,
  onClose,
  onToggleCollapse,
  onResizeWidth,
  onReorderSection,
  onArchiveGroup,
  onRestoreGroup,
  onOpenGroupConnections,
  onOpenGroupAutomation,
  onControlGroup,
  onDeleteGroup,
  overviewView = null,
  onOpenOverview,
}: GroupSidebarProps) {
  const { t } = useTranslation("layout");
  const pending = useVisiblePendingSummary();
  const controlsBusy = useUIStore((state) => state.busy.startsWith("group-"));
  const branding = useBrandingStore((s) => s.branding);
  const logoSrc = resolveThemeAwareLogoUrl(branding.logo_icon_url, isDark);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const archivedSet = useMemo(() => new Set(archivedGroupIds), [archivedGroupIds]);
  const workingGroups = useMemo(
    () => orderedGroups.filter((g) => !archivedSet.has(String(g.group_id || "").trim())),
    [archivedSet, orderedGroups],
  );
  const archivedGroups = useMemo(
    () => orderedGroups.filter((g) => archivedSet.has(String(g.group_id || "").trim())),
    [archivedSet, orderedGroups],
  );
  const sectionLayout = useSidebarSectionsStore((state) => state.layout);
  const sectionsLoaded = useSidebarSectionsStore((state) => state.loaded);
  const foldedSections = useSidebarSectionsStore((state) => state.collapsed);
  useEffect(() => {
    if (!sectionsLoaded) void useSidebarSectionsStore.getState().load();
  }, [sectionsLoaded]);
  const split = useMemo(
    () => splitIntoSections(workingGroups, sectionLayout),
    [sectionLayout, workingGroups],
  );
  const showError = useUIStore((state) => state.showError);
  const saveOrWarn = useCallback(
    (result: Promise<boolean>) => {
      void result.then((ok) => {
        if (!ok) showError(t("sections.saveFailed"));
      });
    },
    [showError, t],
  );
  const archivedPending = pending
    ? aggregatePendingIndicator(
        pending.summaries,
        archivedGroups.map((group) => group.group_id),
      )
    : null;
  const totalPending = pending
    ? aggregatePendingIndicator(
        pending.summaries,
        orderedGroups.map((group) => group.group_id),
      )
    : null;
  const collapsedGroups = useMemo(() => {
    if (!isCollapsed) return workingGroups;
    const selectedArchived = archivedGroups.find(
      (g) => String(g.group_id || "").trim() === String(selectedGroupId || "").trim(),
    );
    return selectedArchived ? [...workingGroups, selectedArchived] : workingGroups;
  }, [archivedGroups, isCollapsed, selectedGroupId, workingGroups]);
  const [archivedOpen, setArchivedOpen] = useState(
    () =>
      archivedGroups.some(
        (g) => String(g.group_id || "").trim() === String(selectedGroupId || "").trim(),
      ) ||
      (orderedGroups.length > 0 && workingGroups.length === 0 && archivedGroups.length > 0),
  );
  const selectedArchived = useMemo(
    () =>
      archivedGroups.some(
        (g) => String(g.group_id || "").trim() === String(selectedGroupId || "").trim(),
      ),
    [archivedGroups, selectedGroupId],
  );
  const autoArchivedOpen =
    selectedArchived ||
    (orderedGroups.length > 0 && workingGroups.length === 0 && archivedGroups.length > 0);
  const archivedPanelOpen = archivedOpen || autoArchivedOpen;

  useEffect(() => {
    if (!isResizing) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      onResizeWidth(drag.startWidth + (event.clientX - drag.startX));
    };

    const finishResize = () => {
      dragStateRef.current = null;
      setIsResizing(false);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      finishResize();
    };
  }, [isResizing, onResizeWidth]);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isCollapsed) return;
      event.preventDefault();
      event.stopPropagation();
      dragStateRef.current = {
        startX: event.clientX,
        startWidth: sidebarRef.current?.getBoundingClientRect().width || sidebarWidth,
      };
      setIsResizing(true);
      document.body.style.setProperty("cursor", "col-resize");
      document.body.style.setProperty("user-select", "none");
    },
    [isCollapsed, sidebarWidth],
  );

  const runActionsFor = useCallback(
    (group: GroupMeta) => {
      if (readOnly) return [];
      const gid = String(group.group_id || "");
      const runActions = onControlGroup
        ? groupRunMenuActions(
            getGroupStatusFromSource(group).key,
            t,
            (control) => onControlGroup(gid, control),
            controlsBusy,
          )
        : [];
      // Automation schedules what the group runs, so it sits with the run controls.
      const automation = onOpenGroupAutomation
        ? [
            {
              label: t("groupAutomation"),
              icon: <ClockIcon size={15} />,
              section: "automation",
              onClick: () => onOpenGroupAutomation(gid),
            },
          ]
        : [];
      return [...runActions, ...automation];
    },
    [onControlGroup, onOpenGroupAutomation, readOnly, t, controlsBusy],
  );

  const sectionActionsFor = useCallback(
    (gid: string): GroupMenuActionItem[] => {
      const store = useSidebarSectionsStore.getState();
      const current = sectionOf(sectionLayout, gid);
      const pinned = sectionLayout.pinned.includes(gid);
      const moves = sectionLayout.sections
        .filter((section) => section.id !== current?.id)
        .map((section) => ({
          label: t("sections.moveTo", { name: section.name }),
          icon: <FolderIcon size={15} />,
          section: "sections",
          onClick: () => saveOrWarn(store.moveGroup(gid, section.id)),
        }));
      const out: GroupMenuActionItem[] = [...moves];
      if (current) {
        out.push({
          label: t("sections.removeFrom"),
          section: "sections",
          onClick: () => saveOrWarn(store.moveGroup(gid, null)),
        });
      }
      out.push({
        label: t("sections.newSection"),
        icon: <PlusIcon size={15} />,
        section: "sections",
        onClick: () => {
          const name = window.prompt(t("sections.newSectionPrompt"));
          if (name?.trim()) saveOrWarn(store.createSection(name, gid));
        },
      });
      out.push({
        label: pinned ? t("sections.unpin") : t("sections.pin"),
        icon: <PinIcon size={15} />,
        section: "sections",
        onClick: () => saveOrWarn(store.setPinned(gid, !pinned)),
      });
      return out;
    },
    [saveOrWarn, sectionLayout, t],
  );

  const trailingActionsFor = useCallback(
    (group: GroupMeta) => {
      if (readOnly) return [];
      const gid = String(group.group_id || "");
      const sectionItems = archivedSet.has(gid.trim()) ? [] : sectionActionsFor(gid);
      if (!onDeleteGroup) return sectionItems;
      return [
        ...sectionItems,
        {
          label: t("deleteGroup"),
          disabled: controlsBusy,
          icon: <GroupDeleteIcon size={15} />,
          tone: "danger" as const,
          section: "danger",
          onClick: () => onDeleteGroup(gid),
        },
      ];
    },
    [archivedSet, onDeleteGroup, readOnly, sectionActionsFor, t, controlsBusy],
  );

  const overviewEntry = (collapsed: boolean, view: OverviewView) => {
    if (!onOpenOverview) return null;
    const active = overviewView === view;
    const label = view === "tasks" ? t("overview.tasksNav") : t("overview.nav");
    const icon =
      view === "tasks" ? (
        <ClipboardIcon size={collapsed ? 18 : 16} />
      ) : (
        <HomeIcon size={collapsed ? 18 : 16} />
      );
    if (collapsed)
      return (
        <IconButton
          type="button"
          size="touch"
          variant={active ? "secondary" : undefined}
          onClick={() => onOpenOverview(view)}
          label={label}
          aria-current={active ? "page" : undefined}
        >
          {icon}
        </IconButton>
      );
    return (
      <button
        type="button"
        onClick={() => {
          onOpenOverview(view);
          if (window.matchMedia("(max-width: 767px)").matches) onClose();
        }}
        aria-current={active ? "page" : undefined}
        className={classNames(
          "mx-2 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
          view === "overview" ? "mt-2" : "mt-0.5",
          active
            ? "bg-[var(--color-sidebar-item-active)] font-semibold text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)] hover:text-[var(--color-text-primary)]",
        )}
        data-overview-entry={view}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {view === "overview" && totalPending && <PendingIndicatorText indicator={totalPending} />}
      </button>
    );
  };

  const localSessionsEntry = (collapsed: boolean) =>
    !readOnly && canAccessLocalSessions ? (
      <LocalSessionsButton
        collapsed={collapsed}
        isDark={isDark}
        onSelectGroup={(groupId) => {
          onSelectGroup(groupId);
          if (window.matchMedia("(max-width: 767px)").matches) onClose();
        }}
      />
    ) : null;

  const renderGroupList = useCallback(
    (groups: GroupMeta[], section: "working" | "archived") => {
      const isArchivedSection = section === "archived";
      const menuActionLabel = isArchivedSection ? t("restoreGroup") : t("archiveGroup");
      const handleMenuAction = (gid: string) => {
        if (isArchivedSection) {
          onRestoreGroup(gid);
          return;
        }
        setArchivedOpen(true);
        onArchiveGroup(gid);
      };
      // A section shows part of the working list; map its moves back onto the whole list.
      const reorder =
        section === "working" && groups !== workingGroups
          ? (_: "working" | "archived", fromIndex: number, toIndex: number) => {
              const mapped = subsetMoveToFull(groups, workingGroups, fromIndex, toIndex);
              if (mapped) onReorderSection("working", mapped[0], mapped[1]);
            }
          : onReorderSection;
      if (getSidebarReorderActivation({ isCollapsed, readOnly }) !== "disabled") {
        return (
          <GroupSidebarSortableList
            groups={groups}
            section={section}
            selectedGroupId={selectedGroupId}
            isDark={isDark}
            isCollapsed={false}
            readOnly={readOnly}
            menuActionLabel={menuActionLabel}
            connectionsLabel={t("groupConnections.title")}
            onOpenConnections={onOpenGroupConnections}
            connectionSummary={connect?.groupConnections}
            menuAriaLabel={t("groupActions")}
            reorderInstructions={t("reorderWithKeyboard")}
            onMenuAction={handleMenuAction}
            runActionsFor={runActionsFor}
            trailingActionsFor={trailingActionsFor}
            onReorderSection={reorder}
            onSelectGroup={onSelectGroup}
            onWarmGroup={onWarmGroup}
            onClose={onClose}
          />
        );
      }
      return (
        <div className={classNames(isCollapsed ? "flex flex-col items-center gap-2" : "space-y-1")}>
          {groups.map((g) => {
            const gid = String(g.group_id || "");
            return (
              <GroupSidebarItem
                key={gid}
                group={g}
                isActive={gid === selectedGroupId}
                isCollapsed={isCollapsed}
                isArchived={isArchivedSection}
                connectionsLabel={t("groupConnections.title")}
                connection={groupConnectionCount(connect?.groupConnections, gid)}
                onOpenConnections={
                  onOpenGroupConnections ? () => onOpenGroupConnections(gid) : undefined
                }
                menuActionLabel={isCollapsed ? undefined : menuActionLabel}
                menuAriaLabel={isCollapsed ? undefined : `${t("groupActions")} · ${g.title || gid}`}
                onMenuAction={isCollapsed ? undefined : () => handleMenuAction(gid)}
                runActions={isCollapsed ? undefined : runActionsFor(g)}
                trailingActions={isCollapsed ? undefined : trailingActionsFor(g)}
                onSelect={() => {
                  onSelectGroup(gid);
                  if (window.matchMedia("(max-width: 767px)").matches) onClose();
                }}
                onWarm={gid === selectedGroupId ? undefined : () => onWarmGroup?.(gid)}
              />
            );
          })}
        </div>
      );
    },
    [
      isCollapsed,
      isDark,
      onArchiveGroup,
      onClose,
      onReorderSection,
      onRestoreGroup,
      onOpenGroupConnections,
      connect?.groupConnections,
      onSelectGroup,
      onWarmGroup,
      readOnly,
      runActionsFor,
      selectedGroupId,
      t,
      trailingActionsFor,
      workingGroups,
    ],
  );

  const pinnedEntry = (group: GroupMeta) => {
    const gid = String(group.group_id || "");
    const active = !overviewView && gid === selectedGroupId;
    const waiting = pending ? aggregatePendingIndicator(pending.summaries, [group.group_id]) : null;
    return (
      <button
        key={gid}
        type="button"
        onClick={() => {
          onSelectGroup(gid);
          if (window.matchMedia("(max-width: 767px)").matches) onClose();
        }}
        onMouseEnter={active ? undefined : () => onWarmGroup?.(gid)}
        aria-current={active ? "page" : undefined}
        className={classNames(
          "mx-2 mt-0.5 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
          active
            ? "bg-[var(--color-sidebar-item-active)] font-semibold text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)] hover:text-[var(--color-text-primary)]",
        )}
        data-sidebar-pinned={gid}
      >
        <PinIcon size={16} />
        <span className="min-w-0 flex-1 truncate">{group.title || gid}</span>
        {waiting && <PendingIndicatorText indicator={waiting} />}
      </button>
    );
  };

  const sectionFolder = (
    key: string,
    name: string,
    groups: GroupMeta[],
    actions?: { onRename: () => void; onDelete: () => void },
  ) => {
    const open = !foldedSections.includes(key);
    const waiting = pending
      ? aggregatePendingIndicator(
          pending.summaries,
          groups.map((group) => group.group_id),
        ) !== null
      : false;
    return (
      <SidebarSectionFolder
        key={key}
        name={name}
        count={groups.length}
        open={open}
        waiting={waiting}
        readOnly={readOnly}
        onToggle={() => useSidebarSectionsStore.getState().toggleCollapsed(key)}
        onRename={actions?.onRename}
        onDelete={actions?.onDelete}
      >
        {groups.length > 0 ? renderGroupList(groups, "working") : null}
      </SidebarSectionFolder>
    );
  };

  const sectionedList = () => (
    <div className="space-y-1" data-sidebar-sections>
      {split.sections.map(({ section, groups }) =>
        sectionFolder(section.id, section.name, groups, {
          onRename: () => {
            const name = window.prompt(t("sections.renamePrompt"), section.name);
            if (name?.trim() && name.trim() !== section.name)
              saveOrWarn(useSidebarSectionsStore.getState().renameSection(section.id, name));
          },
          onDelete: () => {
            if (window.confirm(t("sections.deleteConfirm", { name: section.name })))
              saveOrWarn(useSidebarSectionsStore.getState().deleteSection(section.id));
          },
        }),
      )}
      {split.unsectioned.length > 0 &&
        sectionFolder("__unsectioned", t("sections.unsectioned"), split.unsectioned)}
    </div>
  );

  return (
    <>
      <aside
        ref={sidebarRef}
        className={classNames(
          "h-full min-h-0 flex flex-col glass-sidebar",
          "fixed inset-y-0 left-0 z-50 md:relative md:inset-auto md:z-40",
          isResizing ? "transition-none" : "transition-[width,transform] duration-300 ease-out",
          isCollapsed ? "w-[60px]" : "w-[248px] md:w-[var(--sidebar-width)]",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
        )}
      >
        {/* Header */}
        <div className="flex h-14 min-h-[44px] shrink-0 items-center md:h-11 md:min-h-0 [@media(pointer:coarse)]:min-h-[44px] border-b border-[var(--glass-border-subtle)] px-3">
          <div
            className={classNames(
              "@container/brand flex w-full items-center gap-1.5",
              isCollapsed ? "justify-center" : "justify-between",
            )}
          >
            <div
              className={classNames("flex min-w-0 flex-1 items-center", isCollapsed ? "" : "gap-3")}
            >
              <div
                className={classNames(
                  "flex items-center justify-center overflow-hidden rounded-xl bg-transparent",
                  "w-8 h-8 shrink-0",
                  "text-[rgb(35,36,37)] dark:text-white",
                )}
              >
                <img
                  src={logoSrc}
                  alt={`${branding.product_name} logo`}
                  className={classNames("object-contain", isCollapsed ? "w-6 h-6" : "h-7 w-7")}
                />
              </div>
              {/* A larger text size leaves the fixed-width row too narrow for the name;
                  the logo then stands alone rather than cutting the name short. */}
              {!isCollapsed && (
                <div className="min-w-0 flex-1 @max-[13rem]/brand:hidden">
                  <div
                    className="truncate text-[15px] font-semibold tracking-[-0.035em] text-[var(--color-text-primary)]"
                    data-brand-name
                  >
                    {branding.product_name}
                  </div>
                </div>
              )}
            </div>

            {!isCollapsed && !readOnly && onCreateGroup && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-[44px] min-h-[44px] shrink-0 gap-1 px-2 py-0 text-[0.8125rem] md:h-8 md:min-h-8"
                onClick={onCreateGroup}
                title={t("createNewGroup")}
                aria-label={t("createNewGroup")}
              >
                <PlusIcon size={14} aria-hidden="true" />
                {t("newGroup")}
              </Button>
            )}

            {!isCollapsed && (
              <div className="flex shrink-0 items-center gap-2">
                {/* Collapse button - desktop only */}
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden text-[var(--color-text-tertiary)] md:inline-flex"
                  onClick={onToggleCollapse}
                  label={t("collapseSidebar")}
                >
                  <ChevronLeftIcon size={16} />
                </IconButton>
                {/* Close button - mobile only */}
                <IconButton
                  type="button"
                  variant="secondary"
                  size="touch"
                  className="text-[var(--color-text-primary)] md:hidden"
                  onClick={onClose}
                  label={t("closeSidebar")}
                >
                  <CloseIcon size={18} />
                </IconButton>
              </div>
            )}
          </div>
        </div>

        {/* Collapsed: expand button and new button */}
        {isCollapsed && (
          <div className="p-2 flex flex-col items-center gap-2">
            <IconButton
              type="button"
              variant="secondary"
              size="touch"
              className="relative text-[var(--color-text-primary)]"
              onClick={onToggleCollapse}
              label={
                totalPending
                  ? `${t("expandSidebar")} · ${t("pendingRepliesIndicator", { value: totalPending.text })}`
                  : t("expandSidebar")
              }
            >
              <ChevronRightIcon size={18} />
              {totalPending && (
                <span className="absolute -right-1 -top-1">
                  <PendingIndicatorText indicator={totalPending} />
                </span>
              )}
            </IconButton>
            {!readOnly && onCreateGroup && (
              <IconButton
                type="button"
                size="touch"
                onClick={onCreateGroup}
                label={t("createNewGroup")}
              >
                <PlusIcon size={18} />
              </IconButton>
            )}
            {overviewEntry(true, "overview")}
            {overviewEntry(true, "tasks")}
            {localSessionsEntry(true)}
          </div>
        )}

        {!isCollapsed && onOpenOverview ? (
          <button
            type="button"
            onClick={() => useQuickJumpStore.getState().setOpen(true)}
            className="mx-2 mt-2 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-[13px] text-[var(--color-text-tertiary)]"
            data-quick-jump-entry
          >
            <SearchIcon size={14} />
            <span className="min-w-0 flex-1 truncate">{t("overview.palette.placeholder")}</span>
            <kbd className="shrink-0 rounded px-1 text-[11px]">⌘K</kbd>
          </button>
        ) : null}
        {!isCollapsed && overviewEntry(false, "overview")}
        {!isCollapsed && overviewEntry(false, "tasks")}
        {!isCollapsed && split.pinned.map(pinnedEntry)}

        {/* Group list */}
        {!isCollapsed && (
          <GroupSidebarSectionHeader
            instanceLabel={
              connect?.ownInstance
                ? instanceName(connect.ownInstance, connect.instances)
                : undefined
            }
            instanceOrigin={connect?.ownInstance?.public_origin}
            action={localSessionsEntry(false)}
          />
        )}
        <div className={groupSidebarScrollClass(isCollapsed)}>
          {isCollapsed
            ? renderGroupList(collapsedGroups, "working")
            : split.hasSections
              ? sectionedList()
              : renderGroupList(split.pinned.length ? split.unsectioned : workingGroups, "working")}

          {!isCollapsed && archivedGroups.length > 0 && (
            <div className="mt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between px-2 text-[var(--color-text-primary)]"
                onClick={() => setArchivedOpen((prev) => !prev)}
                aria-expanded={archivedPanelOpen}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
                    {t("archivedGroups")}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--glass-panel-bg)] text-[var(--color-text-secondary)]">
                    {archivedGroups.length}
                  </span>
                  {archivedPending && <PendingIndicatorText indicator={archivedPending} />}
                </div>
                <ChevronDownIcon
                  size={16}
                  className={classNames(
                    "transition-transform",
                    archivedPanelOpen ? "rotate-180" : "",
                  )}
                />
              </Button>
              {archivedPanelOpen && (
                <div className="mt-2">{renderGroupList(archivedGroups, "archived")}</div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!orderedGroups.length && !isCollapsed && (
            <div className="p-6 text-center">
              <div
                className={classNames(
                  "w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center glass-card",
                  "text-[var(--color-text-tertiary)]",
                )}
              >
                <FolderIcon size={32} />
              </div>
              <div className="text-sm mb-2 font-medium text-[var(--color-text-secondary)]">
                {t("noGroupsYet")}
              </div>
              <div className="text-xs mb-5 max-w-[200px] mx-auto leading-relaxed text-[var(--color-text-tertiary)]">
                {t("noGroupsDescription")}
              </div>
              {!readOnly && onCreateGroup && (
                <Button type="button" className="w-full whitespace-normal" onClick={onCreateGroup}>
                  {t("createFirstGroup")}
                </Button>
              )}
            </div>
          )}
        </div>

        {connect ? (
          <ConnectSidebar
            workbench={connect}
            collapsed={isCollapsed}
            onSelected={() => {
              if (window.matchMedia("(max-width: 767px)").matches) onClose();
            }}
          />
        ) : null}

        {!readOnly && codexVoice ? (
          <CodexVoiceSidebarDock voice={codexVoice} collapsed={isCollapsed} />
        ) : null}

        {!isCollapsed && (
          <SidebarResizeHandle
            width={sidebarWidth}
            min={SIDEBAR_MIN_WIDTH}
            max={SIDEBAR_MAX_WIDTH}
            resizing={isResizing}
            label={t("resizeSidebar")}
            onPointerDown={handleResizeStart}
          />
        )}
      </aside>

      <SidebarMobileOverlay open={isOpen} onClose={onClose} />
    </>
  );
}
