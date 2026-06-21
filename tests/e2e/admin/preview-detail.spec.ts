import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";
import {
  openAdminMemoDetail,
  waitForAdminPreviewMemoBody,
  waitForQuickMemoEditor,
} from "./memos/helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const DB_PATH = path.resolve(
  process.env.DB_PATH ?? path.join(process.cwd(), "test-data/sqlite.db")
);

function seedContaminatedPreviewPost() {
  execFileSync(
    "python3",
    [
      "-c",
      `import sqlite3, time\nconn = sqlite3.connect(${JSON.stringify(DB_PATH)})\ncur = conn.cursor()\nnow = int(time.time() * 1000)\nbody = """---\ntitle: USB-C 安全 5V Sink\nslug: usb-c-safe-5v-sink\nexcerpt: 面向作者态预览的摘要。\ndraft: true\npublic: false\ncategory: hardware\nauthor: Ivan Li\nimage: ./assets/hello.png\ntags:\n  - usb-c\n  - sink\n---\n\n![1.00](./assets/hello.png)\n\n纯正文第一段。"""\ncur.execute("DELETE FROM posts WHERE slug = ?", ('usb-c-safe-5v-sink',))\ncur.execute("INSERT INTO posts (id, slug, type, title, excerpt, body, publish_date, update_date, draft, public, category, tags, author, image, metadata, data_source, created_via, content_hash, last_modified, source, file_path) VALUES (?, ?, 'post', ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, 'local', NULL, ?, ?, 'local', ?)", ('blog/usb-c-safe-5v-sink.md', 'usb-c-safe-5v-sink', 'Persisted wrong title', 'Persisted wrong excerpt', body, now, now, 'hardware', '["preview"]', 'Persisted Author', './assets/persisted-cover.png', '{}', 'legacy-contaminated-body-hash', now, 'blog/usb-c-safe-5v-sink.md'))\nconn.commit()\nconn.close()`,
    ],
    { stdio: "pipe" }
  );
}

