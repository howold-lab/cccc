import type { SidebarLayout, SidebarSection } from "../../services/api/sidebarSections";
import type { GroupMeta } from "../../types";

export type SidebarSplit = {
  pinned: GroupMeta[];
  sections: { section: SidebarSection; groups: GroupMeta[] }[];
  unsectioned: GroupMeta[];
  /** False when no section exists yet: the sidebar then keeps its plain list. */
  hasSections: boolean;
};

const idOf = (group: GroupMeta) => String(group.group_id || "").trim();

/**
 * Splits the working Groups by the saved layout. Groups keep the sidebar's own order inside
 * each part; layout entries for Groups that no longer exist (or are archived) are ignored.
 */
export function splitIntoSections(groups: GroupMeta[], layout: SidebarLayout): SidebarSplit {
  const byId = new Map(groups.map((group) => [idOf(group), group]));
  const pinned = layout.pinned.flatMap((id) => {
    const group = byId.get(id);
    return group ? [group] : [];
  });
  const placed = new Set(pinned.map(idOf));
  const sections = layout.sections.map((section) => {
    const members = new Set(section.group_ids.filter((id) => !placed.has(id)));
    const inSection = groups.filter((group) => members.has(idOf(group)));
    inSection.forEach((group) => placed.add(idOf(group)));
    return { section, groups: inSection };
  });
  return {
    pinned,
    sections,
    unsectioned: groups.filter((group) => !placed.has(idOf(group))),
    hasSections: layout.sections.length > 0,
  };
}

/** Maps a move inside a subset of Groups onto indices of the full working list. */
export function subsetMoveToFull(
  subset: GroupMeta[],
  full: GroupMeta[],
  fromIndex: number,
  toIndex: number,
): [number, number] | null {
  const from = subset[fromIndex];
  const to = subset[toIndex];
  if (!from || !to) return null;
  const fullIds = full.map(idOf);
  const a = fullIds.indexOf(idOf(from));
  const b = fullIds.indexOf(idOf(to));
  return a < 0 || b < 0 ? null : [a, b];
}

export type Segment<T> = { key: string; name: string | null; items: T[] };

/**
 * Splits overview rows into the sidebar's sections, in section order: pinned Groups first
 * (no heading), then each section, then the Groups in no section. Empty segments are dropped.
 */
export function segmentBySection<T extends { group: GroupMeta }>(
  items: T[],
  layout: SidebarLayout,
  unsectionedName: string,
): Segment<T>[] {
  const split = splitIntoSections(
    items.map((item) => item.group),
    layout,
  );
  const pick = (groups: GroupMeta[]) => {
    const wanted = new Set(groups.map(idOf));
    return items.filter((item) => wanted.has(idOf(item.group)));
  };
  const segments: Segment<T>[] = [
    { key: "__pinned", name: null, items: pick(split.pinned) },
    ...split.sections.map(({ section, groups }) => ({
      key: section.id,
      name: section.name,
      items: pick(groups),
    })),
    { key: "__unsectioned", name: unsectionedName, items: pick(split.unsectioned) },
  ];
  return segments.filter((segment) => segment.items.length > 0);
}
