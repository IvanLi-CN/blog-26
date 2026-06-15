import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

function treeDirectoryButton(page: Page, name: string) {
  return page.locator(`button.pointer-events-auto[aria-label="${name} 目录"]`).first();
}

async function ensureBlogDirectoryExpanded(page: Page) {
  const targetFile = page
    .getByTestId("editor-file-browser")
    .getByRole("button", { name: "hello-world.md", exact: true })
    .first();
  const blogDirectory = treeDirectoryButton(page, "blog");

  await expect
    .poll(
      async () => {
        if (await targetFile.isVisible().catch(() => false)) {
          return "ready";
        }

        if (await blogDirectory.isVisible().catch(() => false)) {
          await blogDirectory.click().catch(() => {
            // Ignore transient click failures while the tree finishes hydrating.
          });
          return (await targetFile.isVisible().catch(() => false)) ? "ready" : "expanding";
        }

        return "pending";
      },
      {
        timeout: 30_000,
        intervals: [500, 1_000, 2_000],
        message: "等待 blog 目录展开并显示 hello-world.md",
      }
    )
    .toBe("ready");

  await expect(targetFile).toBeVisible();
  return targetFile;
}

test.describe("Admin SPA phase 2", () => {
  test("dashboard is served from the SPA shell and only calls /api/admin", async ({ page }) => {
    const finishedRequests: string[] = [];
    page.on("requestfinished", (request) => {
      finishedRequests.push(request.url());
    });

    const response = await page.goto("/admin", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "管理员仪表盘" })).toBeVisible();
    await expect(page.getByRole("link", { name: /管理后台 内容工作台/ })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    await expect
      .poll(() => finishedRequests.some((url) => url.includes("/api/admin/session")))
      .toBe(true);
    await expect
      .poll(() => finishedRequests.some((url) => url.includes("/api/admin/dashboard/stats")))
      .toBe(true);
    await expect.poll(() => finishedRequests.some((url) => url.includes("/api/trpc"))).toBe(false);
  });

  test("editor de-duplicates the same article when opened from slug and file browser", async ({
    page,
  }) => {
    await page.goto("/admin/posts/editor?slug=hello-world", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator('[data-testid="editor"]')).toBeVisible();
    await expect(page.getByTestId("editor-tab").filter({ hasText: "Hello World" })).toHaveCount(1, {
      timeout: 30_000,
    });
    const fileBrowser = page.getByTestId("editor-file-browser");
    await expect(fileBrowser).toBeVisible();
    const targetFile = await ensureBlogDirectoryExpanded(page);
    await targetFile.click();

    await expect(page.getByTestId("editor-tab").filter({ hasText: "Hello World" })).toHaveCount(1);
  });

  test("legacy aliases, posts list, and editor remain usable", async ({ page }) => {
    await page.goto("/admin/data-sync", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page).toHaveURL(/\/admin\/content-sync$/);
    await expect(page.getByRole("heading", { name: "内容同步" })).toBeVisible();

    await page.goto("/admin/posts", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();
    await expect(page.getByRole("link", { name: "新建草稿" })).toBeVisible();
    await expect(page.getByRole("link", { name: "编辑" }).first()).toBeVisible();

    await page.goto("/admin/posts/editor?slug=hello-world", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.locator('[data-testid="editor"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "文章编辑器" })).toBeVisible();
    await expect(page.getByText("Hello World").first()).toBeVisible();
    await expect(page.getByTestId("editor").getByText("hello-world")).toBeVisible();
  });

  test("new empty article shows a friendly validation message instead of raw issues", async ({
    page,
  }) => {
    await page.goto("/admin/posts/editor", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator('[data-testid="editor"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "文章编辑器" })).toBeVisible();

    await page.getByTestId("editor-create-post").click();
    await page.getByTestId("editor-save").click();

    await expect(page.getByText("内容不能为空，请先输入正文后再保存。")).toBeVisible();
    await expect(page.getByText(/"minimum": 1|"path": \\["body"\\]/)).toHaveCount(0);
  });
});
