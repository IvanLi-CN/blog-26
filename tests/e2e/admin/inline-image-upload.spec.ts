import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";
import { waitForQuickMemoEditor, waitForTrpcSuccess } from "./memos/helpers";

// Small 1x1 PNG (transparent)
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

const E2E_FS_ONLY = process.env.E2E_FS_ONLY === "1" || process.env.E2E_FS_ONLY === "true";

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
    // New memo card containing the token will be asserted via text below
    // Wait until publish button is enabled, then submit quick memo
    const publishButton = page.getByRole("button", { name: /发布 Memo/ });
    await expect(publishButton).toBeEnabled();
    const [createResp] = await Promise.all([
      waitForTrpcSuccess(page, "memos.create"),
      publishButton.click(),
    ]);

    const successToast = page.locator(".Toastify__toast .nature-alert-success");
    await expect(successToast).toContainText("Memo 已发布", { timeout: 10_000 });

    const createPayload = await createResp.json();
    const createdMemo = findMemoPayload(createPayload);
    const slug = typeof createdMemo?.slug === "string" ? createdMemo.slug : "";
    expect(slug).toBeTruthy();

    await page.goto(`${baseURL}/memos/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });

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
