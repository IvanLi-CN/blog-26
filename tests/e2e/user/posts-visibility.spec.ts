import { expect } from "@playwright/test";
import { userTest as test } from "./fixtures";

test.describe("Posts visibility badge (user)", () => {
  test("non-admin user should NOT see visibility badge on list", async ({ page }) => {
    await page.goto("/posts", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();

    const badges = page.locator('[data-testid="post-status-badge"]');
    await expect(badges).toHaveCount(0);
  });
});
