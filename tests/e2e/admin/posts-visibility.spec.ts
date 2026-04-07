import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

test.describe("Posts visibility badge (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post("/api/dev/login", {
      data: { email: process.env.ADMIN_EMAIL || "admin@example.com" },
    });
  });

  test("admin should see visibility badge on list", async ({ page }) => {
    await page.goto("/posts", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();

    const badges = page.locator('[data-testid="post-status-badge"]');
    await expect(badges.first()).toBeVisible();
    const firstText = await badges.first().innerText();
    expect(["公开", "草稿", "私有"]).toContain(firstText.trim());
  });
});
