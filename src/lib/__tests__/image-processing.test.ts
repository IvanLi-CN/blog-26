import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  type ProcessInlineImagesOptions,
  processInlineImages,
  processInlineImagesCompat,
} from "../image-processing";

// Mock fetch for testing
const mockFetch = mock(() => Promise.resolve(new Response("OK", { status: 200 })));
global.fetch = mockFetch;

// Mock nanoid for predictable testing
mock.module("nanoid", () => ({
  nanoid: mock(() => "test1234"),
}));

describe("processInlineImages", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    delete process.env.PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  afterEach(() => {
    mockFetch.mockClear();
    delete process.env.PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  const defaultOptions: ProcessInlineImagesOptions = {
    contentSource: "webdav",
    articlePath: "blog/test-article.md",
    returnFormat: "relative",
    enableLogging: false,
  };

  describe("基本功能测试", () => {
    it("应该处理单个 Base64 图片", async () => {
      const content =
        "这是一张图片：![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      const result = await processInlineImages(content, defaultOptions);

      expect(result.hasChanges).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.content).toContain("![test](./assets/test-article-test1234.png)");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("应该处理多个 Base64 图片", async () => {
      const content = `
        第一张图：![img1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)
        第二张图：![img2](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA==)
      `;

      const result = await processInlineImages(content, defaultOptions);

      expect(result.hasChanges).toBe(true);
      expect(result.processedCount).toBe(2);
      expect(result.content).toContain("![img1](./assets/test-article-test1234.png)");
      expect(result.content).toContain("![img2](./assets/test-article-test1234.jpeg)");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("应该正确处理不同的返回格式", async () => {
      const content =
        "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      // 测试 API 路径格式
      const apiResult = await processInlineImages(content, {
        ...defaultOptions,
        returnFormat: "api",
      });

      expect(apiResult.content).toContain(
        "![test](/api/files/webdav/blog/assets/test-article-test1234.png)"
      );

      // 测试相对路径格式
      const relativeResult = await processInlineImages(content, {
        ...defaultOptions,
        returnFormat: "relative",
      });

      expect(relativeResult.content).toContain("![test](./assets/test-article-test1234.png)");
    });

    it("应该将上传请求重写到配置的公开后端域名", async () => {
      process.env.PUBLIC_API_BASE_URL = "https://api.example.test/";
      const content =
        "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      await processInlineImages(content, defaultOptions);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        "https://api.example.test/api/files/webdav/blog/assets/test-article-test1234.png"
      );
      expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({
        credentials: "include",
      });
    });
  });

  describe("幂等性测试", () => {
    it("应该跳过已处理的相对路径图片", async () => {
      const content = "已处理的图片：![test](./assets/existing-image.png)";

      const result = await processInlineImages(content, defaultOptions);

      expect(result.hasChanges).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.content).toBe(content);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("应该跳过已处理的 API 路径图片", async () => {
      const content = "已处理的图片：![test](/api/files/webdav/blog/assets/existing-image.png)";

      const result = await processInlineImages(content, defaultOptions);

      expect(result.hasChanges).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.content).toBe(content);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("应该跳过外部 URL 图片", async () => {
      const content = "外部图片：![test](https://example.com/image.png)";

      const result = await processInlineImages(content, defaultOptions);

      expect(result.hasChanges).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.content).toBe(content);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("应该只处理混合内容中的 Base64 图片", async () => {
      const content = `
        已处理图片：![existing](./assets/existing.png)
        Base64图片：![new](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)
        外部图片：![external](https://example.com/image.png)
      `;

      const result = await processInlineImages(content, defaultOptions);

      expect(result.hasChanges).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(result.content).toContain("![existing](./assets/existing.png)");
      expect(result.content).toContain("![new](./assets/test-article-test1234.png)");
      expect(result.content).toContain("![external](https://example.com/image.png)");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("应该实现真正的幂等性：重复处理已转换内容", async () => {
      const originalContent =
        "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      // 第一次处理
      const firstResult = await processInlineImages(originalContent, defaultOptions);
      expect(firstResult.hasChanges).toBe(true);
      expect(firstResult.processedCount).toBe(1);

      // 第二次处理已转换的内容
      const secondResult = await processInlineImages(firstResult.content, defaultOptions);
      expect(secondResult.hasChanges).toBe(false);
      expect(secondResult.processedCount).toBe(0);
      expect(secondResult.content).toBe(firstResult.content);
    });
  });

  describe("数据完整性测试", () => {
    it("应该正确验证 Base64 数据", async () => {
      const invalidContent = "![invalid](data:image/png;base64,invalid-base64-data!!!)";

      const result = await processInlineImages(invalidContent, defaultOptions);

      expect(result.hasChanges).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("无效的 Base64 数据");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("应该正确处理不同的图片类型", async () => {
      const content = `
        PNG: ![png](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)
        JPEG: ![jpeg](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA==)
        WebP: ![webp](data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA)
      `;

      const result = await processInlineImages(content, defaultOptions);

      expect(result.processedCount).toBe(3);
      expect(result.content).toContain(".png)");
      expect(result.content).toContain(".jpeg)");
      expect(result.content).toContain(".webp)");
    });

    it("应该正确处理转义字符", async () => {
      const escapedContent =
        "\\![test\\]\\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==\\)";

      const result = await processInlineImages(escapedContent, defaultOptions);

      expect(result.hasChanges).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(result.content).toContain("![test](./assets/test-article-test1234.png)");
    });
  });

  describe("边界情况测试", () => {
    it("应该处理空内容", async () => {
      const result = await processInlineImages("", defaultOptions);

      expect(result.hasChanges).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.content).toBe("");
    });

    it("应该处理 null 和 undefined", async () => {
      const nullResult = await processInlineImages(null as any, defaultOptions);
      const undefinedResult = await processInlineImages(undefined as any, defaultOptions);

      expect(nullResult.hasChanges).toBe(false);
      expect(undefinedResult.hasChanges).toBe(false);
    });

    it("应该处理没有图片的内容", async () => {
      const content = "这是一段普通的文本，没有任何图片。";

      const result = await processInlineImages(content, defaultOptions);

      expect(result.hasChanges).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.content).toBe(content);
    });

    it("应该处理上传失败的情况", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(new Response("Upload failed", { status: 500 }))
      );

      const content =
        "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      const result = await processInlineImages(content, defaultOptions);

      expect(result.hasChanges).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("上传失败");
      expect(result.content).toBe(content); // 保持原内容不变
    });
  });

  describe("不同内容源测试", () => {
    it("应该正确处理 local 内容源", async () => {
      const content =
        "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      const result = await processInlineImages(content, {
        ...defaultOptions,
        contentSource: "local",
        returnFormat: "api",
      });

      expect(result.content).toContain("/api/files/local/");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/files/local/"),
        expect.any(Object)
      );
    });

    it("应该正确处理 webdav 内容源", async () => {
      const content =
        "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      const result = await processInlineImages(content, {
        ...defaultOptions,
        contentSource: "webdav",
        returnFormat: "api",
      });

      expect(result.content).toContain("/api/files/webdav/");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/files/webdav/"),
        expect.any(Object)
      );
    });
  });

  describe("文件路径生成测试", () => {
    it("应该正确处理不同的文章路径", async () => {
      const content =
        "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      // 测试根目录文件
      const rootResult = await processInlineImages(content, {
        ...defaultOptions,
        articlePath: "article.md",
      });
      expect(rootResult.content).toContain("./assets/article-test1234.png");

      // 测试子目录文件
      const subResult = await processInlineImages(content, {
        ...defaultOptions,
        articlePath: "blog/category/article.md",
      });
      expect(subResult.content).toContain("./assets/article-test1234.png");

      // 测试 __NEW__ 前缀
      const newResult = await processInlineImages(content, {
        ...defaultOptions,
        articlePath: "__NEW__blog/article.md",
      });
      expect(newResult.content).toContain("./assets/article-test1234.png");
    });

    it("应该正确处理自定义上传路径", async () => {
      const content =
        "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

      const result = await processInlineImages(content, {
        ...defaultOptions,
        uploadBasePath: "custom/upload/path",
        returnFormat: "api",
      });

      expect(result.content).toContain(
        "/api/files/webdav/custom/upload/path/test-article-test1234.png"
      );
    });
  });
});

