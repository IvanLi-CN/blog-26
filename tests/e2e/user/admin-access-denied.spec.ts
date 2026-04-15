import { expect } from "@playwright/test";
import { userTest as test } from "./fixtures";

test.describe("Admin access denied (signed-in non-admin)", () => {
  test("non-admin user sees 403 page when accessing admin dashboard", async ({ page }) => {
    const response = await page.goto("/admin/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(403);

    await expect(page.getByRole("heading", { name: "Admin access denied" })).toBeVisible();
    await expect(
      page.getByText(
        "Your current account is signed in, but it does not have administrator privileges."
      )
    ).toBeVisible();
  });
});
