import { expect, type Page, test } from "@playwright/test";

async function gotoWithLightTheme(page: Page) {
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/posts", { waitUntil: "domcontentloaded" });
}

test.describe("posts cover fallback", () => {
  test("posts list uses the first body image when frontmatter image is missing", async ({
    page,
  }) => {
    await gotoWithLightTheme(page);

    const fallbackCard = page
      .locator('[data-testid="post-card"]', {
        has: page.getByRole("link", { name: "Hello World" }),
      })
      .first();

    await expect(fallbackCard).toBeVisible();

    const cover = fallbackCard.getByTestId("post-card-cover");
    await expect(cover).toBeVisible();

    const image = cover.locator("img");
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute(
      "src",
      /\/api\/public\/assets\/post\/hello-world\/[0-9a-f]+\/card\.webp$/
    );
  });
});
