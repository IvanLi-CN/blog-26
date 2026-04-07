import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";
import {
  openMemoDetailFromCard,
  waitForQuickMemoEditor,
  waitForTrpcSuccess,
} from "./memos/helpers";

// Small 1x1 PNG (transparent)
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

const E2E_FS_ONLY = process.env.E2E_FS_ONLY === "1" || process.env.E2E_FS_ONLY === "true";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

function findMemoPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMemoPayload(item);
      if (found) return found;
    }
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.slug === "string" && candidate.slug.length > 0) {
    return candidate;
  }

  for (const nested of Object.values(candidate)) {
    const found = findMemoPayload(nested);
    if (found) return found;
  }

  return null;
}

test.describe("Inline image upload (Milkdown/Memos)", () => {
  test.beforeAll(async ({ request }) => {
    if (E2E_FS_ONLY) return;

    // Ensure WebDAV directories exist: /Memos and /Memos/assets
    // Playwright webServer uses dufs on :25091 as configured in playwright.config.ts
    const base = "http://localhost:25091";

    await request.fetch(`${base}/Memos`, { method: "MKCOL" }).catch(() => {
      /* ignore if already exists */
    });
    // Create /Memos/assets (ignore errors if exists)
    await request.fetch(`${base}/Memos/assets`, { method: "MKCOL" }).catch(() => {
      /* ignore if already exists */
    });
  });

  test("uploads base64 inline image and avoids '.md/' in path", async ({ page, baseURL }) => {
    const TOKEN = `__INLINE_${Date.now()}__`;
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    // Navigate to memos page as admin (header is injected by project config)
    await page.goto(`${baseURL}/memos`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Quick memo editor should be visible for admin.
    // Use accessible role+name to avoid strict mode violation from duplicated test ids.
    const { container: editorRegion } = await waitForQuickMemoEditor(page);

    // Focus Milkdown's ProseMirror editable (scoped to the quick editor region)
    const editor = editorRegion.locator(".ProseMirror").first();
    await editor.click();
    await expect(editor).toBeEditable();
    const markdown = `Here is an inline image (${TOKEN}): ![Alt](data:image/png;base64,${ONE_BY_ONE_PNG_BASE64})`;
    await editor.evaluate((node, text) => {
      const target = node as HTMLElement;
      target.focus();

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);

      document.execCommand("insertText", false, text);
    }, markdown);
    await expect(editor).toContainText(TOKEN, { timeout: 15_000 });
    await expect(editor).toContainText("ASUVORK5CYII=", { timeout: 15_000 });
    // Give the editor a brief moment to emit markdownUpdated and propagate onChange
    await page.waitForTimeout(300);
    // Wait until publish button is enabled, then submit quick memo
    const memoCards = page.locator('[data-testid="memo-card"][data-id]');
    const initialCardIds = await memoCards.evaluateAll((cards) =>
      cards
        .map((card) => card.getAttribute("data-id"))
        .filter((value): value is string => Boolean(value))
    );
    const publishButton = page.getByRole("button", { name: /发布 Memo/ });
    await expect(publishButton).toBeEnabled();
    const createRespPromise = waitForTrpcSuccess(page, "memos.create", 60_000)
      .then(async (response) => {
        const payload = await response.json();
        return findMemoPayload(payload);
      })
      .catch(() => null);
    await publishButton.click();

    const successToast = page.locator(".Toastify__toast .nature-alert-success");
    await expect(successToast).toContainText("Memo 已发布", { timeout: 30_000 });

    const createdMemo = await Promise.race([
      createRespPromise,
      page.waitForTimeout(2_000).then(() => null),
    ]);
    const slug = typeof createdMemo?.slug === "string" ? createdMemo.slug : "";

    if (slug) {
      await page.goto(`${baseURL}/memos/${slug}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForSelector(".memo-detail-page", { timeout: 60_000 });
    } else {
      let createdCardId = "";
      await expect
        .poll(
          async () => {
            const ids = await memoCards.evaluateAll((cards) =>
              cards
                .map((card) => card.getAttribute("data-id"))
                .filter((value): value is string => Boolean(value))
            );
            createdCardId = ids.find((id) => !initialCardIds.includes(id)) ?? "";
            return createdCardId;
          },
          {
            timeout: 60_000,
            message: "等待新发布的 memo 出现在列表中",
          }
        )
        .not.toBe("");

      const createdCard = page.locator(`[data-testid="memo-card"][data-id="${createdCardId}"]`);
      await expect(createdCard).toBeVisible({ timeout: 30_000 });
      await openMemoDetailFromCard(page, createdCard);
    }

    await expect
      .poll(async () => await page.locator('.memo-detail-page img[src^="/api/files/"]').count(), {
        timeout: 30_000,
        message: "等待详情页渲染上传后的图片",
      })
      .toBeGreaterThan(0);

    const renderedImageSrcs = await page
      .locator('.memo-detail-page img[src^="/api/files/"]')
      .evaluateAll((images) =>
        images
          .map((image) => image.getAttribute("src"))
          .filter((src): src is string => Boolean(src))
      );

    // Ensure runtime image URLs don't contain ".md/" in path (regression guard).
    for (const src of renderedImageSrcs) {
      expect(src).not.toMatch(/\.md\//);
      if (E2E_FS_ONLY) {
        expect(src).not.toMatch(/^\/api\/files\/webdav\//);
      }
    }
  });
});
