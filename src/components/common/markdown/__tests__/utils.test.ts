import { describe, expect, it } from "bun:test";
import { removeTagsFromContent } from "../utils";

describe("Markdown Utils", () => {
  describe("removeTagsFromContent", () => {
    it("should remove inline tags from content", () => {
      const content = "This is content with #tag1 and #tag2";
      const result = removeTagsFromContent(content);
      expect(result).toBe("This is content with and");
    });

    it("should remove Chinese inline tags", () => {
      const content = "这是包含 #技术 和 #学习 标签的内容";
      const result = removeTagsFromContent(content);
      expect(result).toBe("这是包含 和 标签的内容");
    });

    it("should preserve URL hashes", () => {
      const content = "Visit https://example.com#section and #realtag";
      const result = removeTagsFromContent(content);
      expect(result).toBe("Visit https://example.com#section and");
    });

    it("should preserve www URL hashes", () => {
      const content = "Check www.example.com#hash and #tag here";
      const result = removeTagsFromContent(content);
      expect(result).toBe("Check www.example.com#hash and here");
    });

    it("should handle tags with hyphens and underscores", () => {
      const content = "Tags: #front-end #back_end #full-stack";
      const result = removeTagsFromContent(content);
      expect(result).toBe("Tags:");
    });

    it("should handle mixed content with URLs and tags", () => {
      const content = `# 技术文章

这是内容 #技术 #React，还有链接 https://example.com#hash

更多内容 #前端 和普通的#号。`;

      const result = removeTagsFromContent(content);
      expect(result).toBe(`# 技术文章

这是内容 ，还有链接 https://example.com#hash

更多内容 和普通的。`);
    });

    it("should handle tags at the beginning of content", () => {
      const content = "#tag1 This starts with a tag";
      const result = removeTagsFromContent(content);
      expect(result).toBe("This starts with a tag");
    });

    it("should handle tags at the end of content", () => {
      const content = "This ends with a tag #tag1";
      const result = removeTagsFromContent(content);
      expect(result).toBe("This ends with a tag");
    });

    it("should handle multiple consecutive tags", () => {
      const content = "Content with #tag1 #tag2 #tag3 multiple tags";
      const result = removeTagsFromContent(content);
      expect(result).toBe("Content with multiple tags");
    });

    it("should handle tags with punctuation after them", () => {
      const content = "Content with #tag1, #tag2. #tag3! More content";
      const result = removeTagsFromContent(content);
      expect(result).toBe("Content with , . ! More content");
    });

    it("should not remove invalid tag formats", () => {
      const content = "Content with # invalid #123invalid #-invalid tags";
      const result = removeTagsFromContent(content);
      expect(result).toBe("Content with # invalid tags");
    });

    it("should handle empty content", () => {
      const content = "";
      const result = removeTagsFromContent(content);
      expect(result).toBe("");
    });

    it("should handle content with only tags", () => {
      const content = "#tag1 #tag2 #tag3";
      const result = removeTagsFromContent(content);
      expect(result).toBe("");
    });

    it("should clean up extra whitespace", () => {
      const content = "Content   with   #tag1   and   #tag2   spacing";
      const result = removeTagsFromContent(content);
      expect(result).toBe("Content with and spacing");
    });

    it("should handle newlines and preserve structure", () => {
      const content = `Line 1 with #tag1
Line 2 with #tag2
Line 3 without tags`;

      const result = removeTagsFromContent(content);
      expect(result).toBe(`Line 1 with
Line 2 with
Line 3 without tags`);
    });

    it("should handle complex markdown with tags", () => {
      const content = `## Heading with #tag1

- List item with #tag2
- Another item

**Bold text** with #tag3 and *italic* text.`;

      const result = removeTagsFromContent(content);
      expect(result).toBe(`## Heading with

- List item with
- Another item

**Bold text** with and *italic* text.`);
    });

    it("should preserve code blocks with newlines", () => {
      const content = `# Code Example

\`\`\`javascript
function test() {
  console.log("hello");
  return true;
}
\`\`\`

More content with #tag1`;

      const result = removeTagsFromContent(content);
      expect(result).toBe(`# Code Example

\`\`\`javascript
function test() {
 console.log("hello");
 return true;
}
\`\`\`

More content with`);
    });

    it("should preserve hash symbols that are not tags", () => {
      const content = "Use # for headings, not #validtag or #123 numbers";
      const result = removeTagsFromContent(content);
      expect(result).toBe("Use # for headings, not or numbers");
    });
  });
});
