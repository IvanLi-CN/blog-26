import { describe, expect, test } from "bun:test";
import { publicFixtureCatalog } from "./fixture";
import {
  buildPlaybookIndex,
  createPlaybookSearchPages,
  type PlaybookSearchPage,
  queryPlaybookSearch,
} from "./search";
import type { PlaybookSearchDocument } from "./types";

const pages: PlaybookSearchPage[] = [
  {
    href: "/playbook/topics/delivery/",
    title: "Canonical delivery",
    type: "topic",
    sections: Array.from({ length: 60 }, (_, order) => ({
      id: `section-${order}`,
      title: order < 2 ? "Same heading" : `Heading ${order}`,
      order,
    })),
  },
  { href: "/playbook/topics/other/", title: "Canonical delivery", type: "topic", sections: [] },
  { href: "/playbook/policies/delivery/", title: "Related policy", type: "policy", sections: [] },
];
function document(id: string, section?: number, body = "release context"): PlaybookSearchDocument {
  return {
    id,
    kind: section === undefined ? "page" : "section",
    title: section === undefined ? "release" : "Search heading",
    body,
    route: "/topics/delivery",
    section_id: section === undefined ? null : `section-${section}`,
    keywords: [],
  };
}
function search(documents: PlaybookSearchDocument[], limit = 50) {
  return queryPlaybookSearch(
    buildPlaybookIndex({ generated_at: "fixture", documents }, pages),
    "release",
    limit
  );
}

describe("Playbook content aggregation", () => {
  test("only chapter hits still use the bound catalog title and a single chapter target", () => {
    const [group] = search([document("section-only", 0, "release single chapter")]);
    expect(group.title).toBe("Canonical delivery");
    expect(group.href).toBe("/playbook/topics/delivery/#section-0");
    expect(group.snippet).toBe("release single chapter");
    expect(group.sections).toHaveLength(1);
  });
  test("page, chapter, duplicate and command hits share one result and unique canonical chapters", () => {
    const hits = [
      document("page"),
      document("first", 0),
      document("duplicate", 0),
      document("second", 1),
      { ...document("command", 2), kind: "command" as const, command_id: "release" },
    ];
    const [group] = search(hits);
    expect(group.title).toBe("Canonical delivery");
    expect(group.sections.map((section) => section.href)).toEqual(
      [0, 1, 2].map((n) => `/playbook/topics/delivery/#section-${n}`)
    );
    expect(group.sections[0].title).toBe(group.sections[1].title);
    expect(group.sections).toHaveLength(3);
    expect(search(hits)).toHaveLength(1);
  });
  test("unique content limits follow grouping even when one page has 60 hits", () => {
    const hits = [
      ...Array.from({ length: 60 }, (_, n) => document(`section-${n}`, n)),
      { ...document("other"), route: "/topics/other" },
    ];
    const result = search(hits, 2);
    expect(result).toHaveLength(2);
    expect(result.map((group) => group.canonicalHref).sort()).toEqual([
      "/playbook/topics/delivery/",
      "/playbook/topics/other/",
    ]);
    expect(result.find((group) => group.canonicalHref.includes("delivery"))?.sections).toHaveLength(
      60
    );
    expect(search(hits, 0)).toEqual([]);
  });
  test("same titles and related objects remain independent without score accumulation", () => {
    const result = search([
      document("weak", 0),
      document("weak2", 1),
      {
        ...document("strong", undefined),
        route: "/topics/other",
        title: "release release release",
      },
      { ...document("policy"), route: "/policies/delivery" },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].canonicalHref).toBe("/playbook/topics/other/");
    expect(result.find((group) => group.type === "policy")?.title).toBe("Related policy");
  });
  test("unknown sections use a real page target, while a foreign object rejects the source", () => {
    const [group] = search([{ ...document("invalid", 0), section_id: "missing" }]);
    expect(group.href).toBe(group.canonicalHref);
    expect(group.sections).toEqual([]);
    expect(() => search([{ ...document("foreign"), route: "/topics/hidden" }])).toThrow(
      "当前版本之外"
    );
  });
  test("display metadata contains canonical catalog titles, policy headings and no source bodies", () => {
    const metadata = createPlaybookSearchPages(publicFixtureCatalog);
    expect(metadata.find((page) => page.href === "/playbook/topics/delivery/")?.title).toBe(
      publicFixtureCatalog.topic_details[0].item.token
    );
    expect(
      metadata
        .filter((page) => page.type === "policy")
        .some((page) => page.sections.some((section) => section.title === "手动安装"))
    ).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain("instruction_markdown");
  });
});
