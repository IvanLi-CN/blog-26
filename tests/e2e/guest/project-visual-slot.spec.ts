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
        "[data-runtime-fallback-poster]:not([hidden]) .project-poster, .projects-poster-visual > .project-poster"
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
          panel: panelRect && {
            left: panelRect.left,
            right: panelRect.right,
            top: panelRect.top,
            bottom: panelRect.bottom,
          },
          metricBottom: metricRect?.bottom,
          statuses: cells.map((cell) => cell.dataset.statusCode),
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
      if (expectedCount > 0) {
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
      }
      expect(snapshot.grid.scrollWidth).toBeLessThanOrEqual(snapshot.grid.clientWidth + 1);
      expect(snapshot.grid.scrollHeight).toBeLessThanOrEqual(snapshot.grid.clientHeight + 1);

      expect(await readUpper()).toEqual(baseline);
    };

    for (const nextCount of [1, 30, 31, 502, 3000, 10000, 502]) {
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

    octoMode = "valid";
    hikariMode = "valid";
    const beforeRebind = new Map(requestCounts);
    await page.evaluate(() => document.dispatchEvent(new Event("astro:page-load")));
    await page.clock.fastForward(300_001);
    for (const slug of cards) {
      expect(requestCounts.get(slug), `${slug} must bind only one refresh timer`).toBe(
        (beforeRebind.get(slug) ?? 0) + 1
      );
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
    await page.evaluate(() => document.dispatchEvent(new Event("astro:page-load")));
    for (const slug of cards) {
      await expect(projectCard(page, slug).locator("[data-project-runtime-panel]")).toHaveAttribute(
        "data-runtime-live-bound",
        "true"
      );
      expect(requestCounts.get(slug), `${slug} must rebind after pagehide`).toBe(
        (beforePagehide.get(slug) ?? 0) + 1
      );
    }
  } finally {
    await page.close();
  }
});
