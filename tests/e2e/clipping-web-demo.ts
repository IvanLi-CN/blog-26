/** Exercises the separately built Demo on official routes. No live backend, model, or screenshots. */
import { resolve } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { createWebDemoPreviewServer } from "../../scripts/preview-web-demo";
import { WEB_DEMO_CLIPPING_SLUG } from "../../src/lib/web-demo-runtime";

const root = resolve(process.env.WEB_DEMO_SITE_DIST_DIR || "web-demo-site-dist");
if (!(await Bun.file(resolve(root, "memos", WEB_DEMO_CLIPPING_SLUG, "index.html")).exists()))
  throw new Error("Build the separate Web Demo artifact before this test.");
const server = await createWebDemoPreviewServer({ siteRoot: root, port: 0 });
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const unexpected: string[] = [];
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  // Fonts are presentation assets in the shipped shell, not a Demo data transport.
  // Block their CDN during offline validation without allowing any API fallback.
  if (
    ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname) &&
    ["stylesheet", "font"].includes(route.request().resourceType())
  ) {
    await route.abort();
    return;
  }
  if (url.origin !== base || url.pathname.startsWith("/api/")) {
    unexpected.push(url.href);
    await route.abort();
  } else await route.continue();
});
await page.addInitScript(() => localStorage.setItem("web-demo-inspector-open", "false"));

