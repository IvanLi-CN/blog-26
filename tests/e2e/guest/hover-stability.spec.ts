import { expect, type Locator, type Page, test } from "@playwright/test";

const HITBOX_DRIFT_TOLERANCE_PX = 2;

async function gotoWithTheme(page: Page, route: string, theme: "light" | "dark" | "system") {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await page.goto(route, { waitUntil: "domcontentloaded" });
}

async function expectStableLiftHover(page: Page, hitbox: Locator) {
  const surface = hitbox.locator(".nature-hover-lift").first();

  await expect(hitbox).toBeVisible();
  await expect(surface).toBeVisible();
  await hitbox.scrollIntoViewIfNeeded();

  const beforeHitbox = await hitbox.boundingBox();
  expect(beforeHitbox).not.toBeNull();

  if (!beforeHitbox) {
    throw new Error("hover stability target is missing a measurable hitbox");
  }

  const bottomTrackY = beforeHitbox.y + beforeHitbox.height - Math.min(4, beforeHitbox.height / 3);
  const endX = beforeHitbox.x + beforeHitbox.width - Math.min(24, beforeHitbox.width / 2);
  const hoverPosition = {
    x: Math.min(24, beforeHitbox.width / 2),
    y: beforeHitbox.height - Math.min(4, beforeHitbox.height / 3),
  };

  await hitbox.hover({ position: hoverPosition });

  await expect.poll(async () => hitbox.evaluate((element) => element.matches(":hover"))).toBe(true);
  await expect
    .poll(async () => surface.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe("none");

  const afterHoverHitbox = await hitbox.boundingBox();
  expect(afterHoverHitbox).not.toBeNull();

  if (!afterHoverHitbox) {
    throw new Error("hover stability target lost its measurable hitbox");
  }

  const hoverTransform = await surface.evaluate((element) => getComputedStyle(element).transform);

  expect(Math.abs(afterHoverHitbox.x - beforeHitbox.x)).toBeLessThan(HITBOX_DRIFT_TOLERANCE_PX);
  expect(Math.abs(afterHoverHitbox.y - beforeHitbox.y)).toBeLessThan(HITBOX_DRIFT_TOLERANCE_PX);
  expect(hoverTransform).not.toBe("none");

  await page.mouse.move(endX, bottomTrackY);

  await expect.poll(async () => hitbox.evaluate((element) => element.matches(":hover"))).toBe(true);
  await expect
    .poll(async () => surface.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe("none");

  const afterSweepHitbox = await hitbox.boundingBox();
  expect(afterSweepHitbox).not.toBeNull();

  if (!afterSweepHitbox) {
    throw new Error("hover stability target lost its measurable hitbox after horizontal sweep");
  }

  const sweepTransform = await surface.evaluate((element) => getComputedStyle(element).transform);

  expect(Math.abs(afterSweepHitbox.x - beforeHitbox.x)).toBeLessThan(HITBOX_DRIFT_TOLERANCE_PX);
  expect(Math.abs(afterSweepHitbox.y - beforeHitbox.y)).toBeLessThan(HITBOX_DRIFT_TOLERANCE_PX);
  expect(sweepTransform).not.toBe("none");
}

async function expectStablePlaybookTabHover(page: Page, tab: Locator) {
  await expect(tab).toBeVisible();

  const beforeHover = await tab.boundingBox();
  expect(beforeHover).not.toBeNull();

  if (!beforeHover) {
    throw new Error("Playbook tab is missing a measurable hitbox");
  }

  await tab.evaluate((element) => {
    element.dataset.pointerEnterCount = "0";
    element.dataset.pointerLeaveCount = "0";
    element.addEventListener("pointerenter", () => {
      element.dataset.pointerEnterCount = String(Number(element.dataset.pointerEnterCount) + 1);
    });
    element.addEventListener("pointerleave", () => {
      element.dataset.pointerLeaveCount = String(Number(element.dataset.pointerLeaveCount) + 1);
    });
  });

  const pointer = {
    x: beforeHover.x + beforeHover.width / 2,
    y: beforeHover.y + beforeHover.height - 1,
  };
  await page.mouse.move(pointer.x, pointer.y);
  await page.waitForTimeout(500);

  const afterHover = await tab.boundingBox();
  expect(afterHover).not.toBeNull();

  if (!afterHover) {
    throw new Error("Playbook tab lost its measurable hitbox after hover");
  }

  const hoverState = await tab.evaluate((element) => ({
    hovered: element.matches(":hover"),
    pointerEnterCount: Number(element.dataset.pointerEnterCount),
    pointerLeaveCount: Number(element.dataset.pointerLeaveCount),
  }));

  expect(hoverState).toEqual({ hovered: true, pointerEnterCount: 1, pointerLeaveCount: 0 });
  expect(Math.abs(afterHover.x - beforeHover.x)).toBeLessThan(0.5);
  expect(Math.abs(afterHover.y - beforeHover.y)).toBeLessThan(0.5);
}

test.describe("Public hover stability @targeted", () => {
  test("timeline cards, tag cards, and search results keep a stable hitbox while lifted", async ({
    page,
  }) => {
    await gotoWithTheme(page, "/", "light");
    const timelineCard = page.getByTestId("home-timeline").locator(".nature-hover-hitbox").nth(1);
    await expectStableLiftHover(page, timelineCard);

    await gotoWithTheme(page, "/tags", "light");
    const tagGridLink = page.locator('main a.nature-hover-hitbox[href^="/tags/"]').first();
    await expectStableLiftHover(page, tagGridLink);

    await gotoWithTheme(page, "/search?q=Hello", "light");
    const searchResultLink = page.locator('main a.nature-hover-hitbox[href^="/posts/"]').first();
    await expectStableLiftHover(page, searchResultLink);
  });

  test("playbook category tabs keep their hitboxes stable at the hover boundary", async ({
    page,
  }) => {
    await gotoWithTheme(page, "/playbook", "light");

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);

    for (let index = 0; index < 4; index += 1) {
      await expectStablePlaybookTabHover(page, tabs.nth(index));
      await page.mouse.move(0, 0);
    }
  });
});
