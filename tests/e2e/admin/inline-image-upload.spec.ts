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

    // Quick memo editor should be visible for admin
    await expect(page.getByTestId("quick-memo-editor")).toBeVisible();

    // Focus Milkdown's ProseMirror editable and type markdown with an inline base64 image
    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await editor.type(
      `Here is an inline image: ![Alt](data:image/png;base64,${ONE_BY_ONE_PNG_BASE64})`
    );

    // Prepare to capture the file-upload request from the editor's processInlineImages()
    const uploadResponsePromise = page.waitForResponse((resp) => {
      const url = resp.url();
      return url.includes("/api/files/webdav/") && resp.request().method() === "POST";
    });

    // Submit the quick memo (this calls processInlineImages under the hood)
    await page.getByRole("button", { name: /发布 Memo/ }).click();

    const uploadResp = await uploadResponsePromise;
    const ok = uploadResp.ok();
    const url = uploadResp.url();

    // Validate upload succeeded and path is correct
    expect(ok, `upload failed: ${uploadResp.status()} ${url}`).toBeTruthy();
    expect(url).toMatch(/\/api\/files\/webdav\/(Memos|memos)\/assets\/inline-\d+\.png$/);
    expect(url).not.toMatch(/\.md\//); // must not contain "...md/inline-..."
  });
});
