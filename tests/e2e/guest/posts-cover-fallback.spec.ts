import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";

async function readNormalizedPixels(
  response: Awaited<ReturnType<Page["request"]["get"]>>,
  width: number,
  height: number
) {
  expect(response.ok()).toBeTruthy();
  return sharp(await response.body())
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function assertImageDimensions(
  response: Awaited<ReturnType<Page["request"]["get"]>>,
  width: number,
  height: number
) {
  expect(response.ok()).toBeTruthy();
  const metadata = await sharp(await response.body()).metadata();
  expect(metadata.width).toBe(width);
  expect(metadata.height).toBe(height);
}

async function assertOpaqueCorners(response: Awaited<ReturnType<Page["request"]["get"]>>) {
  expect(response.ok()).toBeTruthy();
  const { data, info } = await sharp(await response.body())
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const corners = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ];
  for (const [x, y] of corners) {
    expect(data[(y * info.width + x) * info.channels + 3]).toBe(255);
  }
}

function assertVisibleWatermark(
  clean: { data: Buffer; info: { width: number; height: number } },
  rendered: { data: Buffer; info: { width: number; height: number } }
) {
  expect(rendered.info.width).toBe(clean.info.width);
  expect(rendered.info.height).toBe(clean.info.height);

  const xStart = Math.floor(clean.info.width * 0.78);
  const yStart = Math.floor(clean.info.height * 0.72);
  let totalDelta = 0;
  let changedPixels = 0;
  let pixels = 0;
  for (let y = yStart; y < clean.info.height; y += 1) {
    for (let x = xStart; x < clean.info.width; x += 1) {
      const offset = (y * clean.info.width + x) * 4;
      const delta =
        Math.abs(rendered.data[offset] - clean.data[offset]) +
        Math.abs(rendered.data[offset + 1] - clean.data[offset + 1]) +
        Math.abs(rendered.data[offset + 2] - clean.data[offset + 2]);
      totalDelta += delta;
      changedPixels += delta > 30 ? 1 : 0;
      pixels += 1;
    }
  }

  expect(totalDelta / (pixels * 3)).toBeGreaterThan(1);
  expect(changedPixels).toBeGreaterThan(100);
}

async function gotoWithLightTheme(page: Page) {
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/posts", { waitUntil: "domcontentloaded" });
}

