import { expect, type Locator, type Page, test } from "@playwright/test";
import sharp from "sharp";

type Theme = "light" | "dark";

async function gotoWithTheme(page: Page, route: string, theme: Theme) {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await page.addInitScript(() => {
    const scopedWindow = window as Window & { __naturePageLoadReady?: boolean };
    if (scopedWindow.__naturePageLoadReady) return;
    scopedWindow.__naturePageLoadReady = false;
    document.addEventListener("astro:page-load", () => {
      scopedWindow.__naturePageLoadReady = true;
    });
  });
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const scopedWindow = window as Window & { __naturePageLoadReady?: boolean };
    return scopedWindow.__naturePageLoadReady === true;
  });
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", theme);
}

async function expectEdgeToEdge(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox();
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(bounds).not.toBeNull();
  expect(Math.abs(bounds?.x ?? -100)).toBeLessThanOrEqual(1);
  expect(Math.abs((bounds?.x ?? 0) + (bounds?.width ?? 0) - viewportWidth)).toBeLessThanOrEqual(1);
}

function parseCssColor(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) throw new Error(`Unsupported computed color: ${value}`);
  return {
    red: channels[0] ?? 0,
    green: channels[1] ?? 0,
    blue: channels[2] ?? 0,
    alpha: channels[3] ?? 1,
  };
}

function composite(foreground: ReturnType<typeof parseCssColor>, background: number[]) {
  return [foreground.red, foreground.green, foreground.blue].map((channel, index) =>
    Math.round(channel * foreground.alpha + (background[index] ?? 0) * (1 - foreground.alpha))
  );
}

function luminance(rgb: number[]) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrastRatio(first: number[], second: number[]) {
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

async function sampleSurfaceContrast(page: Page, surface: Locator, text: Locator, frames: number) {
  await text.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(text).toBeVisible();
  await page.waitForTimeout(450);

  const textColor = parseCssColor(
    await text.evaluate((element) => getComputedStyle(element).color)
  );
  const ratios: number[] = [];

  for (let frame = 0; frame < frames; frame += 1) {
    const surfaceBounds = await surface.evaluate((element) => {
      const surfaceRect = element.getBoundingClientRect();
      return {
        left: surfaceRect.left,
        right: surfaceRect.right,
        dpr: window.devicePixelRatio,
      };
    });
    const textBounds = await text.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { y: rect.top + rect.height / 2 };
    });
    const screenshot = await page.screenshot({ animations: "allow" });
    const { data, info } = await sharp(screenshot)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const sampleX = [
      surfaceBounds.left + 4,
      surfaceBounds.left + 8,
      surfaceBounds.right - 5,
      surfaceBounds.right - 9,
    ];
    const sampleY = [textBounds.y - 2, textBounds.y, textBounds.y + 2];

    for (const x of sampleX) {
      for (const y of sampleY) {
        const px = Math.min(info.width - 1, Math.max(0, Math.round(x * surfaceBounds.dpr)));
        const py = Math.min(info.height - 1, Math.max(0, Math.round(y * surfaceBounds.dpr)));
        const offset = (py * info.width + px) * info.channels;
        const background = [data[offset], data[offset + 1], data[offset + 2]] as number[];
        ratios.push(contrastRatio(composite(textColor, background), background));
      }
    }

    await page.waitForTimeout(180);
  }

  return Math.min(...ratios);
}

