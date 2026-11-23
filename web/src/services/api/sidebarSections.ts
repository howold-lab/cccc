import { apiJson } from "./base";

export type SidebarSection = { id: string; name: string; group_ids: string[] };

/** Named folders of Groups, plus Groups pinned beside the overview. One per CCCC home. */
export type SidebarLayout = { v: 1; pinned: string[]; sections: SidebarSection[] };

export const EMPTY_SIDEBAR_LAYOUT: SidebarLayout = { v: 1, pinned: [], sections: [] };

export async function fetchSidebarSections(init?: RequestInit) {
  return apiJson<{ saved: boolean; sections: SidebarLayout }>("/api/v1/sidebar/sections", {
    cache: "no-store",
    ...init,
  });
}

export async function saveSidebarSections(layout: SidebarLayout) {
  return apiJson<{ saved: boolean; sections: SidebarLayout }>("/api/v1/sidebar/sections", {
    method: "PUT",
    body: JSON.stringify(layout),
  });
}
