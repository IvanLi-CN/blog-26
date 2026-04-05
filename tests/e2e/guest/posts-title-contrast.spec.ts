import { expect, type Page, test } from "@playwright/test";

async function getFirstPostTitleSample(page: Page) {
  const firstTitleLink = page.locator("main h2 a").first();
  await expect(firstTitleLink).toBeVisible();

  return firstTitleLink.evaluate((el) => {
    const title = (el as HTMLElement).textContent?.trim() ?? "";
    const fg = getComputedStyle(el as HTMLElement).color;
    const root = document.documentElement;

    let node: HTMLElement | null = el as HTMLElement;
    let bg = "";
    while (node) {
      const candidate = getComputedStyle(node).backgroundColor;
      if (candidate && candidate !== "transparent" && candidate !== "rgba(0, 0, 0, 0)") {
        bg = candidate;
        break;
      }
      node = node.parentElement;
    }

    return {
      title,
      fg,
      bg,
      uiTheme: root.getAttribute("data-ui-theme"),
      uiPreference: root.getAttribute("data-ui-preference"),
    };
  });
}

test.describe("Posts list title contrast", () => {
  test("light 主题：标题保持清晰可读", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/posts", { waitUntil: "domcontentloaded" });

    const sample = await getFirstPostTitleSample(page);
    expect(sample.title).not.toBe("");
    expect(sample.uiTheme).toBe("light");
    expect(sample.fg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sample.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sample.fg).not.toBe(sample.bg);
  });

  test.describe("system 主题（dark）", () => {
    test.use({ colorScheme: "dark" });

    test("system 主题往返导航后标题颜色保持稳定", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("theme", "system"));
      await page.goto("/posts", { waitUntil: "domcontentloaded" });

      const before = await getFirstPostTitleSample(page);
      expect(before.title).not.toBe("");
      expect(before.uiPreference).toBe("system");
      expect(before.uiTheme).toBe("dark");
      expect(before.fg).not.toBe(before.bg);

      const href = await page.locator("main h2 a").first().getAttribute("href");
      expect(href).toMatch(/^\/posts\//);
      if (!href) {
        throw new Error("Expected the first post title to expose an href");
      }
      await page.goto(href, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/posts\//);

      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.mouse.move(0, 0);
      const after = await getFirstPostTitleSample(page);

      expect(after.uiPreference).toBe("system");
      expect(after.uiTheme).toBe("dark");
      expect(after.fg).toBe(before.fg);
    });
  });

  test("dark 主题：标题保持清晰可读", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/posts", { waitUntil: "domcontentloaded" });

    const sample = await getFirstPostTitleSample(page);
    expect(sample.title).not.toBe("");
    expect(sample.uiTheme).toBe("dark");
    expect(sample.fg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sample.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sample.fg).not.toBe(sample.bg);
  });
});
