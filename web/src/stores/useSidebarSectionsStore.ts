import { create } from "zustand";
import {
  EMPTY_SIDEBAR_LAYOUT,
  fetchSidebarSections,
  saveSidebarSections,
  type SidebarLayout,
} from "../services/api/sidebarSections";

const COLLAPSED_KEY = "cccc-sidebar-collapsed-sections";

function readCollapsed(): string[] {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function newSectionId() {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** The layout without `groupId` anywhere: pinned or in a section. */
export function withoutGroup(layout: SidebarLayout, groupId: string): SidebarLayout {
  return {
    ...layout,
    pinned: layout.pinned.filter((id) => id !== groupId),
    sections: layout.sections.map((section) => ({
      ...section,
      group_ids: section.group_ids.filter((id) => id !== groupId),
    })),
  };
}

/** The section that holds a Group, if any. */
export function sectionOf(layout: SidebarLayout, groupId: string) {
  return layout.sections.find((section) => section.group_ids.includes(groupId)) ?? null;
}

type SidebarSectionsState = {
  layout: SidebarLayout;
  loaded: boolean;
  /** Section ids folded in this browser (a viewing preference, kept per browser). */
  collapsed: string[];
  load: () => Promise<void>;
  /** Saves a new layout for everyone; the view updates at once and rolls back on failure. */
  save: (layout: SidebarLayout) => Promise<boolean>;
  moveGroup: (groupId: string, sectionId: string | null) => Promise<boolean>;
  createSection: (name: string, groupId?: string) => Promise<boolean>;
  renameSection: (sectionId: string, name: string) => Promise<boolean>;
  deleteSection: (sectionId: string) => Promise<boolean>;
  setPinned: (groupId: string, pinned: boolean) => Promise<boolean>;
  toggleCollapsed: (sectionId: string) => void;
};

export const useSidebarSectionsStore = create<SidebarSectionsState>((set, get) => ({
  layout: EMPTY_SIDEBAR_LAYOUT,
  loaded: false,
  collapsed: typeof window === "undefined" ? [] : readCollapsed(),
  load: async () => {
    const response = await fetchSidebarSections().catch(() => null);
    if (response?.ok) set({ layout: response.result.sections, loaded: true });
    else set({ loaded: true });
  },
  save: async (layout) => {
    const previous = get().layout;
    set({ layout });
    const response = await saveSidebarSections(layout).catch(() => null);
    if (!response?.ok) {
      set({ layout: previous });
      return false;
    }
    set({ layout: response.result.sections });
    return true;
  },
  moveGroup: (groupId, sectionId) => {
    const base = withoutGroup(get().layout, groupId);
    return get().save({
      ...base,
      sections: base.sections.map((section) =>
        section.id === sectionId
          ? { ...section, group_ids: [...section.group_ids, groupId] }
          : section,
      ),
    });
  },
  createSection: (name, groupId) => {
    const trimmed = name.trim();
    if (!trimmed) return Promise.resolve(false);
    const base = groupId ? withoutGroup(get().layout, groupId) : get().layout;
    return get().save({
      ...base,
      sections: [
        ...base.sections,
        { id: newSectionId(), name: trimmed, group_ids: groupId ? [groupId] : [] },
      ],
    });
  },
  renameSection: (sectionId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return Promise.resolve(false);
    const layout = get().layout;
    return get().save({
      ...layout,
      sections: layout.sections.map((section) =>
        section.id === sectionId ? { ...section, name: trimmed } : section,
      ),
    });
  },
  deleteSection: (sectionId) => {
    const layout = get().layout;
    return get().save({
      ...layout,
      sections: layout.sections.filter((section) => section.id !== sectionId),
    });
  },
  setPinned: (groupId, pinned) => {
    const base = withoutGroup(get().layout, groupId);
    return get().save(pinned ? { ...base, pinned: [...base.pinned, groupId] } : base);
  },
  toggleCollapsed: (sectionId) => {
    const current = get().collapsed;
    const next = current.includes(sectionId)
      ? current.filter((id) => id !== sectionId)
      : [...current, sectionId];
    set({ collapsed: next });
    try {
      window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
    } catch {
      // Folding still works for this visit.
    }
  },
}));
