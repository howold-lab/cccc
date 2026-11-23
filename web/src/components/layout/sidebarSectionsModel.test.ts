import { describe, expect, it } from "vitest";
import type { GroupMeta } from "../../types";
import { segmentBySection, splitIntoSections, subsetMoveToFull } from "./sidebarSectionsModel";

const g = (id: string) => ({ group_id: id, title: id }) as GroupMeta;

describe("splitIntoSections", () => {
  const groups = [g("a"), g("b"), g("c"), g("d"), g("e")];

  it("keeps the plain list when there are no sections", () => {
    const split = splitIntoSections(groups, { v: 1, pinned: [], sections: [] });
    expect(split.hasSections).toBe(false);
    expect(split.unsectioned.map((x) => x.group_id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("puts pinned, sectioned and leftover Groups apart, in sidebar order", () => {
    const split = splitIntoSections(groups, {
      v: 1,
      pinned: ["e", "gone"],
      sections: [
        { id: "s1", name: "中台", group_ids: ["c", "a", "e"] },
        { id: "s2", name: "知识库", group_ids: ["b", "a"] },
      ],
    });
    expect(split.pinned.map((x) => x.group_id)).toEqual(["e"]);
    expect(split.sections[0].groups.map((x) => x.group_id)).toEqual(["a", "c"]);
    expect(split.sections[1].groups.map((x) => x.group_id)).toEqual(["b"]);
    expect(split.unsectioned.map((x) => x.group_id)).toEqual(["d"]);
  });
});

describe("subsetMoveToFull", () => {
  it("maps a move inside a section onto the full list", () => {
    const full = [g("a"), g("b"), g("c"), g("d")];
    expect(subsetMoveToFull([g("b"), g("d")], full, 1, 0)).toEqual([3, 1]);
    expect(subsetMoveToFull([g("b")], full, 0, 5)).toBeNull();
  });
});

describe("segmentBySection", () => {
  it("keeps the rows' own order inside each section and drops empty ones", () => {
    const rows = [g("c"), g("a"), g("b"), g("d")].map((group) => ({ group }));
    const segments = segmentBySection(
      rows,
      {
        v: 1,
        pinned: ["d"],
        sections: [
          { id: "s1", name: "中台", group_ids: ["a", "c"] },
          { id: "s2", name: "空", group_ids: [] },
        ],
      },
      "未分区",
    );
    expect(segments.map((s) => [s.name, s.items.map((r) => r.group.group_id)])).toEqual([
      [null, ["d"]],
      ["中台", ["c", "a"]],
      ["未分区", ["b"]],
    ]);
  });
});
