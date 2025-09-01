/**
 * 图片处理幂等性端到端测试
 *
 * 验证 Base64 内联图片转换功能的幂等性和数据完整性
 */

import { expect, test } from "@playwright/test";

// 测试用的小图片 Base64 数据
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

test.describe("图片处理幂等性测试", () => {
  test.beforeEach(async ({ page }) => {
    // 导航到编辑器页面
    await page.goto("/admin/posts");
    await page.waitForLoadState("networkidle");
  });

  test("应该正确处理 Base64 图片并保持幂等性", async ({ page }) => {
    // 创建新文章
    await page.click('[data-testid="create-new-post"]');
    await page.waitForSelector('[data-testid="editor-content"]');

    // 输入包含 Base64 图片的内容
    const originalContent = `# 测试文章

这是一张测试图片：![test](data:image/png;base64,${TEST_IMAGE_BASE64})

文章内容结束。`;

    await page.fill('[data-testid="post-title"]', "图片处理测试文章");

    // 切换到源码编辑模式
    await page.click('[data-testid="editor-mode-source"]');
    await page.fill('[data-testid="source-editor"]', originalContent);

    // 保存文章
    await page.click('[data-testid="save-post"]');
    await page.waitForSelector('[data-testid="save-success"]');

    // 验证图片已被转换
    const savedContent = await page.inputValue('[data-testid="source-editor"]');
    expect(savedContent).toContain("./assets/");
    expect(savedContent).toContain(".png");
    expect(savedContent).not.toContain("data:image/png;base64");

    // 记录第一次保存后的内容
    const firstSaveContent = savedContent;

    // 再次保存（测试幂等性）
    await page.click('[data-testid="save-post"]');
    await page.waitForSelector('[data-testid="save-success"]');

    // 验证内容没有变化（幂等性）
    const secondSaveContent = await page.inputValue('[data-testid="source-editor"]');
    expect(secondSaveContent).toBe(firstSaveContent);

    // 切换到预览模式验证图片显示
    await page.click('[data-testid="editor-mode-preview"]');
    await page.waitForSelector('[data-testid="preview-content"]');

    // 验证图片在预览中正确显示
    const images = await page.locator('[data-testid="preview-content"] img').all();
    expect(images).toHaveLength(1);

    const imageSrc = await images[0].getAttribute("src");
    expect(imageSrc).toContain("/api/files/");
    expect(imageSrc).toContain(".png");
  });

  test("应该正确处理混合内容（Base64 + 已处理图片）", async ({ page }) => {
    // 创建新文章
    await page.click('[data-testid="create-new-post"]');
    await page.waitForSelector('[data-testid="editor-content"]');

    // 输入混合内容
    const mixedContent = `# 混合内容测试

已处理的图片：![existing](./assets/existing-image.png)

新的 Base64 图片：![new](data:image/png;base64,${TEST_IMAGE_BASE64})

外部图片：![external](https://example.com/image.png)`;

    await page.fill('[data-testid="post-title"]', "混合内容测试文章");
    await page.click('[data-testid="editor-mode-source"]');
    await page.fill('[data-testid="source-editor"]', mixedContent);

    // 保存文章
    await page.click('[data-testid="save-post"]');
    await page.waitForSelector('[data-testid="save-success"]');

    // 验证处理结果
    const savedContent = await page.inputValue('[data-testid="source-editor"]');

    // 已处理的图片应该保持不变
    expect(savedContent).toContain("![existing](./assets/existing-image.png)");

    // 外部图片应该保持不变
    expect(savedContent).toContain("![external](https://example.com/image.png)");

    // Base64 图片应该被转换
    expect(savedContent).toMatch(/!\[new\]\(\.\/assets\/[^)]+\.png\)/);
    expect(savedContent).not.toContain("data:image/png;base64");

    // 验证只有一个 Base64 图片被转换
    const assetImages = savedContent.match(/!\[[^\]]*\]\(\.\/assets\/[^)]+\)/g);
    expect(assetImages).toHaveLength(2); // existing + new
  });

  test("应该正确处理多个 Base64 图片", async ({ page }) => {
    // 创建新文章
    await page.click('[data-testid="create-new-post"]');
    await page.waitForSelector('[data-testid="editor-content"]');

    // 输入多个 Base64 图片
    const multiImageContent = `# 多图片测试

第一张图：![img1](data:image/png;base64,${TEST_IMAGE_BASE64})

第二张图：![img2](data:image/png;base64,${TEST_IMAGE_BASE64})

第三张图：![img3](data:image/png;base64,${TEST_IMAGE_BASE64})`;

    await page.fill('[data-testid="post-title"]', "多图片测试文章");
    await page.click('[data-testid="editor-mode-source"]');
    await page.fill('[data-testid="source-editor"]', multiImageContent);

    // 保存文章
    await page.click('[data-testid="save-post"]');
    await page.waitForSelector('[data-testid="save-success"]');

    // 验证所有图片都被转换
    const savedContent = await page.inputValue('[data-testid="source-editor"]');

    // 应该没有 Base64 图片
    expect(savedContent).not.toContain("data:image/png;base64");

    // 应该有3个转换后的图片
    const assetImages = savedContent.match(/!\[[^\]]*\]\(\.\/assets\/[^)]+\.png\)/g);
    expect(assetImages).toHaveLength(3);

    // 每个图片应该有唯一的文件名
    const filenames = assetImages
      ?.map((img) => {
        const match = img.match(/\/assets\/([^)]+\.png)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    expect(new Set(filenames).size).toBe(3); // 所有文件名都应该是唯一的
  });

  test("应该正确处理转义字符", async ({ page }) => {
    // 创建新文章
    await page.click('[data-testid="create-new-post"]');
    await page.waitForSelector('[data-testid="editor-content"]');

    // 输入包含转义字符的内容（模拟 Milkdown 编辑器的输出）
    const escapedContent = `# 转义字符测试

转义的图片：\\![test\\]\\(data:image/png;base64,${TEST_IMAGE_BASE64}\\)`;

    await page.fill('[data-testid="post-title"]', "转义字符测试文章");
    await page.click('[data-testid="editor-mode-source"]');
    await page.fill('[data-testid="source-editor"]', escapedContent);

    // 保存文章
    await page.click('[data-testid="save-post"]');
    await page.waitForSelector('[data-testid="save-success"]');

    // 验证转义字符被正确处理
    const savedContent = await page.inputValue('[data-testid="source-editor"]');

    // 应该没有 Base64 图片
    expect(savedContent).not.toContain("data:image/png;base64");

    // 应该有转换后的图片，且没有转义字符
    expect(savedContent).toMatch(/!\[test\]\(\.\/assets\/[^)]+\.png\)/);
    expect(savedContent).not.toContain("\\!");
    expect(savedContent).not.toContain("\\[");
    expect(savedContent).not.toContain("\\]");
    expect(savedContent).not.toContain("\\(");
    expect(savedContent).not.toContain("\\)");
  });

  test("应该在网络错误时保持原内容不变", async ({ page }) => {
    // 拦截上传请求，模拟网络错误
    await page.route("/api/files/**", (route) => {
      route.abort("failed");
    });

    // 创建新文章
    await page.click('[data-testid="create-new-post"]');
    await page.waitForSelector('[data-testid="editor-content"]');

    const originalContent = `# 网络错误测试

这是一张图片：![test](data:image/png;base64,${TEST_IMAGE_BASE64})`;

    await page.fill('[data-testid="post-title"]', "网络错误测试文章");
    await page.click('[data-testid="editor-mode-source"]');
    await page.fill('[data-testid="source-editor"]', originalContent);

    // 尝试保存文章（应该失败）
    await page.click('[data-testid="save-post"]');

    // 验证显示错误信息
    await page.waitForSelector('[data-testid="save-error"]');

    // 验证原内容保持不变
    const contentAfterError = await page.inputValue('[data-testid="source-editor"]');
    expect(contentAfterError).toBe(originalContent);
    expect(contentAfterError).toContain("data:image/png;base64");
  });
});