describe("processInlineImagesCompat", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("应该提供向后兼容的接口", async () => {
    const content =
      "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

    const result = await processInlineImagesCompat(content, "webdav", "blog/test.md", "relative");

    expect(result).toContain("![test](./assets/test-test1234.png)");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("应该使用默认的相对路径格式", async () => {
    const content =
      "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

    const result = await processInlineImagesCompat(content, "webdav", "blog/test.md");

    expect(result).toContain("./assets/");
  });

  it("应该正确使用自定义 slug", async () => {
    const content =
      "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

    const result = await processInlineImagesCompat(
      content,
      "webdav",
      "blog/我想看看.md", // 中文文件名
      "relative",
      "i-wan-to-see-see" // 自定义 slug
    );

    expect(result).toContain("![test](./assets/i-wan-to-see-see-test1234.png)");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("应该处理问题案例：title 为 1.00 的情况", async () => {
    const content =
      "![1.00](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

    // 模拟 PostUniversalEditor 中的 slug 生成逻辑
    const title = "1.00";
    const generatedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "");

    console.log("🔍 测试中生成的 slug:", generatedSlug);

    const result = await processInlineImagesCompat(
      content,
      "webdav",
      "blog/1.00.md",
      "relative",
      generatedSlug // 传递生成的 slug
    );

    console.log("🔍 测试结果:", result);

    // 应该使用传入的 slug，而不是生成 content-时间戳
    expect(result).toContain(`![1.00](./assets/${generatedSlug}-test1234.png)`);
    expect(result).not.toContain("content-");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("应该处理空 slug 的情况", async () => {
    const content =
      "![test](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

    const result = await processInlineImagesCompat(
      content,
      "webdav",
      "blog/1.00.md",
      "relative",
      "" // 空 slug
    );

    console.log("🔍 空 slug 测试结果:", result);

    // 应该使用从路径生成的 slug
    expect(result).toContain("![test](./assets/1.00-test1234.png)");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("应该修复 frontmatter 解析问题：正确使用文章中的 slug", async () => {
    const content =
      "![我想看看](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)";

    // 这是修复后的正确行为：传递从 frontmatter 解析出的正确 slug
    const result = await processInlineImagesCompat(
      content,
      "webdav",
      "blog/我想看看.md",
      "relative",
      "i-wan-to-see-see" // 从 frontmatter 中正确解析的 slug
    );

    console.log("🔍 修复验证测试结果:", result);

    // 应该使用正确的 slug，而不是 content-时间戳
    expect(result).toContain("![我想看看](./assets/i-wan-to-see-see-test1234.png)");
    expect(result).not.toContain("content-");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
