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
});
