import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { projectRuntimeMetricsBySlug } from "../../../site/lib/project-runtime-metrics";
import { formatRuntimeValue } from "../../../site/lib/runtime-format";

const sourceBaseUrl = "https://metrics.example.test";
const sourceEnvNames = [
  "PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL",
  "PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL",
  "PUBLIC_OCTO_RILL_METRICS_BASE_URL",
] as const;

type Theme = "light" | "dark";
type ResponseMode = "valid" | "error" | "invalid";

interface RouteOptions {
  getOctoCount?: () => number;
  getOctoMode?: () => ResponseMode;
  getHikariMode?: () => ResponseMode;
  installClock?: boolean;
  onRequest?: (slug: string) => void;
}

function octoPayload(repositoryCount: number) {
  const metrics = projectRuntimeMetricsBySlug["octo-rill"];
  return {
    deduplicatedRepositories: {
      value: repositoryCount,
      trend: Array.from({ length: 12 }, () => repositoryCount),
    },
    pressure: {
      value: metrics.pressure.value,
      trend: metrics.pressure.trend.points.map((point) => point.value ?? 0),
    },
    freshness: Array.from({ length: repositoryCount }, (_, index) => index % 5),
  };
}

function responsePayload(slug: string, repositoryCount = 501) {
  if (slug === "codex-vibe-monitor") {
    const metrics = projectRuntimeMetricsBySlug[slug];
    return {
      ...metrics,
      tokenActivity90d: { status: "partial", points: metrics.tokenActivity90d },
    };
  }
  if (slug === "tavily-hikari") {
    const { kind: _kind, ...metrics } = projectRuntimeMetricsBySlug[slug];
    return metrics;
  }
  return octoPayload(repositoryCount);
}

async function routeRuntimeResponses(page: Page, options: RouteOptions = {}) {
  await page.route(`${sourceBaseUrl}/api/public/metrics/v1/*`, async (route) => {
    const slug = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    options.onRequest?.(slug);
    if (slug === "tavily-hikari") {
      const mode = options.getHikariMode?.() ?? "error";
      if (mode === "error") {
        await route.fulfill({ status: 503, body: "" });
        return;
      }
      if (mode === "invalid") {
        const payload = responsePayload(slug) as { requestActivity90d: unknown };
        await route.fulfill({ json: { ...payload, requestActivity90d: [] } });
        return;
      }
      await route.fulfill({ json: responsePayload(slug) });
      return;
    }
    if (slug === "octo-rill") {
      const mode = options.getOctoMode?.() ?? "valid";
      if (mode === "error") {
        await route.fulfill({ status: 503, body: "" });
        return;
      }
      if (mode === "invalid") {
        await route.fulfill({ json: { freshness: [] } });
        return;
      }
      await route.fulfill({
        json: responsePayload(slug, options.getOctoCount?.() ?? 501),
      });
      return;
    }
    if (slug === "codex-vibe-monitor") {
      await route.fulfill({ json: responsePayload(slug) });
      return;
    }
    await route.fulfill({ status: 404, body: "" });
  });
}

