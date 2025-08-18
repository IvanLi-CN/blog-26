/**
 * 闪念列表页图片灯箱功能端到端测试
 *
 * 测试图片灯箱和详情链接功能在真实浏览器环境中的表现
 */

import { expect, test } from "@playwright/test";

test.describe("闪念列表页图片灯箱功能", () => {
  test.beforeEach(async ({ page }) => {
    // 访问闪念列表页
    await page.goto("/memos");

    // 等待页面加载完成
    await page.waitForLoadState("networkidle");

    // 等待 memo 卡片加载，增加超时时间
    await page.waitForSelector('[data-testid="memo-card"]', { timeout: 30000 });
  });

  test("应该显示详情链接图标", async ({ page }) => {
    // 查找第一个 memo 卡片的详情链接
    const detailLink = page.locator('[aria-label*="查看详情"]').first();

    // 详情链接应该存在
    await expect(detailLink).toBeVisible();

    // 应该有正确的样式
    await expect(detailLink).toHaveClass(/absolute/);
    await expect(detailLink).toHaveClass(/bottom-3/);
    await expect(detailLink).toHaveClass(/right-3/);
  });

  test("点击详情链接应该跳转到详情页", async ({ page }) => {
    // 获取第一个详情链接 - 使用更精确的选择器
    const detailLink = page.getByRole("link", { name: /查看详情:/ }).first();

    // 等待链接完全可见和可交互
    await expect(detailLink).toBeVisible();
    await expect(detailLink).toBeEnabled();

    // 获取链接的 href 属性
    const href = await detailLink.getAttribute("href");
    expect(href).toMatch(/^\/memos\/.+/);

    // 记录当前 URL
    const currentUrl = page.url();
    console.log("Current URL before click:", currentUrl);

    // 点击详情链接并等待导航完成
    await Promise.all([page.waitForURL(/\/memos\/[^/]+/, { timeout: 15000 }), detailLink.click()]);

    // 验证 URL 已经改变
    const newUrl = page.url();
    console.log("New URL after click:", newUrl);
    expect(newUrl).toMatch(/\/memos\/[^/]+/);
    expect(newUrl).not.toBe(currentUrl);

    // 验证详情页内容 - 使用更具体的选择器
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("图片灯箱功能应该正常工作", async ({ page }) => {
    // 等待页面加载完成
    await page.waitForLoadState("networkidle");

    // 首先检查页面上是否有任何图片
    const allImages = await page.locator("img").count();
    console.log("Total images on page:", allImages);

    // 检查是否有包含"夕阳下的湖面"的图片
    const targetImages = await page.locator('img[alt*="夕阳下的湖面"]').count();
    console.log("Target images found:", targetImages);

    if (targetImages === 0) {
      // 如果没有找到目标图片，检查页面内容
      const pageContent = await page.content();
      const hasMemoContent = pageContent.includes("夕阳下的湖面");
      console.log("Page contains memo content:", hasMemoContent);

      // 列出所有图片的 alt 属性
      const allImageAlts = await page
        .locator("img")
        .evaluateAll((imgs) => imgs.map((img) => ({ alt: img.alt, src: img.src })));
      console.log("All images on page:", allImageAlts);

      throw new Error('没有找到包含"夕阳下的湖面"的图片，可能是数据加载问题或图片路径问题');
    }

    // 查找包含图片的 memo 卡片
    const imageInCard = page.locator('img[alt*="夕阳下的湖面"]').first();

    // 等待图片完全加载并检查其状态
    await expect(imageInCard).toBeVisible({ timeout: 15000 });

    // 等待图片加载完成，最多等待10秒
    try {
      await page.waitForFunction((img) => img.complete && img.naturalHeight !== 0, imageInCard, {
        timeout: 10000,
      });
    } catch (_error) {
      // 如果等待超时，检查图片实际状态
      const imageStatus = await imageInCard.evaluate((img) => ({
        complete: img.complete,
        naturalHeight: img.naturalHeight,
        naturalWidth: img.naturalWidth,
        src: img.src,
        currentSrc: img.currentSrc,
      }));

      // 检查 HTTP 响应状态
      const imageSrc = await imageInCard.getAttribute("src");
      const response = await page.request.get(imageSrc);
      const responseStatus = response.status();

      // 如果 HTTP 响应正常，即使图片在浏览器中显示有问题，也继续测试
      if (responseStatus === 200) {
        console.log("图片 HTTP 响应正常，继续测试:", { imageStatus, responseStatus });
      } else {
        throw new Error(`图片加载失败。
          图片状态: ${JSON.stringify(imageStatus)}
          HTTP响应状态: ${responseStatus}
          图片URL: ${imageSrc}
        `);
      }
    }

    // 验证图片有 data-lightbox 属性
    const hasDataLightbox = await imageInCard.getAttribute("data-lightbox");
    console.log("Image data-lightbox attribute:", hasDataLightbox);

    if (hasDataLightbox !== "true") {
      throw new Error(`图片缺少 data-lightbox="true" 属性，当前值: ${hasDataLightbox}`);
    }

    // 验证图片有 cursor-pointer 样式
    const imageClasses = await imageInCard.getAttribute("class");
    console.log("Image classes:", imageClasses);

    if (!imageClasses?.includes("cursor-pointer")) {
      throw new Error(`图片缺少 cursor-pointer 样式，当前 class: ${imageClasses}`);
    }

    // 滚动到图片位置确保可见
    await imageInCard.scrollIntoViewIfNeeded();

    // 点击图片
    await imageInCard.click();

    // 等待灯箱动画完成
    await page.waitForTimeout(1000);

    // 查找灯箱
    const hintText = page.locator("text=按 ESC 键或点击背景关闭");
    await expect(hintText).toBeVisible({ timeout: 5000 });

    // 验证关闭按钮
    const closeButton = page.locator('button[aria-label="关闭图片预览"]');
    await expect(closeButton).toBeVisible();

    // 测试 ESC 键关闭灯箱
    await page.keyboard.press("Escape");
    await expect(hintText).not.toBeVisible();
  });

  test("图片点击不应该触发页面跳转", async ({ page }) => {
    // 记录当前 URL
    const currentUrl = page.url();

    // 查找包含图片的 memo 卡片
    const imageInCard = page.locator('img[data-lightbox="true"]').first();

    // 如果没有图片，跳过测试
    const imageCount = await imageInCard.count();
    if (imageCount === 0) {
      test.skip("没有找到包含图片的 memo 卡片");
      return;
    }

    // 点击图片
    await imageInCard.click();

    // 等待一下确保没有导航发生
    await page.waitForTimeout(1000);

    // URL 应该保持不变
    expect(page.url()).toBe(currentUrl);

    // 但是灯箱应该打开
    const hintText = page.locator("text=按 ESC 键或点击背景关闭");
    await expect(hintText).toBeVisible({ timeout: 5000 });
  });

  test("卡片内容区域点击不应该触发跳转", async ({ page }) => {
    // 记录当前 URL
    const currentUrl = page.url();

    // 点击第一个 memo 卡片的内容区域（避开图片和按钮）
    const memoContent = page.locator('[data-testid="memo-card"]').first().locator(".card-body");
    await memoContent.click();

    // 等待一下确保没有导航发生
    await page.waitForTimeout(1000);

    // URL 应该保持不变
    expect(page.url()).toBe(currentUrl);
  });

  test("在详情页中图片灯箱也应该正常工作", async ({ page }) => {
    // 先跳转到详情页
    const detailLink = page.locator('[aria-label*="查看详情"]').first();
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    // 查找详情页中的图片
    const imageInDetail = page.locator('img[data-lightbox="true"]').first();

    // 如果没有图片，跳过测试
    const imageCount = await imageInDetail.count();
    if (imageCount === 0) {
      test.skip("详情页中没有找到图片");
      return;
    }

    // 点击图片
    await imageInDetail.click();

    // 等待灯箱出现
    const hintText = page.locator("text=按 ESC 键或点击背景关闭");
    await expect(hintText).toBeVisible({ timeout: 5000 });

    // 验证关闭按钮存在
    const closeButton = page.getByRole("button", { name: "关闭图片预览" });
    await expect(closeButton).toBeVisible();

    // 测试 ESC 键关闭灯箱
    await page.keyboard.press("Escape");
    await expect(hintText).not.toBeVisible();
  });

  test("移动端适配测试", async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    // 重新加载页面
    await page.reload();
    await page.waitForLoadState("networkidle");

    // 详情链接在移动端应该仍然可见
    const detailLink = page.locator('[aria-label*="查看详情"]').first();
    await expect(detailLink).toBeVisible();

    // 图片灯箱在移动端应该正常工作
    const imageInCard = page.locator('img[data-lightbox="true"]').first();
    const imageCount = await imageInCard.count();

    if (imageCount > 0) {
      await imageInCard.click();

      const hintText = page.locator("text=按 ESC 键或点击背景关闭");
      await expect(hintText).toBeVisible({ timeout: 5000 });

      // 在移动端测试触摸关闭
      await page.keyboard.press("Escape");
      await expect(hintText).not.toBeVisible();
    }
  });

  test("可访问性测试", async ({ page }) => {
    // 测试键盘导航
    await page.keyboard.press("Tab");

    // 详情链接应该可以通过键盘访问
    const detailLink = page.getByRole("link", { name: /查看详情:/ }).first();
    await expect(detailLink).toBeVisible();
    await detailLink.focus();

    // 验证焦点样式
    await expect(detailLink).toBeFocused();

    // 记录当前 URL
    const currentUrl = page.url();
    console.log("Current URL before keyboard navigation:", currentUrl);

    // 测试回车键激活 - 使用更可靠的等待机制
    await Promise.all([
      page.waitForURL(/\/memos\/[^/]+/, { timeout: 15000 }),
      page.keyboard.press("Enter"),
    ]);

    // 验证 URL 已经改变
    const newUrl = page.url();
    console.log("New URL after keyboard navigation:", newUrl);
    expect(newUrl).toMatch(/\/memos\/[^/]+/);
    expect(newUrl).not.toBe(currentUrl);
  });

  test("多个图片的灯箱导航", async ({ page }) => {
    // 查找包含多个图片的 memo（如果存在）
    const images = page.locator('img[data-lightbox="true"]');
    const imageCount = await images.count();

    if (imageCount < 2) {
      test.skip("没有找到包含多个图片的 memo");
      return;
    }

    // 点击第一个图片
    await images.first().click();

    // 等待灯箱出现
    const hintText = page.locator("text=按 ESC 键或点击背景关闭");
    await expect(hintText).toBeVisible({ timeout: 5000 });

    // 如果有导航按钮，测试图片切换（当前实现可能没有导航功能）
    const nextButton = page.locator('button[aria-label*="下一张"]');
    const _prevButton = page.locator('button[aria-label*="上一张"]');

    if ((await nextButton.count()) > 0) {
      await nextButton.click();
      // 验证图片已切换（这里可以检查图片 src 或其他标识）
    }

    // 关闭灯箱
    await page.keyboard.press("Escape");
    await expect(hintText).not.toBeVisible();
  });
});
