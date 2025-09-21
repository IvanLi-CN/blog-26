import { expect, test } from "@playwright/test";

test.describe("Posts visibility badge (admin)", () => {
  test("admin should see visibility badge on list", async ({ page }) => {
    await page.goto("/posts");

    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();

    const badges = page.locator('[data-testid="post-status-badge"]');
    await expect(badges.first()).toBeVisible();
    const firstText = await badges.first().innerText();
    expect(["公开", "草稿", "私有"]).toContain(firstText.trim());
  });
});
