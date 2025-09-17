import { describe, expect, it, mock } from "bun:test";
import { parseContentTags } from "@/lib/tag-parser";
import {
  extractTitle,
  generateMemoFilename,
  generateNanoidSlug,
  generateTitleSlug,
  mergeFrontmatterAndInlineTags,
} from "../utils";

// Mock nanoid for predictable testing in this file
let mockCounter = 0;
mock.module("nanoid", () => ({
  nanoid: mock((length: number = 8) => {
    // Generate a predictable but unique string based on length and counter
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
    let result = "";
    const seed = mockCounter++;
    for (let i = 0; i < length; i++) {
      result += chars[(seed + i) % chars.length];
    }
    return result;
  }),
}));

describe("Memo Utils", () => {
  describe("generateNanoidSlug", () => {
    it("should generate slug with default length of 8", () => {
      const slug = generateNanoidSlug();
      expect(slug).toHaveLength(8);
      expect(slug).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("should generate slug with custom length", () => {
      const slug = generateNanoidSlug(12);
      expect(slug).toHaveLength(12);
      expect(slug).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    it("should generate unique slugs", () => {
      const slug1 = generateNanoidSlug();
      const slug2 = generateNanoidSlug();
      expect(slug1).not.toBe(slug2);
    });
  });

  describe("generateTitleSlug", () => {
    it("should convert English title to slug", () => {
      const slug = generateTitleSlug("React Learning Notes");
      expect(slug).toBe("react-learning-notes");
    });

    it("should convert Chinese title to slug", () => {
      const slug = generateTitleSlug("React学习笔记");
      expect(slug).toMatch(/react.*xue.*xi.*bi.*ji/);
    });

    it("should handle empty title", () => {
      const slug = generateTitleSlug("");
      expect(slug).toBe("");
    });

    it("should handle special characters", () => {
      const slug = generateTitleSlug("Hello, World! @#$%");
      expect(slug).toBe("hello-world-usd");
    });
  });

  describe("extractTitle", () => {
    it("should extract title from frontmatter", () => {
      const frontmatter = { title: "Test Title" };
      const body = "# Body Title\n\nContent";
      const filePath = "test.md";

      const title = extractTitle(frontmatter, body, filePath);
      expect(title).toBe("Test Title");
    });

    it("should extract H1 title from body when no frontmatter title", () => {
      const frontmatter = {};
      const body = "# React Learning\n\nContent with #tags";
      const filePath = "test.md";

      const title = extractTitle(frontmatter, body, filePath);
      expect(title).toBe("React Learning");
    });

    it("should extract H2 title when no H1", () => {
      const frontmatter = {};
      const body = "## Vue Components\n\nContent";
      const filePath = "test.md";

      const title = extractTitle(frontmatter, body, filePath);
      expect(title).toBe("Vue Components");
    });

    it("should extract titles by priority H1 > H2 > ... > H7", () => {
      const frontmatter = {};
      const body = "### H3 Title\n\n## H2 Title\n\n# H1 Title\n\nContent";
      const filePath = "test.md";

      const title = extractTitle(frontmatter, body, filePath);
      expect(title).toBe("H1 Title");
    });

    it("should use filename when no title found", () => {
      const frontmatter = {};
      const body = "Just content without titles";
      const filePath = "2024-01-01-my-post.md";

      const title = extractTitle(frontmatter, body, filePath);
      expect(title).toBe("my post");
    });
  });

  describe("parseContentTags (inline tags)", () => {
    it("should extract inline tags from content", () => {
      const content = "This is content with #tag1 and #tag2";
      const tags = parseContentTags(content).tags.map((t) => t.name);
      expect(tags).toEqual(["tag1", "tag2"]);
    });

    it("should extract Chinese tags", () => {
      const content = "内容包含 #技术 和 #学习 标签";
      const tags = parseContentTags(content).tags.map((t) => t.name);
      expect(tags).toEqual(["技术", "学习"]);
    });

    it("should not extract URL hashes", () => {
      const content = "Visit https://example.com#section and #realtag";
      const tags = parseContentTags(content).tags.map((t) => t.name);
      expect(tags).toEqual(["realtag"]);
    });

    it("should handle tags with hyphens and underscores", () => {
      const content = "Tags: #front-end #back_end #full-stack";
      const tags = parseContentTags(content).tags.map((t) => t.name);
      expect(tags).toEqual(["front-end", "back_end", "full-stack"]);
    });

    it("should support hierarchical tags", () => {
      const content = "Today #编程/Git and #学习/算法";
      const tags = parseContentTags(content).tags.map((t) => t.name);
      expect(tags).toEqual(["编程/Git", "学习/算法"]);
    });

    it("should deduplicate tags", () => {
      const content = "Content with #tag1 and #tag1 again";
      const tags = parseContentTags(content).tags.map((t) => t.name);
      expect(tags).toEqual(["tag1"]);
    });

    it("should return empty array for content without tags", () => {
      const content = "Content without any tags";
      const tags = parseContentTags(content).tags.map((t) => t.name);
      expect(tags).toEqual([]);
    });
  });

  describe("mergeFrontmatterAndInlineTags", () => {
    it("should merge frontmatter and inline tags", () => {
      const frontmatter = { tags: ["frontend", "react"] };
      const body = "Content with #javascript and #typescript";

      const tags = mergeFrontmatterAndInlineTags(frontmatter, body);
      expect(tags).toEqual(["frontend", "react", "javascript", "typescript"]);
    });

    it("should deduplicate merged tags", () => {
      const frontmatter = { tags: ["react", "frontend"] };
      const body = "Content with #react and #vue";

      const tags = mergeFrontmatterAndInlineTags(frontmatter, body);
      expect(tags).toEqual(["react", "frontend", "vue"]);
    });

    it("should handle empty frontmatter tags", () => {
      const frontmatter = {};
      const body = "Content with #tag1 and #tag2";

      const tags = mergeFrontmatterAndInlineTags(frontmatter, body);
      expect(tags).toEqual(["tag1", "tag2"]);
    });

    it("should handle content without inline tags", () => {
      const frontmatter = { tags: ["tag1", "tag2"] };
      const body = "Content without inline tags";

      const tags = mergeFrontmatterAndInlineTags(frontmatter, body);
      expect(tags).toEqual(["tag1", "tag2"]);
    });

    it("should merge hierarchical inline tags", () => {
      const frontmatter = { tags: ["编程"] };
      const body = "Content with #编程/Git and #学习/算法";

      const tags = mergeFrontmatterAndInlineTags(frontmatter, body);
      expect(tags).toEqual(["编程", "编程/Git", "学习/算法"]);
    });
  });

  describe("generateMemoFilename", () => {
    it("should generate filename with H1 title", () => {
      const content = "# React Learning\n\nContent with #react";
      const filename = generateMemoFilename(content);
      expect(filename).toMatch(/^\d{8}_react-learning\.md$/);
    });

    it("should generate filename with H2 title when no H1", () => {
      const content = "## Vue Components\n\nContent";
      const filename = generateMemoFilename(content);
      expect(filename).toMatch(/^\d{8}_vue-components\.md$/);
    });

    it("should use nanoid when no title found", () => {
      const content = "Content without title #random";
      const filename = generateMemoFilename(content);
      expect(filename).toMatch(/^\d{8}_[a-zA-Z0-9_-]{8}\.md$/);
    });

    it("should use provided title parameter", () => {
      const content = "Some content";
      const title = "Custom Title";
      const filename = generateMemoFilename(content, title);
      expect(filename).toMatch(/^\d{8}_custom-title\.md$/);
    });

    it("should use custom timestamp", () => {
      const content = "# Test Title";
      const timestamp = new Date("2023-12-25T15:45:00Z").getTime();
      const filename = generateMemoFilename(content, undefined, timestamp);
      expect(filename).toMatch(/^20231225_test-title\.md$/);
    });

    it("should handle empty title slug by using nanoid", () => {
      const content = "# !!!"; // Title that becomes empty slug
      const filename = generateMemoFilename(content);
      expect(filename).toMatch(/^\d{8}_[a-zA-Z0-9_-]{8}\.md$/);
    });
  });
});