test.describe("图片显示一致性测试", () => {
  test("图片在不同编辑器模式间显示一致", async ({ page }) => {
    // 创建包含已转换图片的文章
    await page.goto("/admin/posts");
    await page.click('[data-testid="create-new-post"]');
    await page.waitForSelector('[data-testid="editor-content"]');

    // 先保存一个包含 Base64 图片的文章
    const originalContent = `# 显示一致性测试

测试图片：![test](data:image/png;base64,${TEST_IMAGE_BASE64})`;

    await page.fill('[data-testid="post-title"]', "显示一致性测试");
    await page.click('[data-testid="editor-mode-source"]');
    await page.fill('[data-testid="source-editor"]', originalContent);
    await page.click('[data-testid="save-post"]');
    await page.waitForSelector('[data-testid="save-success"]');

    // 获取转换后的内容
    const convertedContent = await page.inputValue('[data-testid="source-editor"]');
    const imageMatch = convertedContent.match(/!\[test\]\((\.\/assets\/[^)]+\.png)\)/);
    expect(imageMatch).toBeTruthy();

    const _imagePath = imageMatch?.[1];

    // 测试在预览模式中的显示
    await page.click('[data-testid="editor-mode-preview"]');
    await page.waitForSelector('[data-testid="preview-content"]');

    const previewImage = page.locator('[data-testid="preview-content"] img').first();
    await expect(previewImage).toBeVisible();

    const previewSrc = await previewImage.getAttribute("src");
    expect(previewSrc).toContain("/api/files/");

    // 测试在 WYSIWYG 模式中的显示
    await page.click('[data-testid="editor-mode-wysiwyg"]');
    await page.waitForSelector('[data-testid="wysiwyg-editor"]');

    const wysiwygImage = page.locator('[data-testid="wysiwyg-editor"] img').first();
    await expect(wysiwygImage).toBeVisible();

    const wysiwygSrc = await wysiwygImage.getAttribute("src");
    expect(wysiwygSrc).toContain("/api/files/");

    // 验证两种模式下的图片 URL 一致
    expect(previewSrc).toBe(wysiwygSrc);
  });
});
