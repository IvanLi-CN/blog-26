import { expect, test } from "@playwright/test";

test.describe("Posts visibility badge (guest)", () => {
  test("guest should NOT see visibility badge on list", async ({ page }) => {
    await page.goto("/posts", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();

    const badges = page.locator('[data-testid="post-status-badge"]');
    await expect(badges).toHaveCount(0);
  });
});
