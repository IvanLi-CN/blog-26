import { describe, expect, it } from "bun:test";
import { parseContentTags, removeInlineTags } from "../tag-parser";

describe("tag-parser", () => {
  it("should extract hierarchical tags with positions", () => {
    const content = `标题\n\n讨论 #编程/Git 与 #学习/算法\n第二行包含 #工具/CLI 标签`;
    const result = parseContentTags(content);

    expect(result.tags).toHaveLength(3);

    const programming = result.tags.find((tag) => tag.name === "编程/Git");
    expect(programming).toBeDefined();
    expect(programming?.position).toMatchObject({ line: 3, column: 4, length: 7 });

    const learning = result.tags.find((tag) => tag.name === "学习/算法");
    expect(learning).toBeDefined();
    expect(learning?.position.line).toBe(3);
    expect(learning?.position.column).toBeGreaterThan(4);

    const tooling = result.tags.find((tag) => tag.name === "工具/CLI");
    expect(tooling).toBeDefined();
    expect(tooling?.position).toMatchObject({ line: 4, column: 7 });

    expect(result.cleanedContent).toBe(`标题\n\n讨论 与\n第二行包含 标签`);
  });

  it("should ignore URL hash fragments", () => {
    const content = "查看 https://example.com#section 并记录 #笔记";
    const result = parseContentTags(content);

    expect(result.tags.map((tag) => tag.name)).toEqual(["笔记"]);
  });

  it("should remove leading tag-only lines", () => {
    const content = `#标签/演示\n\n实际内容开始`;
    const cleaned = removeInlineTags(content);
    expect(cleaned).toBe("实际内容开始");
  });

  it("should not leave stray backslash when line starts with escaped tag", () => {
    const content = `Environment=LEGO_DISABLE_CNAME_SUPPORT=true\n\n\\#HomeLab #Software/Traefik #DevOps/Edgeone #DevOps/DNSPOD`;
    const result = parseContentTags(content);

    // 标签应当被正常解析
    expect(result.tags.map((t) => t.name)).toEqual([
      "HomeLab",
      "Software/Traefik",
      "DevOps/Edgeone",
      "DevOps/DNSPOD",
    ]);

    // 清理后的正文不应残留单独的 "\" 行
    expect(result.cleanedContent).toBe("Environment=LEGO_DISABLE_CNAME_SUPPORT=true");
  });
});