test.describe("mobile public reading surfaces", () => {
  test("edge-to-edge streams and primary prose fit every narrow viewport and theme", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/tags", "light");
    const tagRoute = await page.locator('main a[href^="/tags/"]').first().getAttribute("href");
    expect(tagRoute).toBeTruthy();

    if (!tagRoute) throw new Error("No public tag route was rendered");

    const routes: {
      path: string;
      streams: Array<{ selector: string; row: string; content: string }>;
      surfaces: Array<{
        selector: string;
        index?: number;
        text: string;
        inset?: number;
        edgeToEdge?: boolean;
      }>;
    }[] = [
      {
        path: "/",
        streams: [
          {
            selector: '[data-testid="home-timeline"]',
            row: ".nature-timeline-item",
            content: ".nature-timeline-content",
          },
        ],
        surfaces: [{ selector: ".nature-mobile-reading-surface", text: "p" }],
      },
      {
        path: "/posts",
        streams: [
          {
            selector: ".nature-mobile-reading-stream",
            row: ".nature-mobile-reading-row",
            content: ".post-list-copy",
          },
        ],
        surfaces: [],
      },
      {
        path: "/memos",
        streams: [
          {
            selector: ".nature-mobile-reading-stream",
            row: ".nature-timeline-item",
            content: ".nature-timeline-content",
          },
        ],
        surfaces: [],
      },
      {
        path: tagRoute,
        streams: [
          {
            selector: ".nature-mobile-reading-stream",
            row: ".tag-detail-entry",
            content: ".tag-detail-entry > div",
          },
        ],
        surfaces: [],
      },
      {
        path: "/search/?q=Hello",
        streams: [
          {
            selector: ".nature-mobile-reading-stream",
            row: ".nature-mobile-reading-row",
            content: ".search-result-card .min-w-0",
          },
        ],
        surfaces: [],
      },
      {
        path: "/posts/code-block-fixture",
        streams: [],
        surfaces: [
          { selector: ".post-detail-header", text: "h1" },
          { selector: ".post-detail-body", text: "p" },
        ],
      },
      {
        path: "/memos/local-memo",
        streams: [],
        surfaces: [{ selector: ".memo-detail-card", text: "p" }],
      },
      {
        path: "/projects/kaisoumail",
        streams: [],
        surfaces: [
          { selector: ".project-detail-header", text: "p" },
          { selector: ".project-mdx-section", text: "p", inset: 16, edgeToEdge: false },
        ],
      },
      {
        path: "/projects",
        streams: [],
        surfaces: [{ selector: ".projects-domain-stack", text: ".projects-domain-framing" }],
      },
      {
        path: "/about",
        streams: [],
        surfaces: [
          { selector: ".nature-mobile-reading-surface", text: "p" },
          { selector: ".nature-mobile-reading-surface", index: 1, text: ".nature-prose p" },
        ],
      },
    ];

    for (const width of [393, 375, 360, 320]) {
      await page.setViewportSize({ width, height: 852 });
      const expectedInset = width < 375 ? 12 : 16;

      for (const theme of ["light", "dark"] as const) {
        for (const route of routes) {
          await gotoWithTheme(page, route.path, theme);
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
              )
            )
            .toBe(true);

          for (const streamSpec of route.streams) {
            const stream = page.locator(streamSpec.selector).first();
            const row = stream.locator(streamSpec.row).first();
            const content = stream.locator(streamSpec.content).first();
            await expect(stream).toBeVisible();
            await expect(row).toBeVisible();
            await expectEdgeToEdge(stream, page);
            const contentBounds = await content.boundingBox();
            expect(contentBounds).not.toBeNull();
            expect(Math.abs((contentBounds?.x ?? 0) - expectedInset)).toBeLessThanOrEqual(1);
            const expectedDividerWidth = await row.evaluate((element) =>
              element.nextElementSibling ? "1px" : "0px"
            );
            await expect(row).toHaveCSS("border-bottom-width", expectedDividerWidth);
            await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          }

          for (const surfaceSpec of route.surfaces) {
            const surface = page.locator(surfaceSpec.selector).nth(surfaceSpec.index ?? 0);
            const text = surface.locator(surfaceSpec.text).first();
            await expect(surface).toBeVisible();
            await expect(text).toBeVisible();
            if (surfaceSpec.edgeToEdge !== false) await expectEdgeToEdge(surface, page);
            const surfaceBounds = await surface.boundingBox();
            const textBounds = await text.boundingBox();
            expect(surfaceBounds).not.toBeNull();
            expect(textBounds).not.toBeNull();
            expect(
              Math.abs(
                (textBounds?.x ?? 0) -
                  (surfaceBounds?.x ?? 0) -
                  (surfaceSpec.inset ?? expectedInset)
              )
            ).toBeLessThanOrEqual(1);
          }
        }
      }
    }

    for (const width of [640, 1024]) {
      await page.setViewportSize({ width, height: 768 });
      await gotoWithTheme(page, "/posts", "light");
      const stream = page.locator(".nature-mobile-reading-stream").first();
      const bounds = await stream.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.x ?? 0).toBeGreaterThan(0);
      expect(bounds?.width ?? width).toBeLessThan(width);

      await gotoWithTheme(page, "/projects", "light");
      const projectSurfaceBounds = await page.locator(".projects-domain-stack").boundingBox();
      expect(projectSurfaceBounds).not.toBeNull();
      expect(projectSurfaceBounds?.x ?? 0).toBeGreaterThan(0);
      expect(projectSurfaceBounds?.width ?? width).toBeLessThan(width);
    }
  });

  test("composited text contrast stays AA-readable across ambient frames and theme changes", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 393, height: 852 });

    const cases = [
      { path: "/", surface: ".nature-mobile-reading-surface", text: "p" },
      {
        path: "/posts/code-block-fixture",
        surface: ".post-detail-body",
        text: "p",
      },
      { path: "/memos/local-memo", surface: ".memo-detail-card", text: "p" },
      { path: "/projects/kaisoumail", surface: ".project-mdx-section", text: "p" },
      {
        path: "/projects",
        surface: ".projects-domain-stack",
        text: ".projects-domain-framing",
      },
      {
        path: "/about",
        surface: ".nature-mobile-reading-surface",
        index: 1,
        text: "p",
      },
    ];

    for (const theme of ["light", "dark"] as const) {
      for (const item of cases) {
        await gotoWithTheme(page, item.path, theme);
        const surface = page.locator(item.surface).nth(item.index ?? 0);
        const text = surface.locator(item.text).first();
        await expect(text).toBeVisible();
        const ratio = await sampleSurfaceContrast(page, surface, text, 3);
        expect(ratio, `${theme} ${item.path} minimum sampled contrast`).toBeGreaterThanOrEqual(4.5);
      }
    }

    await gotoWithTheme(page, "/", "light");
    const homeSurface = page.locator(".nature-mobile-reading-surface").first();
    const lightBackground = await homeSurface.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    await page.evaluate(() => {
      document.documentElement.dataset.uiTheme = "dark";
      document.documentElement.dataset.theme = "dark";
    });
    const darkBackground = await homeSurface.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    expect(darkBackground).not.toBe(lightBackground);
  });

  test("press and keyboard feedback stay within the actionable search row", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/search/?q=Hello", "light");
    const link = page.locator("a[data-search-result-card]").first();
    const card = link.locator(".search-result-card");
    const content = card.locator(".min-w-0");
    await expect(link).toBeVisible();
    await expectEdgeToEdge(link, page);
    const linkBox = await link.boundingBox();
    const contentBox = await content.boundingBox();
    expect(linkBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(Math.abs((contentBox?.x ?? 0) - 16)).toBeLessThanOrEqual(1);

    await link.evaluate((element) => {
      element.addEventListener("click", (event) => event.preventDefault(), { once: true });
    });
    await page.mouse.move((linkBox?.x ?? 0) + 24, (linkBox?.y ?? 0) + 24);
    await page.mouse.down();
    await expect
      .poll(async () => {
        const pressedBackground = await card.evaluate(
          (element) => getComputedStyle(element).backgroundColor
        );
        return parseCssColor(pressedBackground).alpha;
      })
      .toBeGreaterThan(0);
    await page.mouse.up();

    await gotoWithTheme(page, "/search/?q=Hello", "dark");
    const focusedLink = page.locator("a[data-search-result-card]").first();
    const focusedCard = focusedLink.locator(".search-result-card");
    let focused = false;
    for (let index = 0; index < 80 && !focused; index += 1) {
      await page.keyboard.press("Tab");
      focused = await focusedLink.evaluate((element) => document.activeElement === element);
    }
    expect(focused).toBe(true);
    expect(await focusedLink.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(focusedCard).toHaveCSS("outline-style", "solid");
    await expect(focusedCard).toHaveCSS("outline-width", "2px");
    await expectEdgeToEdge(focusedLink, page);

    await gotoWithTheme(page, "/memos", "light");
    const staticMemo = page.locator(".nature-timeline-item .nature-timeline-card").first();
    const staticBox = await staticMemo.boundingBox();
    expect(staticBox).not.toBeNull();
    const beforeUrl = page.url();
    await page.mouse.move((staticBox?.x ?? 0) + 24, (staticBox?.y ?? 0) + 24);
    await page.mouse.down();
    const staticBackground = await staticMemo.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    expect(parseCssColor(staticBackground).alpha).toBe(0);
    await page.mouse.up();
    await expect(page).toHaveURL(beforeUrl);
  });
});
