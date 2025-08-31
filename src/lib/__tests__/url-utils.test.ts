import { describe, expect, it } from "bun:test";
import { generateContentUrl, generateMemoUrl, generatePostUrl } from "../url-utils";

describe("generateMemoUrl", () => {
  describe("基本功能", () => {
    it("应该处理简单的英文文件名", () => {
      const result = generateMemoUrl("memos/simple-memo.md");
      expect(result).toBe("/memos/simple-memo");
    });

    it("应该处理带时间戳的文件名", () => {
      const result = generateMemoUrl("memos/20250806_today-notes.md");
      expect(result).toBe("/memos/20250806-today-notes");
    });

    it("应该移除 .md 扩展名", () => {
      const result = generateMemoUrl("memos/test-file.md");
      expect(result).toBe("/memos/test-file");
    });
  });

  describe("中文转拼音映射", () => {
    it("应该正确转换常见中文字符", () => {
      const result = generateMemoUrl("memos/心羽实时演示.md");
      expect(result).toBe("/memos/xin1-yu3-shi2-shi2-yan3-shi4");
    });

    it("应该处理包含时间戳的中文文件名", () => {
      const result = generateMemoUrl("memos/20250806_今日摄影作品分享.md");
      expect(result).toBe("/memos/20250806-jin1-ri4-she4-ying3-zuo4-pin3-fen1-xiang3");
    });

    it("应该处理复杂的中文文件名", () => {
      const result = generateMemoUrl("memos/心羽实时演示增量数据同步-1756460268805.md");
      expect(result).toBe(
        "/memos/xin1-yu3-shi2-shi2-yan3-shi4-zeng1-liang4-shu4-ju4-tong2-bu4-1756460268805"
      );
    });

    it("应该处理技术相关的中文词汇", () => {
      const result = generateMemoUrl("memos/Docker_容器化部署实践.md");
      expect(result).toBe("/memos/docker-rong2-qi4-hua4-bu4-shu3-shi2-jian4");
    });
  });

  describe("特殊字符处理", () => {
    it("应该将下划线转换为连字符", () => {
      const result = generateMemoUrl("memos/test_file_name.md");
      expect(result).toBe("/memos/test-file-name");
    });

    it("应该处理多个连续的特殊字符", () => {
      const result = generateMemoUrl("memos/test___multiple___underscores.md");
      expect(result).toBe("/memos/test-multiple-underscores");
    });

    it("应该移除首尾的连字符", () => {
      const result = generateMemoUrl("memos/_leading_and_trailing_.md");
      expect(result).toBe("/memos/leading-and-trailing");
    });

    it("应该处理空格和其他特殊字符", () => {
      const result = generateMemoUrl("memos/test file with spaces & symbols!.md");
      expect(result).toBe("/memos/test-file-with-spaces-symbols");
    });
  });

  describe("路径处理", () => {
    it("应该处理完整路径", () => {
      const result = generateMemoUrl("/memos/20250806_今日摄影作品分享.md");
      expect(result).toBe("/memos/20250806-jin1-ri4-she4-ying3-zuo4-pin3-fen1-xiang3");
    });

    it("应该处理不带 memos/ 前缀的路径", () => {
      const result = generateMemoUrl("20250806_今日摄影作品分享.md");
      expect(result).toBe("/memos/20250806-jin1-ri4-she4-ying3-zuo4-pin3-fen1-xiang3");
    });

    it("应该处理嵌套路径", () => {
      const result = generateMemoUrl("memos/subfolder/test-memo.md");
      expect(result).toBe("/memos/test-memo");
    });
  });

  describe("边界情况", () => {
    it("应该处理空文件名", () => {
      const result = generateMemoUrl("");
      expect(result).toBe("/memos/unknown");
    });

    it("应该处理只有扩展名的文件", () => {
      const result = generateMemoUrl(".md");
      expect(result).toBe("/memos/unknown");
    });

    it("应该处理没有扩展名的文件", () => {
      const result = generateMemoUrl("memos/test-file");
      expect(result).toBe("/memos/test-file");
    });

    it("应该处理包含数字和特殊字符的复杂文件名", () => {
      const result = generateMemoUrl("memos/e2e测试闪念-增量数据同步功能验证-1756478744371.md");
      expect(result).toBe(
        "/memos/e2ece4-shi4-zeng1-liang4-shu4-ju4-tong2-bu4-gong1-neng2-yan4-zheng4-1756478744371"
      );
    });
  });

  describe("错误处理", () => {
    it("应该处理异常情况并返回默认值", () => {
      // 模拟可能导致错误的输入
      const result = generateMemoUrl("memos/\x00invalid\x00characters.md");
      expect(result).toMatch(/^\/memos\//);
    });
  });
});

describe("generatePostUrl", () => {
  describe("基本功能", () => {
    it("应该使用 frontmatter 中的 slug", () => {
      const frontmatter = { slug: "my-awesome-post" };
      const result = generatePostUrl(frontmatter);
      expect(result).toBe("/posts/my-awesome-post");
    });

    it("应该从标题生成 slug", () => {
      const frontmatter = { title: "My Awesome Post" };
      const result = generatePostUrl(frontmatter);
      expect(result).toBe("/posts/my-awesome-post");
    });

    it("应该处理中文标题", () => {
      const frontmatter = { title: "Vue3 组合式 API 深入探讨" };
      const result = generatePostUrl(frontmatter);
      expect(result).toBe("/posts/vue3-api-");
    });
  });

  describe("fallback 处理", () => {
    it("应该使用文件路径作为 fallback", () => {
      const frontmatter = {};
      const filePath = "posts/my-post-file.md";
      const result = generatePostUrl(frontmatter, filePath);
      expect(result).toBe("/posts/my-post-file");
    });

    it("应该处理空的 frontmatter", () => {
      const frontmatter = {};
      const result = generatePostUrl(frontmatter);
      expect(result).toBe("/posts/untitled");
    });

    it("应该处理 null/undefined frontmatter", () => {
      const result1 = generatePostUrl(null as any);
      const result2 = generatePostUrl(undefined as any);
      expect(result1).toBe("/posts/untitled");
      expect(result2).toBe("/posts/untitled");
    });
  });

  describe("特殊字符处理", () => {
    it("应该清理标题中的特殊字符", () => {
      const frontmatter = { title: "My Post: A Deep Dive & Analysis!" };
      const result = generatePostUrl(frontmatter);
      expect(result).toBe("/posts/my-post-a-deep-dive-analysis");
    });

    it("应该处理多个空格", () => {
      const frontmatter = { title: "Multiple    Spaces    Here" };
      const result = generatePostUrl(frontmatter);
      expect(result).toBe("/posts/multiple-spaces-here");
    });
  });

  describe("错误处理", () => {
    it("应该处理异常情况", () => {
      const frontmatter = { title: "\x00invalid\x00" };
      const result = generatePostUrl(frontmatter);
      expect(result).toMatch(/^\/posts\//);
    });
  });
});

describe("generateContentUrl", () => {
  describe("memo 类型", () => {
    it("应该正确处理 memo 类型", () => {
      const result = generateContentUrl("memo", "memos/test-memo.md");
      expect(result).toBe("/memos/test-memo");
    });

    it("应该处理中文 memo", () => {
      const result = generateContentUrl("memo", "memos/20250806_今日摄影作品分享.md");
      expect(result).toBe("/memos/20250806-jin1-ri4-she4-ying3-zuo4-pin3-fen1-xiang3");
    });
  });

  describe("post 类型", () => {
    it("应该正确处理 post 类型", () => {
      const frontmatter = { slug: "my-post" };
      const result = generateContentUrl("post", frontmatter);
      expect(result).toBe("/posts/my-post");
    });

    it("应该传递 filePath 参数", () => {
      const frontmatter = {};
      const filePath = "posts/my-post.md";
      const result = generateContentUrl("post", frontmatter, filePath);
      expect(result).toBe("/posts/my-post");
    });
  });

  describe("类型验证", () => {
    it("应该正确区分不同的内容类型", () => {
      const memoResult = generateContentUrl("memo", "test.md");
      const postResult = generateContentUrl("post", { title: "test" });

      expect(memoResult).toMatch(/^\/memos\//);
      expect(postResult).toMatch(/^\/posts\//);
    });
  });
});
