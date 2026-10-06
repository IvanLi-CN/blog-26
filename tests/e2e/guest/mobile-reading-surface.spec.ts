import { expect, type Locator, type Page, test } from "@playwright/test";
import sharp from "sharp";

type Theme = "light" | "dark" | "system";
const pagesWithReadingSurfaceInit = new WeakSet<Page>();

async function gotoWithTheme(page: Page, route: string, theme: Theme) {
  if (!pagesWithReadingSurfaceInit.has(page)) {
    await page.addInitScript(() => {
      const scopedWindow = window as Window & { __naturePageLoadReady?: boolean };
      const requestedTheme = new URL(window.location.href).searchParams.get("__e2e_theme");
      if (requestedTheme === "light" || requestedTheme === "dark" || requestedTheme === "system") {
        localStorage.setItem("theme", requestedTheme);
      }
      scopedWindow.__naturePageLoadReady = false;
      document.addEventListener("astro:page-load", () => {
        scopedWindow.__naturePageLoadReady = true;
      });
    });
    pagesWithReadingSurfaceInit.add(page);
  }
  const separator = route.includes("?") ? "&" : "?";
  await page.goto(`${route}${separator}__e2e_theme=${theme}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const scopedWindow = window as Window & { __naturePageLoadReady?: boolean };
    return scopedWindow.__naturePageLoadReady === true;
  });
  if (theme === "system") {
    const resolvedTheme = await page.evaluate(() =>
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", resolvedTheme);
    await expect(page.locator("html")).toHaveAttribute("data-ui-preference", "system");
  } else {
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", theme);
  }
}

async function addLongReadingFixture(surface: Locator) {
  await surface.evaluate((element) => {
    const title = document.createElement("h2");
    title.className = "nature-title text-lg font-semibold";
    title.textContent = "NarrowViewport".repeat(12);
    title.dataset.testid = "e2e-long-reading-title";

    const url = document.createElement("p");
    url.className = "nature-muted";
    url.textContent = `https://${"segment".repeat(28)}.example/path`;
    url.dataset.testid = "e2e-long-reading-url";

    element.prepend(url, title);
    const code = element.querySelector("pre code");
    code?.append(document.createTextNode(`\nconst longIdentifier = ${"unbroken".repeat(24)};`));
  });
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

async function sampleSurfaceContrast(
  page: Page,
  surface: Locator,
  text: Locator,
  frames: number,
  context: string
) {
  // Keep the sampled node's identity while scrolling changes the virtualized window.
  const sampledText = await text.elementHandle();
  if (!sampledText) throw new Error(`${context}: reading text is not mounted`);
  await sampledText.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await sampledText.waitForElementState("visible");
  await page.waitForTimeout(450);

  const samplePoints = await sampledText.evaluate((element) => {
    const surface = element.closest(
      ".nature-mobile-reading-surface, .nature-mobile-reading-stream, .post-detail-header, .post-detail-body, .memo-detail-card, .project-detail-header, .project-mdx-section, .projects-domain-stack"
    );
    if (!surface) throw new Error("Reading text is not inside a known reading surface");
    const range = document.createRange();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const surfaceWalker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
    const textRects: DOMRect[] = [];
    while (surfaceWalker.nextNode()) {
      const textNode = surfaceWalker.currentNode;
      if (!textNode.textContent?.trim()) continue;
      range.selectNodeContents(textNode);
      textRects.push(...Array.from(range.getClientRects()));
    }
    const points: Array<{ x: number; y: number; color: string; opacity: number }> = [];

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      if (!textNode.textContent?.trim()) continue;
      range.selectNodeContents(textNode);
      const owner = textNode.parentElement ?? element;
      const color = getComputedStyle(owner).color;
      let opacity = 1;
      let ancestor: Element | null = owner;
      while (ancestor) {
        opacity *= Number(getComputedStyle(ancestor).opacity);
        ancestor = ancestor.parentElement;
      }

      for (const rect of range.getClientRects()) {
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
        const bounds = surface.getBoundingClientRect();
        const x = [
          ...[6, 8, 10, 12].map((offset) =>
            rect.right + offset < bounds.right - 2 ? rect.right + offset : rect.left - offset
          ),
          bounds.left + 4,
          bounds.left + 8,
          bounds.right - 4,
          bounds.right - 8,
        ].find((candidate) => {
          return (
            candidate > bounds.left + 2 &&
            candidate < bounds.right - 2 &&
            !textRects.some(
              (textRect) =>
                candidate >= textRect.left - 2 &&
                candidate <= textRect.right + 2 &&
                rect.top + rect.height / 2 >= textRect.top - 2 &&
                rect.top + rect.height / 2 <= textRect.bottom + 2
            )
          );
        });
        if (x === undefined) continue;
        points.push({
          x,
          y: Math.min(window.innerHeight - 2, Math.max(2, rect.top + rect.height / 2)),
          color,
          opacity,
        });
      }
    }

    return points;
  });
  expect(samplePoints.length, `${context}: visible text line fragments to sample`).toBeGreaterThan(
    0
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
    const screenshot = await page.screenshot({ animations: "allow" });
    const { data, info } = await sharp(screenshot)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (const point of samplePoints) {
      const color = parseCssColor(point.color);
      color.alpha *= point.opacity;
      const x = Math.min(surfaceBounds.right - 2, Math.max(surfaceBounds.left + 2, point.x));
      const centerX = Math.min(info.width - 1, Math.max(0, Math.round(x * surfaceBounds.dpr)));
      const centerY = Math.min(
        info.height - 1,
        Math.max(0, Math.round(point.y * surfaceBounds.dpr))
      );
      const offset = (centerY * info.width + centerX) * info.channels;
      const background = [data[offset], data[offset + 1], data[offset + 2]] as number[];
      ratios.push(contrastRatio(composite(color, background), background));
    }

    await page.waitForTimeout(180);
  }

  await sampledText.dispose();
  return Math.min(...ratios);
}

