import { expect, type Page, test } from "@playwright/test";

async function getFirstPostTitleSample(page: Page) {
  const firstTitleLink = page.locator("main h2 a").first();
  await expect(firstTitleLink).toBeVisible();

  return firstTitleLink.evaluate((el) => {
    const title = (el as HTMLElement).textContent?.trim() ?? "";
    const fg = getComputedStyle(el as HTMLElement).color;
    const appRoot = document.querySelector("body > div");
    const appColor = appRoot ? getComputedStyle(appRoot).color : "";

    return {
      title,
      fg,
      appColor,
    };
  });
}

test.describe("Posts list title contrast", () => {
  test("light 主题：标题颜色与语义正文色一致", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/posts", { waitUntil: "domcontentloaded" });

    const sample = await getFirstPostTitleSample(page);
    expect(sample.title).not.toBe("");
    expect(sample.fg).toBe(sample.appColor);
    expect(sample.fg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("nord 主题：标题不应变浅（回归用例）", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "nord"));
    await page.goto("/posts", { waitUntil: "domcontentloaded" });

    const before = await getFirstPostTitleSample(page);
    expect(before.title).not.toBe("");
    expect(before.fg).toBe(before.appColor);

    await page.locator("main h2 a").first().click();
    await expect(page).toHaveURL(/\/posts\//);

    await page.goBack({ waitUntil: "domcontentloaded" });
    // Ensure :hover doesn't affect the sampled color after navigation.
    await page.mouse.move(0, 0);
    const after = await getFirstPostTitleSample(page);
    expect(after.fg).toBe(after.appColor);
  });

  test("dark 主题：标题颜色与语义正文色一致", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/posts", { waitUntil: "domcontentloaded" });

    const sample = await getFirstPostTitleSample(page);
    expect(sample.title).not.toBe("");
    expect(sample.fg).toBe(sample.appColor);
  });
});
