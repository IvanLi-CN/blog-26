import { expect, test } from "@playwright/test";

const slots = '[data-runtime-motion="true"]';
const panels = `${slots} > [data-project-runtime-panel]`;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const records: { kind: string; at: number; duration: number; delay: number }[] = [];
    const commits: string[] = [];
    Object.assign(window, { runtimeMotionRecords: records, runtimeGridCommits: commits });
    window.addEventListener("project-runtime-render-progress", (event) => {
      const { part, panel } = (event as CustomEvent).detail;
      if (part === "grid") commits.push(panel.dataset.runtimeKind);
    });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (
        this.matches("[data-project-runtime-panel], [data-runtime-fallback-poster]") &&
        typeof options === "object" &&
        options.duration === 420
      ) {
        records.push({
          kind:
            this.closest(".projects-poster-visual")?.querySelector<HTMLElement>(
              "[data-runtime-kind]"
            )?.dataset.runtimeKind ?? "",
          at: performance.now(),
          duration: 420,
          delay: Number(options.delay ?? 0),
        });
      }
      return animate.call(this, frames, options);
    };
  });
});

test("the official project route staggers both directions and keeps its geometry", async ({
  page,
}) => {
  await page.goto("/projects/?d_delay=normal&d_connection=online&d_motion=system");
  await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
  const before = await page.locator(slots).evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        copyTop: element
          .closest("article")
          ?.querySelector(".projects-poster-copy")
          ?.getBoundingClientRect().top,
      };
    })
  );
  const records = await page.evaluate(
    () =>
      (window as unknown as { runtimeMotionRecords: { kind: string; at: number }[] })
        .runtimeMotionRecords
  );
  expect(records).toHaveLength(3);
  expect(new Set(records.map((record) => record.kind)).size).toBe(3);
  expect(records[1].at - records[0].at).toBeGreaterThanOrEqual(139);
  expect(records[2].at - records[1].at).toBeGreaterThanOrEqual(139);
  // A successful refresh updates the current panel without another reveal.
  const commits = await page.evaluate(
    () => (window as unknown as { runtimeGridCommits: unknown[] }).runtimeGridCommits.length
  );
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { runtimeGridCommits: unknown[] }).runtimeGridCommits.length
      )
    )
    .toBe(commits + 3);
  expect(
    await page.evaluate(
      () => (window as unknown as { runtimeMotionRecords: unknown[] }).runtimeMotionRecords.length
    )
  ).toBe(3);
  await page.getByTestId("web-demo-connection-offline").click();
  await expect(page.locator(`${slots}[data-runtime-visual-state="poster"]`)).toHaveCount(3);
  await expect(page.locator(`${panels}[aria-hidden="true"]`)).toHaveCount(3);
  const after = await page.locator(slots).evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        copyTop: element
          .closest("article")
          ?.querySelector(".projects-poster-copy")
          ?.getBoundingClientRect().top,
      };
    })
  );
  expect(after).toEqual(before);
  await page.getByTestId("web-demo-connection-online").click();
  await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
});

test("a fallback and recovery during playback continue toward the latest content", async ({
  page,
}) => {
  await page.goto("/projects/?d_delay=custom&d_delay_ms=100&d_connection=online&d_motion=system");
  const first = page.locator(slots).first();
  await expect(first).toHaveAttribute("data-runtime-visual-state", "entering-panel");
  // Trigger the already-rendered Inspector controls in one browser turn so the
  // return transition is observed before its 420ms playback can complete.
  await page
    .getByTestId("web-demo-connection-offline")
    .evaluate((element: HTMLElement) => element.click());
  await expect(first).toHaveAttribute("data-runtime-visual-state", "entering-poster");
  await expect(first.locator("[data-project-runtime-panel]")).toHaveAttribute(
    "data-runtime-inspection-disabled",
    "true"
  );
  await page
    .getByTestId("web-demo-connection-online")
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
  await expect(page.locator(`${panels}[aria-hidden="false"]`)).toHaveCount(3);
  expect(
    await first.evaluate(
      (element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running").length
    )
  ).toBe(0);
});

test("reducing motion during a reveal flushes the current and waiting cards", async ({ page }) => {
  await page.goto("/projects/?d_delay=custom&d_delay_ms=300&d_connection=online&d_motion=system");
  await expect(
    page.locator(`${slots}[data-runtime-visual-state="entering-panel"]`).first()
  ).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
  expect(
    await page
      .locator(slots)
      .evaluateAll(
        (elements) =>
          elements
            .flatMap((element) => element.getAnimations({ subtree: true }))
            .filter((animation) => animation.playState === "running").length
      )
  ).toBe(0);
  await page.getByTestId("web-demo-connection-offline").click();
  await expect(page.locator(`${slots}[data-runtime-visual-state="poster"]`)).toHaveCount(3);
});

for (const theme of ["light", "dark"]) {
  test(`mobile ${theme} preserves the rail and all data through fallback`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(
      `/projects/?d_delay=normal&d_connection=online&d_theme=${theme}&d_motion=system`
    );
    await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
    const count = await page.locator(`${panels} [data-runtime-cell]`).count();
    expect(count).toBeGreaterThan(180);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    const collapse = page.getByRole("button", { name: "收起 Web Demo 控制面板" });
    if (await collapse.isVisible()) await collapse.click();
    await page.locator('.projects-poster-title-link[href="/projects/codex-vibe-monitor/"]').click();
    await expect(page).toHaveURL(/\/projects\/codex-vibe-monitor\//);
    await expect(page.locator(slots)).toHaveCount(0);
  });
}