test.describe("Admin preview detail", () => {
  test.beforeEach(() => {
    seedContaminatedPreviewPost();
  });

  test("post preview renders detail rhythm and only shows hero when source image exists", async ({
    page,
  }) => {
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    const slug = "hello-world";
    const previewResponse = await page.request.get(`/api/admin/preview/posts/${slug}`);
    expect(previewResponse.ok()).toBe(true);
    const payload = (await previewResponse.json()) as {
      title?: string;
      excerpt?: string | null;
      image?: string | null;
      category?: string | null;
    };
    expect(payload.image).toBeTruthy();

    await page.goto(`/admin/preview/posts/${slug}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    const article = page.locator("article").first();
    const articleHeader = article.locator("header").first();
    await expect(page.getByRole("heading", { name: "文章预览" })).toBeVisible({ timeout: 60_000 });
    await expect(articleHeader.getByRole("heading", { name: payload.title ?? /.+/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("admin-preview-post-body")).toBeVisible({ timeout: 60_000 });

    if (payload.excerpt) {
      await expect(page.getByTestId("admin-preview-description")).toHaveText(payload.excerpt, {
        timeout: 60_000,
      });
    }

    const hero = page.getByTestId("admin-preview-hero");
    await expect(hero).toBeVisible({ timeout: 60_000 });
    await expect(hero.locator("img")).toHaveAttribute("src", payload.image ?? "");
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const heroNode = document.querySelector('[data-testid="admin-preview-hero"]');
            const bodyNode = document.querySelector('[data-testid="admin-preview-post-body"]');
            if (!(heroNode instanceof HTMLElement) || !(bodyNode instanceof HTMLElement)) {
              return false;
            }
            return Boolean(
              heroNode.compareDocumentPosition(bodyNode) & Node.DOCUMENT_POSITION_FOLLOWING
            );
          }),
        { timeout: 10_000 }
      )
      .toBe(true);

    await expect(article.getByText("Feedback", { exact: true })).toHaveCount(0);
    await expect(article.getByRole("heading", { name: "相关文章" })).toHaveCount(0);
    await expect(article.locator('[data-testid="comment-section"]')).toHaveCount(0);
  });

  test("contaminated draft post preview strips frontmatter, keeps the right title, and disables the public CTA", async ({
    page,
  }) => {
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    const response = await page.request.get("/api/admin/preview/posts/usb-c-safe-5v-sink");
    expect(response.ok()).toBe(true);
    const payload = (await response.json()) as {
      title?: string;
      body?: string;
      draft?: boolean;
      public?: boolean;
    };
    expect(payload.title).toBe("USB-C 安全 5V Sink");
    expect(payload.body).not.toContain("title:");
    expect(payload.body).not.toContain("slug:");
    expect(payload.body).not.toContain("draft:");
    expect(payload.draft).toBe(true);
    expect(payload.public).toBe(false);

    await page.goto("/admin/preview/posts/usb-c-safe-5v-sink", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(
      page.getByRole("heading", { name: "USB-C 安全 5V Sink", exact: true })
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("admin-preview-post-body")).toContainText("纯正文第一段。");
    await expect(page.getByTestId("admin-preview-post-body")).not.toContainText("title:");
    await expect(page.getByTestId("admin-preview-post-body")).not.toContainText("slug:");
    await expect(page.getByTestId("admin-preview-post-body")).not.toContainText("draft:");
    await expect(page.getByTestId("admin-preview-public-state")).toContainText(
      "当前文章仍为草稿或未公开"
    );
    await expect(page.getByRole("button", { name: "当前文章仍为草稿或未公开" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "打开公开页" })).toHaveCount(0);

    const heroImage = page.getByTestId("admin-preview-hero").locator("img");
    await expect(heroImage).toHaveAttribute(
      "src",
      /\/api\/admin\/preview\/assets\/post\/usb-c-safe-5v-sink\//
    );
    await expect
      .poll(
        () =>
          heroImage.evaluate((node) => (node instanceof HTMLImageElement ? node.naturalWidth : 0)),
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);

    const bodyImage = page.getByTestId("admin-preview-post-body").locator("img").first();
    await expect(bodyImage).toHaveAttribute(
      "src",
      /\/api\/admin\/preview\/assets\/post\/usb-c-safe-5v-sink\//
    );
    await expect
      .poll(
        () =>
          bodyImage.evaluate((node) => (node instanceof HTMLImageElement ? node.naturalWidth : 0)),
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);
  });

  test("memo preview keeps detail shell without hero and suppresses excerpt area", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const { container, editor } = await waitForQuickMemoEditor(page);
    const title = `Preview hero memo ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(`# ${title}`);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("正文段落");
    await page.waitForTimeout(300);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByText("Memo 已创建：")).toBeVisible({ timeout: 30_000 });

    const memoCards = page.locator('[data-testid="admin-live-memo-card"]');
    const createdCard = memoCards.filter({ hasText: title }).first();
    await expect(createdCard).toBeVisible({ timeout: 60_000 });
    const slug = await createdCard.getAttribute("data-slug");
    expect(slug).toBeTruthy();
    if (!slug) {
      throw new Error("Expected created memo to expose slug");
    }

    await openAdminMemoDetail(page, slug);
    await waitForAdminPreviewMemoBody(page);

    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
    await expect(page.getByTestId("admin-preview-hero")).toHaveCount(0);
    await expect(page.getByTestId("admin-preview-description")).toHaveCount(0);
    await expect(
      page.locator("article").first().getByText("Feedback", { exact: true })
    ).toHaveCount(0);
    await expect(
      page.locator("article").first().getByRole("heading", { name: "相关文章" })
    ).toHaveCount(0);
    await expect(
      page.locator("article").first().locator('[data-testid="comment-section"]')
    ).toHaveCount(0);
  });
});
