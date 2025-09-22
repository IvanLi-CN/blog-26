import { expect, test } from "@playwright/test";

// Small 1x1 PNG (transparent)
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

test.describe("Inline image upload (Milkdown/Memos)", () => {
  test.beforeAll(async ({ request }) => {
    // Ensure WebDAV directories exist: /Memos and /Memos/assets
    // Playwright webServer uses dufs on :25091 as configured in playwright.config.ts
    const base = "http://localhost:25091";

    // Create /Memos (ignore errors if exists)
    await request.fetch(`${base}/Memos`, { method: "MKCOL" }).catch(() => {});
    // Create /Memos/assets (ignore errors if exists)
    await request.fetch(`${base}/Memos/assets`, { method: "MKCOL" }).catch(() => {});
  });

  test("uploads base64 inline image and avoids '.md/' in path", async ({ page, baseURL }) => {
    // Navigate to memos page as admin (header is injected by project config)
    await page.goto(`${baseURL}/memos`);

    // Quick memo editor should be visible for admin.
    // Use accessible role+name to avoid strict mode violation from duplicated test ids.
    await expect(page.getByRole("region", { name: "快速发布区域" })).toBeVisible();

    // Focus Milkdown's ProseMirror editable and type markdown with an inline base64 image
    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await editor.type(
      `Here is an inline image: ![Alt](data:image/png;base64,${ONE_BY_ONE_PNG_BASE64})`
    );

    // Wait until publish button is enabled, then submit quick memo
    const publishButton = page.getByRole("button", { name: /发布 Memo/ });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    // Wait for an inline image to render (filename contains "inline-")
    await page.waitForFunction(() => {
      const nodes = Array.from(document.querySelectorAll('img[src^="/api/files/webdav/"]'));
      return nodes.some((n) => (n.getAttribute("src") || "").includes("inline-"));
    });

    // Validate all inline images have correct path (no ".md/" segment)
    const inlineImgs = page.locator('img[src^="/api/files/webdav/"][src*="inline-"]');
    const count = await inlineImgs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const src = await inlineImgs.nth(i).getAttribute("src");
      expect(src || "").not.toMatch(/\.md\//);
    }
  });
});