test.describe("mobile public reading surfaces", () => {
  test("edge-to-edge streams and primary prose fit every narrow viewport and theme", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/tags", "light");
    const tagRoute = "/tags/intro";

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
            const expectedDividerWidth = await row.evaluate((element) => {
              if (element.closest(".virtualized-memo-row")) {
                return element.getAttribute("data-is-last") === "true" ? "0px" : "1px";
              }
              return element.nextElementSibling ? "1px" : "0px";
            });
            await expect(row).toHaveCSS("border-bottom-width", expectedDividerWidth);
            await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

            if (route.path === tagRoute || route.path.startsWith("/search/")) {
              const typeChip = row.locator(".nature-chip").first();
              const accessibleType = typeChip.locator(".sr-only");
              await expect(typeChip.locator(".nature-content-type-icon")).toBeVisible();
              await expect(accessibleType).toHaveCSS("position", "absolute");
              await expect(accessibleType).toHaveCSS("width", "1px");
              await expect(accessibleType).toHaveCSS("height", "1px");
              await expect(accessibleType).toHaveCSS("overflow", "hidden");
              await expect(typeChip).toHaveCSS("border-width", "0px");
              await expect(typeChip).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
              if (route.path.startsWith("/search/")) {
                await expect(row.locator("a[data-search-result-card]")).toHaveAccessibleName(
                  /打开(?:文章|闪念)：/
                );
              }
            }
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

      await gotoWithTheme(page, tagRoute ?? "/tags", "light");
      const desktopTypeChip = page.locator(".nature-content-type-chip").first();
      await expect(desktopTypeChip.locator(".sr-only")).toBeVisible();
      await expect(desktopTypeChip).toHaveCSS("border-width", "1px");

      await gotoWithTheme(page, "/search/?q=Hello", "light");
      const desktopSearchTypeChip = page.locator(".nature-content-type-chip").first();
      await expect(desktopSearchTypeChip.locator(".nature-content-type-icon")).toBeHidden();
      await expect(desktopSearchTypeChip.locator(".sr-only")).toBeVisible();
    }
  });

  test("composited text contrast stays AA-readable across ambient frames and theme changes", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/tags", "light");
    const tagRoute = "/tags/intro";

    const cases = [
      { path: "/", surface: ".nature-mobile-reading-surface", text: "p" },
      {
        path: "/",
        surface: ".nature-mobile-reading-stream",
        text: ".nature-timeline-content",
      },
      {
        path: "/posts",
        surface: ".nature-mobile-reading-stream",
        text: ".post-list-copy, h2, time",
      },
      {
        path: "/memos",
        surface: ".nature-mobile-reading-stream",
        text: ".nature-timeline-content p, time",
      },
      {
        path: tagRoute ?? "/tags",
        surface: ".nature-mobile-reading-stream",
        text: ".tag-detail-entry h2, .tag-detail-entry p, time",
      },
      {
        path: "/posts/code-block-fixture",
        surface: ".post-detail-header",
        text: "h1, p, time",
      },
      {
        path: "/posts/code-block-fixture",
        surface: ".post-detail-body",
        text: "p",
      },
      {
        path: "/memos/local-memo",
        surface: ".memo-detail-card",
        text: "h1, p, time",
      },
      {
        path: "/projects/kaisoumail",
        surface: ".project-detail-header",
        text: "h1, p",
      },
      { path: "/projects/kaisoumail", surface: ".project-mdx-section", text: "p" },
      {
        path: "/projects",
        surface: ".projects-domain-stack",
        text: ".projects-domain-framing",
      },
      {
        path: "/search/?q=Hello",
        surface: ".nature-mobile-reading-stream",
        text: "[data-search-match-meta], [data-search-relevance-meta], .search-result-card h2, .search-result-card .nature-muted",
      },
      {
        path: "/about",
        surface: ".nature-mobile-reading-surface",
        index: 0,
        text: "h1, p",
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
        const texts = surface.locator(item.text);
        await expect(texts.first()).toBeVisible();
        // Pagination may mount additional rows; keep this contrast scenario's sample set finite.
        const sampleCount = await texts.count();
        for (let index = 0; index < sampleCount; index += 1) {
          const text = texts.nth(index);
          if (!(await text.isVisible())) continue;
          const ratio = await sampleSurfaceContrast(
            page,
            surface,
            text,
            3,
            `${theme} ${item.path} ${item.text} item ${index}`
          );
          expect(
            ratio,
            `${theme} ${item.path} ${item.text} item ${index} minimum sampled contrast`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }

    for (const theme of ["light", "dark"] as const) {
      await gotoWithTheme(page, "/posts/code-block-fixture", theme);
      const body = page.locator(".post-detail-body");
      await body.evaluate((element) => {
        const placeholder = document.createElement("div");
        placeholder.className = "nature-faint py-8 text-center italic";
        placeholder.textContent = "暂无内容";
        element.append(placeholder);
      });
      const placeholder = body.getByText("暂无内容");
      const ratio = await sampleSurfaceContrast(
        page,
        body,
        placeholder,
        3,
        `${theme} empty Markdown placeholder`
      );
      expect(ratio, `${theme} empty Markdown placeholder contrast`).toBeGreaterThanOrEqual(4.5);
    }

    await page.emulateMedia({ colorScheme: "dark" });
    await gotoWithTheme(page, "/", "system");
    const homeSurface = page.locator(".nature-mobile-reading-surface").first();
    const darkBackground = await homeSurface.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    const darkSystemContrast = await sampleSurfaceContrast(
      page,
      homeSurface,
      homeSurface.locator("p").first(),
      3,
      "dark system theme homepage introduction"
    );
    expect(darkSystemContrast).toBeGreaterThanOrEqual(4.5);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "light");
    const lightBackground = await homeSurface.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    expect(darkBackground).not.toBe(lightBackground);
    const lightSystemContrast = await sampleSurfaceContrast(
      page,
      homeSurface,
      homeSurface.locator("p").first(),
      3,
      "light system theme homepage introduction"
    );
    expect(lightSystemContrast).toBeGreaterThanOrEqual(4.5);
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

  test("edge-to-edge reading surfaces follow the available layout width", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/posts", "light");
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--nature-reading-viewport-width")
        )
      )
      .toBe(`${viewportWidth}px`);
    await page.setViewportSize({ width: 392, height: 852 });
    const resizedViewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--nature-reading-viewport-width")
        )
      )
      .toBe(`${resizedViewportWidth}px`);
    await page.setViewportSize({ width: 393, height: 852 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--nature-reading-viewport-width")
        )
      )
      .toBe("393px");
    await page.addStyleTag({
      content: ".nature-app-shell { width: calc(100% - 16px) !important; }",
    });
    const availableWidth = await page.locator(".nature-app-shell").evaluate((element) => {
      const width = element.getBoundingClientRect().width;
      document.documentElement.style.setProperty("--nature-reading-viewport-width", `${width}px`);
      document.documentElement.style.setProperty(
        "--nature-reading-viewport-half-width",
        `${width / 2}px`
      );
      return width;
    });

    const stream = page.locator(".nature-mobile-reading-stream").first();
    const streamBounds = await stream.boundingBox();
    expect(streamBounds).not.toBeNull();
    expect(Math.abs(streamBounds?.x ?? -100)).toBeLessThanOrEqual(1);
    expect(
      Math.abs((streamBounds?.x ?? 0) + (streamBounds?.width ?? 0) - availableWidth)
    ).toBeLessThanOrEqual(1);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--nature-reading-viewport-width")
        )
      )
      .toBe(`${availableWidth}px`);
  });

  test("long unbroken text stays inside the reading surface while code scrolls locally", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await gotoWithTheme(page, "/posts/code-block-fixture", "light");
    await addLongReadingFixture(page.locator(".post-detail-body"));

    for (const theme of ["light", "dark"] as const) {
      if (theme === "dark") await gotoWithTheme(page, "/posts/code-block-fixture", theme);
      const surface = page.locator(".post-detail-body");
      if (theme === "dark") await addLongReadingFixture(surface);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
          )
        )
        .toBe(true);
      for (const locator of [
        page.getByTestId("e2e-long-reading-title"),
        page.getByTestId("e2e-long-reading-url"),
      ]) {
        const dimensions = await locator.evaluate((element) => ({
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }));
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      }
      const code = page.locator(".post-detail-body pre").first();
      await expect(code).toBeVisible();
      const codeDimensions = await code.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      expect(codeDimensions.scrollWidth).toBeGreaterThan(codeDimensions.clientWidth);
    }
  });
});
