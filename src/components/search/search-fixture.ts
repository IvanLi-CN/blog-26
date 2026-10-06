import type { SearchResultGroup } from "./search-model";

export function groupedSearchFixture(sectionCount = 5): SearchResultGroup {
  const canonicalHref = "/playbook/topics/manual-version-release-delivery/";
  const snippets = [
    "发布时显式选择一次 release target，让各个 workflow 使用同一版本。",
    "最新版本，并更新 package.json 中的版本。",
    "版本策略需要先检查 source SHA、manifest 和发布目标。",
    "    release --upgrade --target semver\n        package.json 版本必须保持一致。",
    "发布失败后保留日志，确认版本绑定后再重试。",
  ];
  const headings = ["Definition", "When to use", "Habits / defaults", "Commands", "Failure modes"];
  return {
    slug: "manual-version-release-delivery",
    source: "playbook",
    type: "topic",
    contentKey: JSON.stringify(["playbook", "topic", canonicalHref]),
    canonicalHref,
    title: "Manual version release delivery",
    href: sectionCount === 1 ? `${canonicalHref}#section-0` : canonicalHref,
    snippet:
      sectionCount === 1 ? snippets[0] : "手动确认一次发布目标，让版本、产物和部署使用同一身份。",
    final: 4,
    sections: Array.from({ length: sectionCount }, (_, order) => ({
      href: `${canonicalHref}#section-${order}`,
      title: headings[order] ?? `Section ${order}`,
      snippet: snippets[order] ?? "版本发布匹配上下文。",
      score: 4 - order * 0.1,
      order,
    })),
  };
}
