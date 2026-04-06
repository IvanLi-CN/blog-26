import { expect, type Page, test } from "@playwright/test";
import { UI } from "../../../src/config/site";

type ThemePreference = (typeof UI.theme.options)[number];

const THEMES_EXCEPT_SYSTEM = Array.from(
  new Set([...UI.theme.mainThemes, ...UI.theme.allThemes])
).filter((theme): theme is ThemePreference => theme !== "system");

async function openHome(page: Page) {
  await page.goto("/", { timeout: 60_000, waitUntil: "commit" });
  await expect(page.locator("body")).toBeVisible();
}

async function gotoWithTheme(page: Page, route: string, theme: ThemePreference) {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await page.goto(route, { timeout: 60_000, waitUntil: "commit" });
  await expect(page.locator("body")).toBeVisible();
}

async function readMemoSampleColors(page: Page) {
  const card = page.locator('[data-testid="memo-card"]').first();
  const sample = card.locator("p, li, blockquote").first();
  const panel = card.locator(".nature-panel").first();
  await expect(sample).toBeVisible();
  await expect(panel).toBeVisible();

  return {
    ...(await sample.evaluate((element) => ({
      fg: getComputedStyle(element as HTMLElement).color,
    }))),
    ...(await panel.evaluate((element) => ({
      panelBgColor: getComputedStyle(element as HTMLElement).backgroundColor,
      panelBgImage: getComputedStyle(element as HTMLElement).backgroundImage,
      panelBackdropFilter: getComputedStyle(element as HTMLElement).backdropFilter,
    }))),
    ...(await page.locator("html").evaluate((element) => ({
      uiTheme: element.getAttribute("data-ui-theme"),
      uiPreference: element.getAttribute("data-ui-preference"),
      legacyTheme: element.getAttribute("data-theme"),
    }))),
  };
}

test.describe("Theme application", () => {
  test.describe.configure({ timeout: 180_000 });

  test("data-theme 与 dark class 对齐（全部主题）", async ({ page }) => {
    for (const theme of THEMES_EXCEPT_SYSTEM) {
      const themedPage = await page.context().newPage();
      await themedPage.addInitScript((value) => localStorage.setItem("theme", value), theme);

      await openHome(themedPage);

      await expect(themedPage.locator("html")).toHaveAttribute("data-theme", theme);
      const hasDark = await themedPage
        .locator("html")
        .evaluate((el) => el.classList.contains("dark"));
      expect(hasDark).toBe(UI.theme.darkThemes.includes(theme));
      await themedPage.close();
    }
  });
});

test.describe("Theme runtime", () => {
  test("theme toggle only exposes light / dark / system", async ({ page }) => {
    await gotoWithTheme(page, "/", "system");

    const toggleButtons = page.locator(
      'header button[title="Auto"], header button[title="Light"], header button[title="Dark"]'
    );

    await expect(page.getByRole("button", { name: /auto/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /light/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /dark/i })).toBeVisible();
    await expect(toggleButtons).toHaveCount(3);
  });

  test("light preference resolves to light runtime attributes", async ({ page }) => {
    await gotoWithTheme(page, "/", "light");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-ui-preference", "light");
    await expect(html).toHaveAttribute("data-ui-theme", "light");
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test.describe("system preference mapping", () => {
    test.use({ colorScheme: "light" });

    test("system + light OS resolves to light", async ({ page }) => {
      await gotoWithTheme(page, "/", "system");

      const html = page.locator("html");
      await expect(html).toHaveAttribute("data-ui-preference", "system");
      await expect(html).toHaveAttribute("data-ui-theme", "light");
      await expect(html).toHaveAttribute("data-theme", "light");
    });
  });

  test.describe("system preference mapping (dark)", () => {
    test.use({ colorScheme: "dark" });

    test("system + dark OS resolves to dark", async ({ page }) => {
      await gotoWithTheme(page, "/", "system");

      const html = page.locator("html");
      await expect(html).toHaveAttribute("data-ui-preference", "system");
      await expect(html).toHaveAttribute("data-ui-theme", "dark");
      await expect(html).toHaveAttribute("data-theme", "dark");
    });
  });
});

test.describe("Memos contrast", () => {
  test("light theme keeps memo copy legible", async ({ page }) => {
    await gotoWithTheme(page, "/memos", "light");
    const sample = await readMemoSampleColors(page);

    expect(sample.uiPreference).toBe("light");
    expect(sample.uiTheme).toBe("light");
    expect(sample.legacyTheme).toBe("light");
    expect(sample.fg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sample.panelBgColor !== "rgba(0, 0, 0, 0)" || sample.panelBgImage !== "none").toBe(true);
    expect(sample.panelBackdropFilter).not.toBe("none");
  });

  test("dark theme keeps memo copy legible", async ({ page }) => {
    await gotoWithTheme(page, "/memos", "dark");
    const sample = await readMemoSampleColors(page);

    expect(sample.uiPreference).toBe("dark");
    expect(sample.uiTheme).toBe("dark");
    expect(sample.legacyTheme).toBe("dark");
    expect(sample.fg).not.toBe("rgba(0, 0, 0, 0)");
    expect(sample.panelBgColor !== "rgba(0, 0, 0, 0)" || sample.panelBgImage !== "none").toBe(true);
    expect(sample.panelBackdropFilter).not.toBe("none");
  });
});
