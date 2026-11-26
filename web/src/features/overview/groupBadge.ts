/** Badge colours for Groups on the overview, picked by a stable hash of the Group ID. */
const BADGE_COLORS = ["#4b8dff", "#d9822b", "#3ba776", "#9a6bff", "#c2526b", "#2fa3b5", "#b58a2f"];

/**
 * A Group's short name: "知识库-汤泽盛" reads as "汤泽盛". Only a CJK prefix is dropped, so
 * a name such as "live-platform" stays whole.
 */
export function groupShortName(title: string): string {
  const match = /^([㐀-鿿]+)\s*[-–—·]\s*(.+)$/.exec(title.trim());
  return match ? match[2] : title.trim();
}

/** The one character shown in a Group's round badge. */
export function groupInitial(title: string): string {
  return Array.from(groupShortName(title))[0]?.toUpperCase() ?? "?";
}

export function groupColor(groupId: string): string {
  let hash = 0;
  for (const char of groupId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}
