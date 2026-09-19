import { expect, type Page, test } from "@playwright/test";
import { UI } from "../../../src/config/site";

type ThemePreference = (typeof UI.theme.options)[number];
type ResolvedTheme = Exclude<ThemePreference, "system">;

type RgbColor = [number, number, number];

const THEMES_EXCEPT_SYSTEM = UI.theme.options.filter(
  (theme): theme is ResolvedTheme => theme !== "system"
);
const DARK_THEMES = new Set<ResolvedTheme>(UI.theme.darkResolved);

function parseRgbColor(color: string): RgbColor {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (channels?.length !== 3) {
    throw new Error(`Unable to parse computed color: ${color}`);
  }
  return channels as RgbColor;
}

function relativeLuminance(color: RgbColor) {
  return color.reduce((sum, channel, index) => {
    const normalized = channel / 255;
    const linear =
      normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(parseRgbColor(foreground));
  const backgroundLuminance = relativeLuminance(parseRgbColor(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseBackgroundColors(backgroundColor: string, backgroundImage: string) {
  const imageColors = backgroundImage.match(/rgba?\([^)]*\)/g) ?? [];
  return [backgroundColor, ...imageColors];
}

async function expectPrimaryActionContrast(action: ReturnType<Page["locator"]>, label: string) {
  await expect(action).toBeVisible();
  const readState = async (state: string) => {
    const colors = await action.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        foreground: style.color,
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    for (const background of parseBackgroundColors(colors.background, colors.backgroundImage)) {
      expect(
        contrastRatio(colors.foreground, background),
        `${label} ${state} contrast against ${background}`
      ).toBeGreaterThanOrEqual(4.5);
    }
    if (state === "focus") {
      expect(colors.outlineStyle, `${label} focus outline`).not.toBe("none");
      expect(colors.outlineWidth, `${label} focus outline width`).not.toBe("0px");
    }
  };

  await readState("default");
  await action.hover();
  await readState("hover");
  await action.focus();
  await readState("focus");
}

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
      expect(hasDark).toBe(DARK_THEMES.has(theme));
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

test.describe("Primary action contrast", () => {
  test("CTA and search submit keep AA contrast in every action state", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await gotoWithTheme(page, "/", theme);
      const homepageCta = page.getByRole("link", { name: "浏览文章" });
      await expectPrimaryActionContrast(homepageCta, `${theme} homepage CTA`);
      await expect(homepageCta).toHaveCSS("background-image", /gradient/);

      await gotoWithTheme(page, "/search?q=usb", theme);
      const searchSubmit = page.getByRole("button", { name: "搜索", exact: true });
      await expectPrimaryActionContrast(searchSubmit, `${theme} search submit`);
      await expect(searchSubmit).toHaveCSS("background-image", "none");
    }
  });
});
