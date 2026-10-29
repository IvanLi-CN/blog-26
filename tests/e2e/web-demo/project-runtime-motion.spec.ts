import { expect, type Page, test } from "@playwright/test";

const slots = '[data-runtime-motion="true"]';
const panels = `${slots} > [data-project-runtime-panel]`;

async function waitForRender(page: Page, minimumCommits = 3) {
  // Cold software rendering in the Agent VM includes chart construction and
  // text fitting. Keep that data/render precondition separate from playback.
  await page.waitForFunction(
    (minimumCommits) =>
      (window as unknown as { runtimeGridCommits: string[] }).runtimeGridCommits.length >=
        minimumCommits &&
      [
        ...(
          window as unknown as { runtimeRenderParts: Map<string, Set<string>> }
        ).runtimeRenderParts.values(),
      ].filter((parts) => parts.size === 3).length === 3,
    minimumCommits,
    { timeout: 30_000 }
  );
}

// The budget includes three cold chart/typography renders on a software-only VM.
// Playback assertions and the production 420ms/140ms contract keep their own bounds.
test.setTimeout(120_000);

test.use({
  viewport: { width: 1780, height: 1071 },
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const records: {
      kind: string;
      at: number;
      duration: number;
      delay: number;
      finishedAt?: number;
    }[] = [];
    const commits: string[] = [];
    const parts = new Map<string, Set<string>>();
    Object.assign(window, {
      runtimeMotionRecords: records,
      runtimeGridCommits: commits,
      runtimeRenderParts: parts,
    });
    for (const event of ["project-runtime-metrics-updated", "project-runtime-metrics-fallback"]) {
      window.addEventListener(event, (event) => {
        parts.delete((event as CustomEvent).detail.panel.dataset.runtimeKind);
      });
    }
    window.addEventListener("project-runtime-render-progress", (event) => {
      const { part, panel } = (event as CustomEvent).detail;
      const rendered = parts.get(panel.dataset.runtimeKind) ?? new Set<string>();
      rendered.add(part);
      parts.set(panel.dataset.runtimeKind, rendered);
      if (part === "grid") commits.push(panel.dataset.runtimeKind);
    });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      let record: (typeof records)[number] | undefined;
      if (
        this.matches("[data-project-runtime-panel], [data-runtime-fallback-poster]") &&
        typeof options === "object" &&
        options.duration === 420
      ) {
        record = {
          kind:
            this.closest(".projects-poster-visual")?.querySelector<HTMLElement>(
              "[data-runtime-kind]"
            )?.dataset.runtimeKind ?? "",
          at: performance.now(),
          duration: 420,
          delay: Number(options.delay ?? 0),
        };
        records.push(record);
      }
      const animation = animate.call(this, frames, options);
      if (record) {
        const current = record;
        void animation.finished.then(
          () => {
            current.finishedAt = performance.now();
          },
          () => undefined
        );
      }
      return animation;
    };
  });
});

test("the official project route staggers both directions and keeps its geometry", async ({
  page,
}) => {
  await page.goto("/projects/?d_delay=normal&d_connection=online&d_motion=system#developer-tools");
  await waitForRender(page);
  await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
  await page.getByRole("button", { name: "打开 Web Demo 调试控制面板", exact: true }).click();
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
  await waitForRender(page, commits + 3);
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
  const reverseRecords = await page.evaluate(() =>
    (
      window as unknown as {
        runtimeMotionRecords: { kind: string; at: number; duration: number }[];
      }
    ).runtimeMotionRecords.slice(3)
  );
  expect(reverseRecords).toHaveLength(3);
  expect(reverseRecords.every((record) => record.duration === 420)).toBe(true);
  expect(new Set(reverseRecords.map((record) => record.kind)).size).toBe(3);
  expect(reverseRecords[1].at - reverseRecords[0].at).toBeGreaterThanOrEqual(139);
  expect(reverseRecords[2].at - reverseRecords[1].at).toBeGreaterThanOrEqual(139);
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
  await waitForRender(page);
  await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
  await test.info().attach("project-runtime-motion-timing.json", {
    body: JSON.stringify(
      await page.evaluate(
        () => (window as unknown as { runtimeMotionRecords: unknown[] }).runtimeMotionRecords
      ),
      null,
      2
    ),
    contentType: "application/json",
  });
});

