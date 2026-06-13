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

test.describe("Public hover stability", () => {
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
});