async function inspector() {
  const panel = page.getByRole("region", { name: "Web Demo 调试控制面板" });
  if (!(await panel.isVisible()))
    await page.getByRole("button", { name: "打开 Web Demo 调试控制面板" }).click();
  return panel;
}
async function closeInspector() {
  await page.getByRole("button", { name: "收起 Web Demo 控制面板" }).click();
}
async function scene(name: string) {
  await inspector();
  await page.getByRole("combobox", { name: "选择 Demo 场景" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function noOverflow(target: Page, width: number) {
  await target.setViewportSize({ width, height: 1000 });
  await expect
    .poll(() => target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await expect
    .poll(() =>
      target.evaluate(() => {
        const minimum = matchMedia("(min-width: 1024px) and (pointer: fine)").matches ? 36 : 44;
        return Array.from(
          document.querySelectorAll(".clipping-status-toolbar, .clipping-article-toolbar")
        ).every((toolbar) => {
          const bounds = toolbar.getBoundingClientRect();
          return Array.from(toolbar.querySelectorAll("button, a")).every((control) => {
            const rectangle = control.getBoundingClientRect();
            return (
              rectangle.left >= bounds.left - 1 &&
              rectangle.right <= bounds.right + 1 &&
              rectangle.height >= minimum - 1
            );
          });
        });
      })
    )
    .toBe(true);
}

try {
  await page.goto(`${base}/memos/`);
  const clipping = page.locator(`[data-slug="${WEB_DEMO_CLIPPING_SLUG}"]`);
  await expect(clipping).toBeVisible();
  await expect(clipping.getByTestId("timeline-type-label")).toHaveCount(0);
  await expect(clipping.getByTestId("timeline-node")).toHaveAttribute(
    "data-timeline-kind",
    "clipping"
  );
  await expect(clipping.locator('a[href*="/tags/"]').filter({ hasText: /^剪藏$/ })).toHaveCount(0);
  const normal = page.locator('[data-slug="memo-web-demo-1182"]');
  await expect(normal.getByTestId("timeline-type-label")).toHaveCount(0);
  await expect(normal.locator("h2")).toHaveText("时间线样例 1182");
  await clipping.locator("h2 a").click();
  await expect(page).toHaveURL(new RegExp(`/memos/${WEB_DEMO_CLIPPING_SLUG}/`));
  await expect(page.getByTestId("clipping-article-source")).toContainText(
    "Durable article workflows"
  );
  await expect(page.getByTestId("clipping-chat")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "原文", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: "简体中文译文", exact: true }).click();
  await expect(page.getByTestId("clipping-article-translation")).toContainText("持久文章工作流");
  await expect(page.getByTestId("clipping-article-source")).toBeHidden();
  await expect(
    page
      .getByRole("article", { name: "剪藏文章" })
      .getByRole("link", { name: "打开原网页", exact: true })
  ).toHaveAttribute("rel", "nofollow noopener noreferrer");

  const panel = await inspector();
  await panel.getByRole("button", { name: "Admin", exact: true }).click();
  await closeInspector();
  await expect(page.locator(".clipping-chat-card")).toBeVisible();
  await expect(page.getByRole("region", { name: "剪藏闪念" })).toBeVisible();
  await expect(page.getByRole("article", { name: "剪藏文章" })).toBeVisible();
  const rectangles = await page.evaluate(() => {
    const memo = document.querySelector(".clipping-memo-card")?.getBoundingClientRect();
    const article = document.querySelector(".clipping-reading-card")?.getBoundingClientRect();
    const chat = document.querySelector(".clipping-chat-card")?.getBoundingClientRect();
    if (!memo || !article || !chat) throw new Error("Missing production clipping cards");
    return {
      gap: article.top - memo.bottom,
      chatGap: chat.left - memo.right,
      chatTop: chat.top - memo.top,
    };
  });
  expect(rectangles.gap).toBeGreaterThanOrEqual(20);
  expect(rectangles.chatGap).toBeGreaterThanOrEqual(20);
  expect(Math.abs(rectangles.chatTop)).toBeLessThan(2);
  await page.getByRole("textbox", { name: "向文章助手提问" }).fill("恢复时为什么要使用同一来源？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByTestId("clipping-chat")).toContainText("内存模拟回答");
  await expect(page.getByRole("button", { name: "版本历史", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "恢复此版本", exact: true })).toHaveCount(0);
  await inspector();
  await page.getByRole("button", { name: "模拟保存", exact: true }).click();
  await expect(page.locator(".clipping-memo-card")).toContainText("新增的备注");

  await scene("剪藏 · 翻译失败");
  await closeInspector();
  await expect(page.getByRole("alert")).toContainText("模拟模型连接中断");
  await page.getByRole("button", { name: "简体中文译文", exact: true }).click();
  await expect(page.getByText("全文翻译尚未完成。下面仅显示已保存的部分译文。")).toBeVisible();
  await page.getByRole("button", { name: "重新处理", exact: true }).click();
  await expect(page.getByText("译文：正在翻译", { exact: false })).toBeVisible();
  await expect(page.getByText("译文：已完成", { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("clipping-article-translation")).toContainText("阅读与讨论");
  await scene("剪藏 · 旧版本回退");
  await closeInspector();
  await expect(page.getByText("正在显示先前保存的阅读版本。", { exact: false })).toBeVisible();

  await scene("剪藏 · 长文章");
  await closeInspector();
  for (const width of [320, 360, 375, 393, 768, 1024, 1440]) {
    await noOverflow(page, width);
    await expect(page.locator(".clipping-chat-card")).toHaveCount(width >= 1024 ? 1 : 0);
    await expect(page.getByTestId("clipping-open-chat")).toHaveCount(width < 1024 ? 1 : 0);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByTestId("clipping-open-chat").click();
  await page.getByRole("textbox", { name: "向文章助手提问" }).fill("保留草稿");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByTestId("clipping-open-chat")).toBeFocused();
  await page.getByTestId("clipping-open-chat").click();
  await expect(page.getByRole("textbox", { name: "向文章助手提问" })).toHaveValue("保留草稿");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await scene("剪藏 · 已完成");
  const tools = await inspector();
  await tools.getByRole("button", { name: "故障", exact: true }).click();
  await closeInspector();
  await expect(page.getByRole("alert")).toContainText("模拟网络故障");
  const recovery = await inspector();
  await recovery.getByRole("button", { name: "正常", exact: true }).click();
  await recovery.getByRole("button", { name: "Guest", exact: true }).click();
  await closeInspector();
  await expect(page.getByTestId("clipping-open-chat")).toHaveCount(0);
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
  console.log(
    "PASS: official routes; language state; three cards; conversation/save/retry; no history/restore controls; 7 widths; focus/draft; network/persona; zero live API/model requests (font CDN blocked)"
  );
} finally {
  await browser.close();
  await server.stop(true);
}