test("the controlled metric fixture rolls digits and settles at the latest target", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(
    "/projects/?d_data=motion&d_delay=custom&d_delay_ms=0&d_connection=online&d_motion=system#developer-tools"
  );
  await waitForRender(page);
  const metric = page.locator(`${panels} [data-runtime-value]`).first();
  await expect(metric).toHaveAttribute("aria-label", "793.76K");
  await page.getByRole("button", { name: "打开 Web Demo 调试控制面板", exact: true }).click();
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await expect(metric).toHaveAttribute("data-runtime-value-animating", "true");
  await expect(metric).toHaveAttribute("data-runtime-value-motion-to", "1M");
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await expect(metric).toHaveAttribute("data-runtime-value-motion-to", "793.76K");
  await page.waitForTimeout(650);
  await expect(metric).toHaveAttribute("data-runtime-value-animating", "false");
  await expect(metric).toHaveAttribute("aria-label", "793.76K");
  await expect(metric.locator("[data-runtime-value-wheel]")).toHaveCount(0);

  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await expect(metric).toHaveAttribute("data-runtime-value-motion-to", "1M");
  await page.locator('button[aria-controls="web-demo-inspector-advanced-content"]').click();
  await expect(page.getByRole("radio", { name: "减少动效", exact: true })).toBeAttached();
  await page.getByRole("radio", { name: "减少动效", exact: true }).click();
  await expect(metric).toHaveAttribute("data-runtime-value-animating", "false");
  await expect(metric).toHaveAttribute("aria-label", "1M");
});

test("the controlled metric fixture settles on a narrow viewport", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(
    "/projects/?d_data=motion&d_delay=custom&d_delay_ms=0&d_connection=online&d_motion=system#developer-tools"
  );
  await waitForRender(page);
  const metric = page.locator(`${panels} [data-runtime-value]`).first();
  await expect(metric).toHaveAttribute("aria-label", "793.76K");
  await page.getByRole("button", { name: "打开 Web Demo 调试控制面板", exact: true }).click();
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await expect(metric).toHaveAttribute("data-runtime-value-motion-to", "1M");
  await page.waitForTimeout(650);
  await expect(metric).toHaveAttribute("data-runtime-value-animating", "false");
  await expect(metric).toHaveAttribute("aria-label", "1M");
});

test("a fallback and recovery during playback continue toward the latest content", async ({
  page,
}) => {
  await page.goto(
    "/projects/?d_delay=custom&d_delay_ms=100&d_connection=online&d_motion=system#developer-tools"
  );
  const first = page.locator(slots).first();
  await waitForRender(page);
  await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
  await page.getByRole("button", { name: "打开 Web Demo 调试控制面板", exact: true }).click();
  // Observe the actual playback in the browser's turn, without locator polling
  // racing a 420ms transition or waiting for the initial document's images.
  const states = await first.evaluate(
    (element) =>
      new Promise<string[]>((resolve) => {
        const seen: string[] = [];
        const observer = new MutationObserver(() => {
          const state = (element as HTMLElement).dataset.runtimeVisualState ?? "";
          if (seen.at(-1) === state) return;
          seen.push(state);
          if (state === "entering-poster") {
            // Hold a real intermediate frame while the next payload renders;
            // software chart construction must not turn this into two settled transitions.
            element.getAnimations({ subtree: true }).forEach((animation) => {
              animation.pause();
              animation.currentTime = 160;
            });
            document
              .querySelector<HTMLElement>('[data-testid="web-demo-connection-online"]')
              ?.click();
          }
          if (state === "entering-panel") {
            observer.disconnect();
            resolve(seen);
          }
        });
        observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-runtime-visual-state"],
        });
        document.querySelector<HTMLElement>('[data-testid="web-demo-connection-offline"]')?.click();
      })
  );
  expect(states).toEqual(["entering-poster", "entering-panel"]);
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

for (const preference of ["system", "inspector"]) {
  test(`${preference} reduced motion flushes the current and waiting cards`, async ({ page }) => {
    await page.goto(
      "/projects/?d_delay=custom&d_delay_ms=300&d_connection=online&d_motion=system#developer-tools"
    );
    await waitForRender(page);
    await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
    await page.getByRole("button", { name: "打开 Web Demo 调试控制面板", exact: true }).click();
    if (preference === "inspector") {
      await page.locator('button[aria-controls="web-demo-inspector-advanced-content"]').click();
      await expect(page.getByRole("radio", { name: "减少动效", exact: true })).toBeAttached();
    }
    await page
      .locator(slots)
      .first()
      .evaluate(
        (element) =>
          new Promise<void>((resolve) => {
            const observer = new MutationObserver(() => {
              if ((element as HTMLElement).dataset.runtimeVisualState !== "entering-poster") return;
              element.getAnimations({ subtree: true }).forEach((animation) => {
                animation.pause();
                animation.currentTime = 160;
              });
              observer.disconnect();
              resolve();
            });
            observer.observe(element, {
              attributes: true,
              attributeFilter: ["data-runtime-visual-state"],
            });
            document
              .querySelector<HTMLElement>('[data-testid="web-demo-connection-offline"]')
              ?.click();
          })
      );
    if (preference === "system") await page.emulateMedia({ reducedMotion: "reduce" });
    else
      await page
        .getByRole("radio", { name: "减少动效", exact: true })
        .evaluate((element: HTMLElement) => element.click());
    await expect(page.locator(`${slots}[data-runtime-visual-state="poster"]`)).toHaveCount(3);
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
    await page.getByTestId("web-demo-connection-online").click();
    await waitForRender(page);
    await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
  });
}