test.describe("posts cover fallback", () => {
  test("posts list uses the first body image when frontmatter image is missing", async ({
    page,
  }) => {
    await gotoWithLightTheme(page);

    const fallbackCard = page
      .locator('[data-testid="post-card"]', {
        has: page.getByRole("link", { name: "Hello World" }),
      })
      .first();

    await expect(fallbackCard).toBeVisible();

    const cover = fallbackCard.getByTestId("post-card-cover");
    await expect(cover).toBeVisible();

    const image = cover.locator("img");
    await expect(image).toBeVisible();

    const imageSrc = await image.getAttribute("src");
    expect(imageSrc).toBeTruthy();
    if (!imageSrc) {
      throw new Error("expected facade image src");
    }

    const parsedImageUrl = new URL(imageSrc, page.url());
    expect(parsedImageUrl.pathname).toMatch(
      /\/api\/public\/assets\/post\/hello-world\/[0-9a-f]+\/card\.webp$/
    );
    expect(await image.getAttribute("class")).toContain("object-cover");
    expect(parsedImageUrl.pathname).not.toContain("/wm-");
    expect(parsedImageUrl.searchParams.has("v")).toBe(true);

    const imageResponse = await page.request.get(imageSrc);
    expect(imageResponse.ok()).toBeTruthy();
    expect((await imageResponse.body()).byteLength).toBeGreaterThan(0);
    await assertImageDimensions(imageResponse, 900, 600);
    await assertOpaqueCorners(imageResponse);
    await cover.hover();
    await expect.poll(() => image.evaluate((node) => getComputedStyle(node).scale)).toBe("1.05");
  });

  test("homepage timeline cards use the clean cover card variant", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const timelineImage = page.getByTestId("home-timeline").locator("img").first();
    await expect(timelineImage).toBeVisible();
    const imageSrc = await timelineImage.getAttribute("src");
    expect(imageSrc).toBeTruthy();
    if (!imageSrc) throw new Error("expected timeline cover src");

    const parsedImageUrl = new URL(imageSrc, page.url());
    expect(parsedImageUrl.pathname).toMatch(
      /\/api\/public\/assets\/(post|memo)\/[^/]+\/[0-9a-f]+\/card\.webp$/
    );
    expect(parsedImageUrl.pathname).not.toContain("/wm-");
    expect(await timelineImage.getAttribute("class")).toContain("object-cover");
    expect(await timelineImage.getAttribute("class")).not.toContain("group-hover:scale-105");
  });

  test("keeps detail cover and body media watermarked", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/posts/hello-world/", { waitUntil: "domcontentloaded" });

    const detailCover = page.locator(".post-detail-cover img");
    await expect(detailCover).toBeVisible();
    const detailCoverSrc = await detailCover.getAttribute("src");
    expect(detailCoverSrc).toBeTruthy();
    if (!detailCoverSrc) throw new Error("expected watermarked detail cover src");
    expect(new URL(detailCoverSrc, page.url()).pathname).toMatch(
      /\/api\/public\/assets\/post\/hello-world\/[0-9a-f]+\/wm-[ab]-v5\/cover\.webp$/
    );
    expect(await detailCover.getAttribute("class")).toContain("object-contain");

    const bodyImage = page.locator(".post-detail-body img").first();
    await expect(bodyImage).toBeVisible();
    const bodyImageSrc = await bodyImage.getAttribute("src");
    expect(bodyImageSrc).toBeTruthy();
    if (!bodyImageSrc) throw new Error("expected watermarked body image src");
    expect(new URL(bodyImageSrc, page.url()).pathname).toMatch(
      /\/api\/public\/assets\/post\/hello-world\/[0-9a-f]+\/wm-[ab]-v5\/content\.webp$/
    );

    const cleanCardSrc = detailCoverSrc.replace(/\/wm-[ab]-v5\/cover\.webp(?=\?)/, "/card.webp");
    const cleanCard = await readNormalizedPixels(await page.request.get(cleanCardSrc), 580, 328);
    const detailPixels = await readNormalizedPixels(
      await page.request.get(detailCoverSrc),
      cleanCard.info.width,
      cleanCard.info.height
    );
    const bodyPixels = await readNormalizedPixels(
      await page.request.get(bodyImageSrc),
      cleanCard.info.width,
      cleanCard.info.height
    );

    assertVisibleWatermark(cleanCard, detailPixels);
    assertVisibleWatermark(cleanCard, bodyPixels);
  });

  test("related post cards keep the clean cover crop and hover scale", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/posts/hello-world/", { waitUntil: "domcontentloaded" });

    const relatedCard = page.locator('article[itemprop="isRelatedTo"]').first();
    await expect(relatedCard).toBeVisible();
    const image = relatedCard.locator("img");
    await expect(image).toBeVisible();
    const imageSrc = await image.getAttribute("src");
    expect(imageSrc).toBeTruthy();
    if (!imageSrc) throw new Error("expected related cover src");

    const parsedImageUrl = new URL(imageSrc, page.url());
    expect(parsedImageUrl.pathname).toMatch(
      /\/api\/public\/assets\/post\/code-block-fixture\/[0-9a-f]+\/card\.webp$/
    );
    expect(parsedImageUrl.pathname).not.toContain("/wm-");
    expect(await image.getAttribute("class")).toContain("object-cover");
    expect(await image.getAttribute("class")).toContain("group-hover:scale-[1.04]");
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBe(900);

    await image.hover();
    await expect.poll(() => image.evaluate((node) => getComputedStyle(node).scale)).toBe("1.04");
  });
});