async function openProjectPage(context: BrowserContext, theme: Theme, options: RouteOptions = {}) {
  const page = await context.newPage();
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  if (options.installClock) {
    await page.clock.install({ time: new Date("2026-10-04T08:00:00+08:00") });
  }
  await page.setViewportSize({ width: 1780, height: 1071 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeRuntimeResponses(page, options);
  await page.mouse.move(0, 0);
  await page.goto("/projects", { waitUntil: "domcontentloaded" });
  return page;
}

function projectCard(page: Page, slug: string) {
  return page.locator(`.projects-poster-card:has(a[href="/projects/${slug}/"])`);
}

async function readVisualBounds(page: Page, slug: string) {
  return projectCard(page, slug).evaluate((element) => {
    const slot = element.querySelector<HTMLElement>(".projects-poster-visual");
    const visual =
      element.querySelector<HTMLElement>(
        '[data-project-runtime-panel][data-runtime-state="ready"]'
      ) ??
      element.querySelector<HTMLElement>(
        "[data-runtime-fallback-poster]:not([hidden]) .project-poster, .projects-poster-poster-link > .project-poster"
      );
    const copy = element.querySelector<HTMLElement>(".projects-poster-copy");
    if (!slot || !visual || !copy) throw new Error("project visual structure is incomplete");
    const slotRect = slot.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    return {
      slotWidth: slotRect.width,
      slotHeight: slotRect.height,
      visualHeight: visualRect.height,
      copyTop: copyRect.top,
      slotBottom: slotRect.bottom,
    };
  });
}

test("@targeted project visual slot keeps the poster height after runtime data loads", async ({
  context,
}) => {
  for (const name of sourceEnvNames) {
    expect(process.env[name], `${name} must be set before the E2E build`).toBe(sourceBaseUrl);
  }

  for (const theme of ["dark", "light"] as const) {
    const page = await openProjectPage(context, theme);
    try {
      for (const width of [1780, 1048, 820, 772, 393, 375, 360, 320]) {
        await page.setViewportSize({ width, height: 1071 });
        for (const slug of ["codex-vibe-monitor", "tavily-hikari", "octo-rill", "loadlynx"]) {
          const card = projectCard(page, slug);
          if (slug !== "loadlynx" && slug !== "tavily-hikari") {
            await expect(
              card.locator('[data-project-runtime-panel][data-runtime-state="ready"]')
            ).toBeVisible();
          } else if (slug === "tavily-hikari") {
            await expect(card.locator("[data-runtime-fallback-poster]")).toBeVisible();
          }
          const bounds = await readVisualBounds(page, slug);
          const context = `${theme} ${width}px ${slug} ${JSON.stringify(bounds)}`;
          expect(
            Math.abs(bounds.slotHeight - bounds.slotWidth * 1.25),
            context
          ).toBeLessThanOrEqual(1);
          expect(Math.abs(bounds.visualHeight - bounds.slotHeight), context).toBeLessThanOrEqual(1);
          expect(bounds.copyTop, context).toBeGreaterThan(bounds.slotBottom);
        }
        const adjacentWidths = await page
          .locator(
            '.projects-poster-card:has(a[href="/projects/tavily-hikari/"]), .projects-poster-card:has(a[href="/projects/octo-rill/"])'
          )
          .evaluateAll((cards) =>
            cards.map((card) => {
              const rect = (selector: string) =>
                card.querySelector(selector)?.getBoundingClientRect();
              return {
                slot: rect(".projects-poster-visual")?.width ?? 0,
                height: rect(".projects-poster-visual")?.height ?? 0,
              };
            })
          );
        expect(
          Math.abs(adjacentWidths[0].slot - adjacentWidths[1].slot),
          `${theme} ${width}px ${JSON.stringify(adjacentWidths)}`
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(adjacentWidths[0].height - adjacentWidths[1].height),
          `${theme} ${width}px ${JSON.stringify(adjacentWidths)}`
        ).toBeLessThanOrEqual(1);
      }
    } finally {
      await page.close();
    }
  }
});

test("@targeted OctoRill freshness density keeps every repository in the fixed panel", async ({
  context,
}) => {
  let repositoryCount = 0;
  const page = await openProjectPage(context, "dark", {
    getOctoCount: () => repositoryCount,
    getHikariMode: () => "valid",
    installClock: true,
  });
  try {
    await page.setViewportSize({ width: 1048, height: 1071 });
    const octo = projectCard(page, "octo-rill");
    const panel = octo.locator('[data-project-runtime-panel][data-runtime-state="ready"]');
    const grid = octo.locator(".runtime-freshness-grid");
    await expect(panel).toBeVisible();
    await expect(grid).toHaveCount(1);
    await expect(grid.locator(".runtime-freshness-cell")).toHaveCount(0);

    const readUpper = () =>
      octo.evaluate((element) => {
        const read = (selector: string) =>
          element.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        const metric = read(".runtime-metric-grid");
        const logo = read("[data-runtime-project-logo]");
        const value = element.querySelector<HTMLElement>(".runtime-metric-value");
        const label = element.querySelector<HTMLElement>(".runtime-metric-label");
        if (!metric || !logo || !value || !label)
          throw new Error("OctoRill upper metrics are incomplete");
        return {
          metric: {
            x: metric.x,
            y: metric.y,
            width: metric.width,
            height: metric.height,
          },
          logo: { x: logo.x, y: logo.y, width: logo.width, height: logo.height },
          fontSize: getComputedStyle(value).fontSize,
          labelFontSize: getComputedStyle(label).fontSize,
        };
      });
    let baseline = await readUpper();

    const assertFreshness = async (expectedCount: number, label: string) => {
      await expect(grid.locator(".runtime-freshness-cell")).toHaveCount(expectedCount);
      const snapshot = await grid.evaluate((element) => {
        const gridRect = element.getBoundingClientRect();
        const section = element.closest<HTMLElement>(".runtime-freshness");
        const title = section?.querySelector<HTMLElement>(".runtime-chart-title");
        const panelRect = element
          .closest<HTMLElement>(".project-runtime-panel")
          ?.getBoundingClientRect();
        const metricRect = element
          .closest<HTMLElement>(".project-runtime-panel")
          ?.querySelector<HTMLElement>(".runtime-metric-grid")
          ?.getBoundingClientRect();
        const cells = Array.from(element.querySelectorAll<HTMLElement>(".runtime-freshness-cell"));
        const rects = cells.map((cell) => {
          const rect = cell.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        });
        return {
          grid: {
            left: gridRect.left,
            right: gridRect.right,
            top: gridRect.top,
            bottom: gridRect.bottom,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            scrollHeight: element.scrollHeight,
          },
          titleBottom: title?.getBoundingClientRect().bottom,
          titleGap: section ? Number.parseFloat(getComputedStyle(section).rowGap) : undefined,
          columns: Number(element.style.getPropertyValue("--runtime-freshness-columns")),
          panel: panelRect && {
            left: panelRect.left,
            right: panelRect.right,
            top: panelRect.top,
            bottom: panelRect.bottom,
          },
          metricBottom: metricRect?.bottom,
          statuses: cells.map((cell) => cell.dataset.statusCode),
          ariaRows: Number(element.getAttribute("aria-rowcount")),
          ariaColumns: Number(element.getAttribute("aria-colcount")),
          cssRows: Number.parseInt(
            getComputedStyle(element).getPropertyValue("--runtime-freshness-rows"),
            10
          ),
          cssColumns: Number.parseInt(
            getComputedStyle(element).getPropertyValue("--runtime-freshness-columns"),
            10
          ),
          rowSizes: Array.from(element.querySelectorAll<HTMLElement>('[role="row"]')).map(
            (row) => row.querySelectorAll<HTMLElement>(".runtime-freshness-cell").length
          ),
          rects,
        };
      });
      expect(snapshot.statuses, label).toEqual(
        Array.from({ length: expectedCount }, (_, index) => String(index % 5))
      );
      expect(snapshot.panel, label).toBeTruthy();
      if (snapshot.panel) {
        expect(snapshot.grid.left, label).toBeGreaterThanOrEqual(snapshot.panel.left - 1);
        expect(snapshot.grid.right, label).toBeLessThanOrEqual(snapshot.panel.right + 1);
        expect(snapshot.grid.top, label).toBeGreaterThanOrEqual(snapshot.panel.top - 1);
        expect(snapshot.grid.bottom, label).toBeLessThanOrEqual(snapshot.panel.bottom + 1);
      }
      expect(snapshot.metricBottom, label).toBeDefined();
      if (snapshot.metricBottom !== undefined) {
        expect(snapshot.grid.top, label).toBeGreaterThanOrEqual(snapshot.metricBottom - 1);
      }
      expect(snapshot.titleBottom, label).toBeDefined();
      if (expectedCount > 0) {
        expect(snapshot.ariaColumns, label).toBe(snapshot.cssColumns);
        expect(snapshot.ariaRows, label).toBe(snapshot.cssRows);
        expect(snapshot.rowSizes, label).toEqual(
          Array.from({ length: snapshot.cssRows }, (_, rowIndex) =>
            Math.min(snapshot.cssColumns, expectedCount - rowIndex * snapshot.cssColumns)
          )
        );
        expect(
          snapshot.rects.every((rect) => rect.width > 0 && rect.height > 0),
          label
        ).toBe(true);
        const lastRect = snapshot.rects.at(-1);
        expect(lastRect, label).toBeDefined();
        if (lastRect) {
          expect(
            Math.abs(lastRect.bottom - snapshot.grid.bottom),
            `${label} freshness should align to the bottom of its available region`
          ).toBeLessThanOrEqual(1);
        }
        expect(snapshot.titleGap, label).toBeCloseTo(0.55 * 16, 1);
        if (snapshot.titleBottom !== undefined && snapshot.titleGap !== undefined) {
          expect(
            Math.abs(snapshot.rects[0].top - snapshot.titleBottom - snapshot.titleGap),
            `${label} title should stay adjacent to the freshness grid`
          ).toBeLessThanOrEqual(1);
        }
        if (snapshot.columns > 0 && expectedCount >= snapshot.columns) {
          const completeRowEnd = snapshot.rects[snapshot.columns - 1];
          expect(completeRowEnd, label).toBeDefined();
          if (completeRowEnd) {
            expect(
              Math.abs(completeRowEnd.right - snapshot.grid.right),
              `${label} complete rows should fill the freshness width`
            ).toBeLessThanOrEqual(1);
          }
        }
        expect(
          snapshot.rects.every((rect) => Math.abs(rect.width - rect.height) <= 1),
          label
        ).toBe(true);
        expect(
          snapshot.rects.every(
            (rect) =>
              rect.left >= snapshot.grid.left - 1 &&
              rect.right <= snapshot.grid.right + 1 &&
              rect.top >= snapshot.grid.top - 1 &&
              rect.bottom <= snapshot.grid.bottom + 1
          ),
          label
        ).toBe(true);
      } else {
        expect(snapshot.titleGap, label).toBe(0);
        expect(snapshot.grid.bottom - snapshot.grid.top, label).toBeLessThanOrEqual(1);
        if (snapshot.titleBottom !== undefined) {
          expect(Math.abs(snapshot.grid.top - snapshot.titleBottom), label).toBeLessThanOrEqual(1);
        }
      }
      expect(snapshot.grid.scrollWidth).toBeLessThanOrEqual(snapshot.grid.clientWidth + 1);
      expect(snapshot.grid.scrollHeight).toBeLessThanOrEqual(snapshot.grid.clientHeight + 1);

      expect(await readUpper()).toEqual(baseline);
    };

    for (const nextCount of [1, 30, 31, 502, 503, 3000, 10000, 502]) {
      repositoryCount = nextCount;
      await page.clock.fastForward(300_001);
      await assertFreshness(nextCount, `dark 1048px ${nextCount}`);
    }

    await page.setViewportSize({ width: 320, height: 1071 });
    baseline = await readUpper();
    repositoryCount = 10000;
    await page.clock.fastForward(300_001);
    await assertFreshness(10000, "dark 320px 10000");
    await expect(panel).toBeVisible();
  } finally {
    await page.close();
  }
});

test("@targeted runtime failure and recovery preserve the visual slot", async ({ context }) => {
  let octoMode: ResponseMode = "error";
  let hikariMode: ResponseMode = "error";
  const requestCounts = new Map<string, number>();
  const page = await openProjectPage(context, "light", {
    getOctoMode: () => octoMode,
    getHikariMode: () => hikariMode,
    installClock: true,
    onRequest: (slug) => requestCounts.set(slug, (requestCounts.get(slug) ?? 0) + 1),
  });
  try {
    const cards = ["codex-vibe-monitor", "tavily-hikari", "octo-rill"];
    for (const slug of cards) {
      if (slug === "codex-vibe-monitor") {
        await expect(
          projectCard(page, slug).locator(
            '[data-project-runtime-panel][data-runtime-state="ready"]'
          )
        ).toBeVisible();
      } else {
        await expect(
          projectCard(page, slug).locator("[data-runtime-fallback-poster]")
        ).toBeVisible();
        await expect(
          projectCard(page, slug).locator(
            '[data-project-runtime-panel][data-runtime-state="pending"]'
          )
        ).toBeHidden();
      }
    }

    for (const slug of ["tavily-hikari", "octo-rill"]) {
      const panel = projectCard(page, slug).locator("[data-project-runtime-panel]");
      await expect(panel).toHaveAttribute("data-runtime-error", "true");
      await expect(panel).not.toHaveAttribute("data-runtime-fetching", "true");
    }

    octoMode = "valid";
    hikariMode = "valid";
    const beforeRebind = new Map(requestCounts);
    await page.evaluate(() => document.dispatchEvent(new Event("astro:page-load")));
    await page.clock.fastForward(300_001);
    for (const slug of cards) {
      await expect
        .poll(() => requestCounts.get(slug), {
          message: `${slug} must bind only one refresh timer`,
        })
        .toBe((beforeRebind.get(slug) ?? 0) + 1);
    }
    for (const slug of cards) {
      await expect(
        projectCard(page, slug).locator('[data-project-runtime-panel][data-runtime-state="ready"]')
      ).toBeVisible();
      await expect(projectCard(page, slug).locator("[data-runtime-fallback-poster]")).toBeHidden();
    }
    const cvmActivity = projectRuntimeMetricsBySlug["codex-vibe-monitor"].tokenActivity90d;
    const hikariActivity = projectRuntimeMetricsBySlug["tavily-hikari"].requestActivity90d;
    await expect(
      projectCard(page, "codex-vibe-monitor").locator("[data-runtime-chart] [data-runtime-point]")
    ).toHaveCount(cvmActivity.filter((point) => point.value !== null).length);
    await expect(
      projectCard(page, "tavily-hikari").locator("[data-runtime-chart] [data-runtime-point]")
    ).toHaveCount(hikariActivity.length);
    await expect(
      projectCard(page, "codex-vibe-monitor").locator(
        '[data-runtime-stat-key="todayTokens"] [data-runtime-value]'
      )
    ).toHaveAttribute(
      "data-runtime-value-full",
      formatRuntimeValue(projectRuntimeMetricsBySlug["codex-vibe-monitor"].todayTokens.value)
    );
    const readyBounds = await Promise.all(cards.map((slug) => readVisualBounds(page, slug)));

    octoMode = "invalid";
    hikariMode = "invalid";
    await page.clock.fastForward(300_001);
    for (const [index, slug] of cards.entries()) {
      if (slug === "codex-vibe-monitor") {
        await expect(
          projectCard(page, slug).locator(
            '[data-project-runtime-panel][data-runtime-state="ready"]'
          )
        ).toBeVisible();
      } else {
        await expect(
          projectCard(page, slug).locator("[data-runtime-fallback-poster]")
        ).toBeVisible();
        await expect(
          projectCard(page, slug).locator(
            '[data-project-runtime-panel][data-runtime-state="pending"]'
          )
        ).toBeHidden();
      }
      const fallback = await readVisualBounds(page, slug);
      expect(
        Math.abs(fallback.slotHeight - readyBounds[index].slotHeight),
        slug
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(fallback.copyTop - readyBounds[index].copyTop), slug).toBeLessThanOrEqual(1);
    }

    octoMode = "valid";
    hikariMode = "valid";
    await page.clock.fastForward(300_001);
    for (const [index, slug] of cards.entries()) {
      await expect(
        projectCard(page, slug).locator('[data-project-runtime-panel][data-runtime-state="ready"]')
      ).toBeVisible();
      await expect(projectCard(page, slug).locator("[data-runtime-fallback-poster]")).toBeHidden();
      const recovered = await readVisualBounds(page, slug);
      expect(
        Math.abs(recovered.slotHeight - readyBounds[index].slotHeight),
        slug
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(recovered.copyTop - readyBounds[index].copyTop), slug).toBeLessThanOrEqual(1);
    }

    const beforePagehide = new Map(requestCounts);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    for (const slug of cards) {
      await expect(
        projectCard(page, slug).locator("[data-project-runtime-panel]")
      ).not.toHaveAttribute("data-runtime-live-bound", "true");
    }
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    for (const slug of cards) {
      await expect(projectCard(page, slug).locator("[data-project-runtime-panel]")).toHaveAttribute(
        "data-runtime-live-bound",
        "true"
      );
      expect(requestCounts.get(slug), `${slug} must rebind after pagehide`).toBe(
        (beforePagehide.get(slug) ?? 0) + 1
      );
    }
    await page.evaluate(() => document.dispatchEvent(new Event("astro:page-load")));
  } finally {
    await page.close();
  }
});

test("@targeted runtime cells keep exact inspection data across pointer, keyboard, and touch", async ({
  context,
}) => {
  const page = await openProjectPage(context, "dark", {
    getHikariMode: () => "valid",
    getOctoMode: () => "valid",
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const cvm = projectCard(page, "codex-vibe-monitor");
    const cvmCells = cvm.locator(".runtime-activity-cell");
    await expect(cvmCells).toHaveCount(90);
    const exactCell = cvm.locator('.runtime-activity-cell[data-date="2026-09-27"]');
    await exactCell.hover();
    await page.waitForTimeout(180);
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toContainText("2026-09-27");
    await expect(tooltip).toContainText("2,120,666,094 Token");

    const zeroCell = cvm.locator('[data-runtime-cell][data-value="0"]').first();
    await expect(zeroCell).toHaveAttribute("data-value", "0");
    await zeroCell.focus();
    await expect(tooltip).toContainText("0 Token");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-runtime-cell][data-runtime-active="true"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();

    const spatialCell = cvm.locator('.runtime-activity-cell[data-date="2026-09-27"]');
    const spatialWeek = Number(await spatialCell.getAttribute("data-week"));
    const spatialWeekday = await spatialCell.getAttribute("data-weekday");
    await spatialCell.focus();
    await expect(spatialCell).toHaveAttribute("aria-colindex", String(spatialWeek));
    await page.keyboard.press("ArrowLeft");
    const spatialPrevious = page.locator('[data-runtime-cell][data-runtime-active="true"]');
    await expect(spatialPrevious).toHaveAttribute("data-week", String(spatialWeek - 1));
    await expect(spatialPrevious).toHaveAttribute("data-weekday", spatialWeekday ?? "");
    await page.keyboard.press("Escape");

    const freshness = projectCard(page, "octo-rill").locator(".runtime-freshness-cell");
    await expect(freshness).toHaveCount(501);
    await expect(projectCard(page, "octo-rill").locator(".runtime-freshness-grid")).toHaveAttribute(
      "role",
      "grid"
    );
    await expect(freshness.first()).toHaveRole("gridcell");
    const freshnessLinks = projectCard(page, "octo-rill").locator(".runtime-freshness-link");
    await expect(freshnessLinks).toHaveCount(501);
    await expect(freshnessLinks.first()).toHaveRole("link");
    await expect(freshnessLinks.first()).toHaveAttribute("href", "/projects/octo-rill/");
    const freshnessLabels = [
      "最近成功刷新：4 小时内",
      "最近成功刷新：4–12 小时前",
      "最近成功刷新：12–24 小时前",
      "最近成功刷新：超过 24 小时",
      "从未成功刷新",
    ];
    for (const [index, label] of freshnessLabels.entries()) {
      const freshnessCell = freshness.nth(index);
      await freshnessCell.scrollIntoViewIfNeeded();
      const freshnessBounds = await freshnessCell.boundingBox();
      if (!freshnessBounds) throw new Error("freshness cell has no hitbox");
      await page.mouse.move(
        freshnessBounds.x + freshnessBounds.width / 2,
        freshnessBounds.y + freshnessBounds.height / 2
      );
      await page.waitForTimeout(180);
      await expect(freshnessCell).toHaveAttribute("data-runtime-active", "true");
      await expect(tooltip).toHaveText(label);
      await expect(tooltip).not.toContainText("仓库");
    }

    const firstFreshnessLink = freshnessLinks.first();
    await firstFreshnessLink.focus();
    await expect(firstFreshnessLink).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(freshnessLinks.nth(1)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(firstFreshnessLink).toBeFocused();
    await page.setViewportSize({ width: 320, height: 852 });
    await page.waitForTimeout(50);
    await expect(freshnessLinks.first()).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(50);
    await expect(freshnessLinks.first()).toBeFocused();
    await page.keyboard.press("Space");
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();

    await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>(".runtime-freshness-link");
      if (!link) throw new Error("OctoRill freshness link is missing");
      link.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          (window as Window & { __octoLinkActivated?: boolean }).__octoLinkActivated = true;
        },
        { once: true }
      );
    });
    await firstFreshnessLink.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __octoLinkActivated?: boolean }).__octoLinkActivated
        )
      )
      .toBe(true);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(20);
    const grid = cvm.locator(".runtime-activity-grid");
    const octoGrid = projectCard(page, "octo-rill").locator(".runtime-freshness-grid");
    const dispatchClick = (index: number, targetGrid: typeof grid = grid) =>
      targetGrid.evaluate((element, cellIndex) => {
        const cell = Array.from(element.querySelectorAll<HTMLElement>("[data-runtime-cell]"))[
          cellIndex
        ];
        if (!cell) throw new Error("click test cell missing");
        const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
        cell.dispatchEvent(event);
        return event.defaultPrevented;
      }, index);
    const dispatchMouseClick = (index: number) =>
      grid.evaluate((element, cellIndex) => {
        const cell = Array.from(element.querySelectorAll<HTMLElement>("[data-runtime-cell]"))[
          cellIndex
        ];
        if (!cell) throw new Error("mouse click test cell missing");
        cell.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" })
        );
        const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
        cell.dispatchEvent(event);
        return event.defaultPrevented;
      }, index);
    const dispatchLinkClick = (index: number) =>
      freshnessLinks.nth(index).evaluate((link) => {
        const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
        link.dispatchEvent(event);
        return event.defaultPrevented;
      });
    const dispatchExplicitMouseLinkClick = (index: number) =>
      freshnessLinks.nth(index).evaluate((link) => {
        const grid = link.closest<HTMLElement>(".runtime-freshness-grid");
        if (!grid) throw new Error("OctoRill freshness grid is missing");
        let observedDefaultPrevented = false;
        grid.addEventListener(
          "click",
          (event) => {
            observedDefaultPrevented = event.defaultPrevented;
            event.preventDefault();
          },
          { once: true }
        );
        const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
        Object.defineProperty(event, "sourceCapabilities", {
          value: { firesTouchEvents: false },
        });
        link.dispatchEvent(event);
        return observedDefaultPrevented;
      });
    const dispatchTouch = (
      type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
      index?: number,
      touchCount = 1,
      targetGrid: typeof grid = grid
    ) =>
      targetGrid.evaluate(
        (element, payload) => {
          const cells = Array.from(element.querySelectorAll<HTMLElement>("[data-runtime-cell]"));
          const cell = payload.index === undefined ? null : cells[payload.index];
          if (payload.index !== undefined && !cell) throw new Error("touch test cell missing");
          const makeTouch = (target: HTMLElement, identifier: number) => {
            const rect = target.getBoundingClientRect();
            return {
              identifier,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
              radiusX: 4,
              radiusY: 4,
              target,
            };
          };
          const touches = cell
            ? Array.from({ length: payload.touchCount }, (_, touchIndex) =>
                makeTouch(cell, touchIndex + 1)
              )
            : [];
          const event = new Event(payload.type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, {
            touches: { value: touches },
            targetTouches: { value: touches },
            changedTouches: { value: touches },
          });
          element.dispatchEvent(event);
          return event.defaultPrevented;
        },
        { type, index, touchCount }
      );
    await dispatchTouch("touchstart", 0, 1, octoGrid);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await dispatchTouch("touchend", undefined, 1, octoGrid);
    await expect(tooltip).toBeHidden();
    expect(await dispatchExplicitMouseLinkClick(0)).toBe(false);
    await dispatchTouch("touchstart", 0, 1, octoGrid);
    await page.waitForTimeout(550);
    await dispatchTouch("touchend", undefined, 1, octoGrid);
    expect(await dispatchLinkClick(0)).toBe(true);
    const keyboardClickObservedDefaultPrevented = await firstFreshnessLink.evaluate((link) => {
      const grid = link.closest<HTMLElement>(".runtime-freshness-grid");
      if (!grid) throw new Error("OctoRill freshness grid is missing");
      let observedDefaultPrevented: boolean | null = null;
      grid.addEventListener(
        "click",
        (event) => {
          observedDefaultPrevented = event.defaultPrevented;
          event.preventDefault();
        },
        { once: true }
      );
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 });
      link.dispatchEvent(event);
      return observedDefaultPrevented;
    });
    expect(keyboardClickObservedDefaultPrevented).toBe(false);
    await dispatchTouch("touchstart", 0, 1, octoGrid);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await dispatchTouch("touchend", undefined, 1, octoGrid);
    await expect(tooltip).toBeHidden();
    expect(await dispatchLinkClick(0)).toBe(true);
    await expect(page).toHaveURL(/\/projects\/?$/);

    await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>(".runtime-freshness-link");
      if (!link) throw new Error("OctoRill freshness link is missing");
      (window as Window & { __octoKeyboardLinkActivated?: boolean }).__octoKeyboardLinkActivated =
        false;
      link.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          (
            window as Window & { __octoKeyboardLinkActivated?: boolean }
          ).__octoKeyboardLinkActivated = true;
        },
        { once: true }
      );
    });
    await firstFreshnessLink.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __octoKeyboardLinkActivated?: boolean })
              .__octoKeyboardLinkActivated
        )
      )
      .toBe(true);

    await dispatchTouch("touchstart", 4);
    const preRecognitionMovePrevented = await dispatchTouch("touchmove", 5);
    expect(preRecognitionMovePrevented).toBe(false);
    await expect(tooltip).toBeHidden();
    await dispatchTouch("touchend");
    await dispatchTouch("touchstart", 4);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    const movePrevented = await dispatchTouch("touchmove", 5);
    expect(movePrevented).toBe(true);
    const contextMenuPrevented = await grid.evaluate((element) => {
      const event = new Event("contextmenu", { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(contextMenuPrevented).toBe(true);
    await dispatchTouch("touchend");
    await expect(tooltip).toBeHidden();
    expect(await dispatchMouseClick(4)).toBe(true);
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await dispatchTouch("touchstart", 4);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await dispatchTouch("touchend");
    await expect(tooltip).toBeHidden();
    expect(await dispatchClick(4)).toBe(true);
    await expect(tooltip).toBeHidden();
    expect(await dispatchClick(5)).toBe(true);
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");

    const refreshDate = "2026-09-27";
    const refreshCell = cvm.locator(`.runtime-activity-cell[data-date="${refreshDate}"]`);
    const refreshCellIndex = await grid.evaluate((element, date) => {
      const cells = Array.from(element.querySelectorAll<HTMLElement>("[data-runtime-cell]"));
      return cells.findIndex((cell) => cell.dataset.date === date);
    }, refreshDate);
    expect(refreshCellIndex).toBeGreaterThanOrEqual(0);
    const initialRefreshValue = await refreshCell.getAttribute("data-value");
    const publishCvmMetrics = async (todayTokens: number) => {
      const metrics = projectRuntimeMetricsBySlug["codex-vibe-monitor"];
      const nextMetrics = {
        ...metrics,
        todayTokens: {
          ...metrics.todayTokens,
          value: todayTokens,
          trend: {
            ...metrics.todayTokens.trend,
            points: metrics.todayTokens.trend.points.map((point, index, points) =>
              index === points.length - 1 ? { ...point, value: todayTokens } : point
            ),
          },
        },
        tokenActivity90d: metrics.tokenActivity90d.map((point) =>
          point.date === refreshDate ? { ...point, value: todayTokens } : point
        ),
      };
      await page.evaluate((payload) => {
        const panel = document.querySelector<HTMLElement>(
          '.projects-poster-card:has(a[href="/projects/codex-vibe-monitor/"]) [data-project-runtime-panel]'
        );
        if (!panel) throw new Error("CVM runtime panel is missing");
        window.dispatchEvent(
          new CustomEvent("project-runtime-metrics-updated", {
            detail: { panel, metrics: payload },
          })
        );
      }, nextMetrics);
    };

    await dispatchTouch("touchstart", refreshCellIndex);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await publishCvmMetrics(111);
    await publishCvmMetrics(222);
    await expect(refreshCell).toHaveAttribute("data-value", initialRefreshValue ?? "");
    await dispatchTouch("touchend");
    await expect(
      cvm.locator('[data-runtime-stat-key="todayTokens"] [data-runtime-value]')
    ).toHaveAttribute("data-runtime-value-full", "222");
    await expect(refreshCell).toHaveAttribute("data-value", "222");
    await expect(tooltip).toBeHidden();

    await dispatchTouch("touchstart", refreshCellIndex);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await publishCvmMetrics(333);
    await dispatchTouch("touchmove", refreshCellIndex, 2);
    await expect(tooltip).toBeHidden();
    await expect(refreshCell).toHaveAttribute("data-value", "222");

    await dispatchTouch("touchstart", refreshCellIndex);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await publishCvmMetrics(445);
    await dispatchTouch("touchcancel", refreshCellIndex);
    await expect(tooltip).toBeHidden();
    await expect(refreshCell).toHaveAttribute("data-value", "222");

    await dispatchTouch("touchstart", refreshCellIndex);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await publishCvmMetrics(444);
    await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(
        '.projects-poster-card:has(a[href="/projects/codex-vibe-monitor/"]) [data-project-runtime-panel]'
      );
      if (!panel) throw new Error("CVM runtime panel is missing");
      window.dispatchEvent(
        new CustomEvent("project-runtime-metrics-fallback", { detail: { panel } })
      );
    });
    await expect(tooltip).toBeHidden();
    await expect(refreshCell).toHaveAttribute("data-value", "222");

    await dispatchTouch("touchstart", refreshCellIndex);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await publishCvmMetrics(555);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(tooltip).toBeHidden();
    await expect(refreshCell).toHaveAttribute("data-value", "222");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await dispatchTouch("touchstart", refreshCellIndex);
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    await publishCvmMetrics(666);
    await page.evaluate(() => document.dispatchEvent(new Event("astro:before-swap")));
    await expect(tooltip).toBeHidden();
    await expect(cvm.locator('[data-runtime-cell][data-runtime-active="true"]')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } finally {
    await page.close();
  }
});
