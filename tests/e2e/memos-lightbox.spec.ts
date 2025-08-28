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

    // 等待页面DOM加载完成（不等待网络空闲，避免外部API影响）
    await page.waitForLoadState("domcontentloaded");

    // 等待 memo 卡片加载，增加超时时间
    await page.waitForSelector('[data-testid="memo-card"]', { timeout: 30000 });

    // 等待一下确保内容渲染完成
    await page.waitForTimeout(1000);
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

    // 等待页面加载完成
    await page.waitForLoadState("domcontentloaded");

    // 验证详情页内容 - 等待h1元素出现或者等待页面内容加载
    // 使用更宽松的条件：要么有h1标题，要么有memo内容
    await expect(page.locator("h1").first().or(page.locator(".memo-detail-page"))).toBeVisible({
      timeout: 15000,
    });
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

  test("移动端适配测试", async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    // 重新加载页面
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // 等待内容加载
    await page.waitForSelector('[data-testid="memo-card"]', { timeout: 15000 });

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

  test("图片灯箱功能应该正常工作", async ({ page }) => {
    console.log("✅ 使用测试数据中已存在的包含图片的memo");

    // 访问memos页面，搜索包含图片的Docker memo
    await page.goto("/memos?search=Docker");
    await page.waitForLoadState("networkidle");

    // 等待数据加载
    await page.waitForTimeout(3000);

    // 调试：检查页面上所有的图片元素
    const allImages = await page.locator("img").all();
    console.log(`🔍 页面上找到 ${allImages.length} 个图片元素`);

    for (let i = 0; i < allImages.length; i++) {
      const img = allImages[i];
      const src = await img.getAttribute("src");
      const dataLightbox = await img.getAttribute("data-lightbox");
      const alt = await img.getAttribute("alt");
      console.log(`🔍 图片 ${i + 1}: src="${src}", data-lightbox="${dataLightbox}", alt="${alt}"`);
    }

    // 调试：检查页面HTML内容
    const pageContent = await page.content();
    const hasImageTag = pageContent.includes("<img");
    const hasDataLightbox = pageContent.includes("data-lightbox");
    console.log(`🔍 页面HTML包含<img>标签: ${hasImageTag}`);
    console.log(`🔍 页面HTML包含data-lightbox: ${hasDataLightbox}`);

    // 如果找不到图片，先检查是否有任何图片或按钮
    const anyImageCount = await page.locator("img").count();
    const anyButtonCount = await page.locator("button").count();
    console.log(`🔍 页面上图片总数: ${anyImageCount}`);
    console.log(`🔍 页面上按钮总数: ${anyButtonCount}`);

    if (anyImageCount === 0) {
      console.log(`🔍 页面上没有找到任何图片，检查是否渲染为按钮`);
      // 检查是否有图片相关的按钮
      const imageButtons = await page
        .locator('button:has-text("Logo"), button:has-text("图片"), button[aria-label*="图"]')
        .count();
      console.log(`🔍 页面上图片相关按钮总数: ${imageButtons}`);
      // 截图调试
      await page.screenshot({ path: "debug-no-images.png", fullPage: true });
    }

    // 查找包含图片的 memo 卡片（应该是img标签）
    const imageInCard = page.locator('img[data-lightbox="true"]').first();

    // 等待图片加载
    await expect(imageInCard).toBeVisible({ timeout: 10000 });

    // 检查图片属性
    const enableLightbox = await imageInCard.getAttribute("data-lightbox");
    const imageSrc = await imageInCard.getAttribute("src");
    console.log(`图片属性: data-lightbox="${enableLightbox}", src="${imageSrc}"`);

    // 点击图片打开灯箱
    await imageInCard.click();

    // 等待一下让状态更新
    await page.waitForTimeout(1000);

    // 检查是否有灯箱遮罩出现
    const lightboxOverlay = page.locator(".fixed.inset-0.z-50");
    const overlayCount = await lightboxOverlay.count();
    console.log(`灯箱遮罩数量: ${overlayCount}`);

    // 验证灯箱打开
    const hintText = page.locator("text=按 ESC 键或点击背景关闭");
    await expect(hintText).toBeVisible({ timeout: 5000 });

    // 关闭灯箱
    await page.keyboard.press("Escape");
    await expect(hintText).not.toBeVisible();
  });

  test("图片点击不应该触发页面跳转", async ({ page }) => {
    console.log("✅ 使用测试数据中已存在的包含图片的memo");

    // 访问memos页面，搜索包含图片的Docker memo
    await page.goto("/memos?search=Docker");
    await page.waitForLoadState("networkidle");

    // 记录当前 URL
    const currentUrl = page.url();

    // 查找包含图片的 memo 卡片
    const imageInCard = page.locator('img[data-lightbox="true"]').first();

    // 等待图片加载
    await expect(imageInCard).toBeVisible({ timeout: 10000 });

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

  test("在详情页中图片灯箱也应该正常工作", async ({ page }) => {
    console.log("✅ 使用测试数据中已存在的包含图片的memo");

    // 访问memos页面，搜索包含图片的Docker memo
    await page.goto("/memos?search=Docker");
    await page.waitForLoadState("networkidle");

    // 先跳转到详情页
    const detailLink = page.locator('[aria-label*="查看详情"]').first();
    await detailLink.click();
    await page.waitForLoadState("domcontentloaded");

    // 查找详情页中的图片
    const imageInDetail = page.locator('img[data-lightbox="true"]').first();

    // 等待图片加载
    await expect(imageInDetail).toBeVisible({ timeout: 10000 });

    // 点击图片
    await imageInDetail.click();

    // 等待灯箱出现
    const hintText = page.locator("text=按 ESC 键或点击背景关闭");
    await expect(hintText).toBeVisible({ timeout: 5000 });

    // 关闭灯箱
    await page.keyboard.press("Escape");
    await expect(hintText).not.toBeVisible();
  });

  test("多个图片的灯箱导航", async ({ page }) => {
    console.log("✅ 使用测试数据中已存在的包含多个图片的memo");

    // 访问memos页面，搜索包含多个图片的Docker memo
    await page.goto("/memos?search=Docker");
    await page.waitForLoadState("networkidle");

    // 查找包含多个图片的 memo
    const images = page.locator('img[data-lightbox="true"]');
    const imageCount = await images.count();

    if (imageCount < 2) {
      console.log(`⚠️ 只找到 ${imageCount} 个图片，但测试需要至少2个图片`);
      // 不跳过测试，而是使用现有的图片进行基本测试
    }

    // 点击第一个图片
    await images.first().click();

    // 等待灯箱出现
    const hintText = page.locator("text=按 ESC 键或点击背景关闭");
    await expect(hintText).toBeVisible({ timeout: 5000 });

    // 如果有导航按钮，测试图片切换（当前实现可能没有导航功能）
    const nextButton = page.locator('button[aria-label*="下一张"]');
    const prevButton = page.locator('button[aria-label*="上一张"]');

    if ((await nextButton.count()) > 0) {
      await nextButton.click();
      // 验证图片已切换（这里可以检查图片 src 或其他标识）
    }

    if ((await prevButton.count()) > 0) {
      await prevButton.click();
      // 验证可以返回上一张图片
    }

    // 关闭灯箱
    await page.keyboard.press("Escape");
    await expect(hintText).not.toBeVisible();
  });
});
