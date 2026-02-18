import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

// Small 1x1 PNG (transparent)
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

const E2E_FS_ONLY = process.env.E2E_FS_ONLY === "1" || process.env.E2E_FS_ONLY === "true";

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
    await page.goto(`${baseURL}/memos`);

    // Quick memo editor should be visible for admin.
    // Use accessible role+name to avoid strict mode violation from duplicated test ids.
    await expect(page.getByRole("region", { name: "快速发布区域" })).toBeVisible();

    // Focus Milkdown's ProseMirror editable (scoped to the quick editor region)
    const editorRegion = page.getByRole("region", { name: "快速发布区域" });
    const editor = editorRegion.locator(".ProseMirror").first();
    await editor.click();
    await expect(editor).toBeEditable();
    // Use keyboard.insertText for contenteditable to avoid IME/selection quirks
    await page.keyboard.insertText(
      `Here is an inline image (${TOKEN}): ![Alt](data:image/png;base64,${ONE_BY_ONE_PNG_BASE64})`
    );
    // Give the editor a brief moment to emit markdownUpdated and propagate onChange
    await page.waitForTimeout(300);
    // New memo card containing the token will be asserted via text below
    // Wait until publish button is enabled, then submit quick memo
    const publishButton = page.getByRole("button", { name: /发布 Memo/ });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    // Wait for the new memo card containing our unique token to appear
    await expect(page.getByText(TOKEN)).toBeVisible();

    // Ensure runtime image URLs don't contain ".md/" in path (regression guard).
    const imgs = page.locator('img[src^="/api/files/"]');
    const count = await imgs.count();
    for (let i = 0; i < count; i++) {
      const src = await imgs.nth(i).getAttribute("src");
      expect(src || "").not.toMatch(/\.md\//);
      if (E2E_FS_ONLY) {
        expect(src || "").not.toMatch(/^\/api\/files\/webdav\//);
      }
    }
  });
});
