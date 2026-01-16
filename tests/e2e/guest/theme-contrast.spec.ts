import { expect, type Page, test } from "@playwright/test";
import { UI } from "../../../src/config/site";

const THEMES_EXCEPT_SYSTEM = Array.from(
  new Set([...UI.theme.mainThemes, ...UI.theme.allThemes])
).filter((theme) => theme !== "system");

test.describe("Theme application", () => {
  test("data-theme 与 dark class 对齐（全部主题）", async ({ page }) => {
    for (const theme of THEMES_EXCEPT_SYSTEM) {
      const themedPage = await page.context().newPage();
      await themedPage.addInitScript((t) => localStorage.setItem("theme", t), theme);

      await themedPage.goto("/", { waitUntil: "domcontentloaded" });

      await expect(themedPage.locator("html")).toHaveAttribute("data-theme", theme);
      const hasDark = await themedPage
        .locator("html")
        .evaluate((el) => el.classList.contains("dark"));
      expect(hasDark).toBe(UI.theme.darkThemes.includes(theme));
      await themedPage.close();
    }
  });

  test.describe("system theme 映射", () => {
    test.use({ colorScheme: "light" });

    test("prefers-color-scheme: light → data-theme=light 且不加 dark", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("theme", "system"));
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      const hasDark = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
      expect(hasDark).toBe(false);
    });
  });

  test.describe("system theme 映射（dark）", () => {
    test.use({ colorScheme: "dark" });

    test("prefers-color-scheme: dark → data-theme=dark 且加 dark", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("theme", "system"));
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const hasDark = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
      expect(hasDark).toBe(true);
    });
  });
});

test.describe("Memos theme contrast", () => {
  async function getFirstMemoSample(page: Page) {
    const memoCard = page.locator('.memos-list [data-testid="memo-card"]').first();
    await expect(memoCard).toBeVisible();
    const sample = memoCard.locator(".prose").first().locator("p, li, blockquote").first();
    await expect(sample).toBeVisible();

    return sample.evaluate((el) => {
      const isTransparent = (color: string) =>
        color === "transparent" || color === "rgba(0, 0, 0, 0)";

      const fg = getComputedStyle(el as HTMLElement).color;

      let node: HTMLElement | null = el as HTMLElement;
      let bg = "";
      while (node) {
        const candidate = getComputedStyle(node).backgroundColor;
        if (candidate && !isTransparent(candidate)) {
          bg = candidate;
          break;
        }
        node = node.parentElement;
      }
      if (!bg) {
        bg = getComputedStyle(document.body).backgroundColor;
      }

      return {
        className: (el as HTMLElement).className,
        fg,
        bg,
      };
    });
  }

  test("light 主题：正文对比度不应过低", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memos-list", { timeout: 15000 });

    const sample = await getFirstMemoSample(page);
    expect(sample.className).toContain("text-base-content");
    expect(sample.className).not.toMatch(/text-gray-|dark:text-|bg-gray-|dark:bg-/);
    expect(sample.fg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sample.bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("dark 主题：正文对比度不应过低", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memos-list", { timeout: 15000 });

    const sample = await getFirstMemoSample(page);
    expect(sample.className).toContain("text-base-content");
    expect(sample.className).not.toMatch(/text-gray-|dark:text-|bg-gray-|dark:bg-/);
    expect(sample.fg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sample.bg).not.toBe("rgba(0, 0, 0, 0)");
  });
});