test("HTTP failures and invalid models keep posters and immediately close inspection", async ({
  page,
}) => {
  await page.addInitScript(() => {
    type Mode = "http-error" | "invalid" | "valid";
    const state = { mode: "http-error" as Mode };
    Object.assign(window, { metricsResponseState: state });
    const NativeResponse = Response;
    // Exercise the adapter's real Response/validation boundary with deterministic
    // failures, while leaving the official route and Inspector unchanged.
    window.Response = class extends NativeResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        const metrics =
          typeof body === "string" &&
          /"(?:tokenActivity90d|requestActivity90d|freshness)":/.test(body);
        super(
          metrics && state.mode === "invalid" ? '{"invalid":true}' : body,
          metrics && state.mode === "http-error" ? { ...init, status: 503 } : init
        );
      }
    };
  });
  await page.goto("/projects/?d_connection=online&d_delay=normal&d_motion=system#developer-tools");
  // Wait for the initial adapter result before inspecting its immediate fallback effects.
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-project-runtime-panel][data-runtime-error="true"]')
        .length === 3,
    undefined,
    { timeout: 30_000 }
  );
  await expect(page.locator(`${panels}[data-runtime-error="true"]`)).toHaveCount(3);
  await expect(page.locator(`${slots}[data-runtime-visual-state="poster"]`)).toHaveCount(3);
  await page.getByRole("button", { name: "打开 Web Demo 调试控制面板", exact: true }).click();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { metricsResponseState: { mode: string } }).metricsResponseState.mode =
      "valid";
  });
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await waitForRender(page);
  await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
  await page.getByRole("gridcell").first().getByRole("link").focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { metricsResponseState: { mode: string } }).metricsResponseState.mode =
      "invalid";
  });
  await page
    .getByRole("button", { name: "刷新数据", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.locator(`${panels}[data-runtime-error="true"]`)).toHaveCount(3);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      document.activeElement?.classList.contains("projects-poster-title-link")
    )
  ).toBe(true);
  await expect(page.locator(`${slots}[data-runtime-visual-state="poster"]`)).toHaveCount(3);
});

for (const theme of ["light", "dark"]) {
  test(`mobile ${theme} preserves the rail and all data through fallback`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(
      `/projects/?d_delay=normal&d_connection=online&d_theme=${theme}&d_motion=system#developer-tools`
    );
    await waitForRender(page);
    await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
    await page.getByRole("button", { name: "打开 Web Demo 调试控制面板", exact: true }).click();
    const count = await page.locator(`${panels} [data-runtime-cell]`).count();
    expect(count).toBeGreaterThan(180);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    const rail = page.getByRole("region", { name: "开发工具 项目展架" });
    expect(await rail.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const bounds = await page.locator(slots).evaluateAll((elements) =>
      elements.map((element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      })
    );
    await page.getByTestId("web-demo-connection-offline").click();
    await expect(page.locator(`${slots}[data-runtime-visual-state="poster"]`)).toHaveCount(3);
    expect(
      await page.locator(slots).evaluateAll((elements) =>
        elements.map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return { width, height };
        })
      )
    ).toEqual(bounds);
    await page.getByTestId("web-demo-connection-online").click();
    await waitForRender(page);
    await expect(page.locator(`${slots}[data-runtime-visual-state="panel"]`)).toHaveCount(3);
    const collapse = page.getByRole("button", { name: "收起 Web Demo 控制面板" });
    if (await collapse.isVisible()) await collapse.click();
    await page.locator('.projects-poster-title-link[href="/projects/codex-vibe-monitor/"]').click();
    await expect(page).toHaveURL(/\/projects\/codex-vibe-monitor\//);
    await expect(page.locator(slots)).toHaveCount(0);
  });
}
