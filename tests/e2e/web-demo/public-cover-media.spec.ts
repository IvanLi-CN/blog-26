import { expect, type Locator, type Page, test } from "@playwright/test";
import sharp from "sharp";

async function assertOpaqueImageCorners(page: Page, image: Locator) {
  const imageSrc = await image.getAttribute("src");
  expect(imageSrc).toBeTruthy();
  if (!imageSrc) throw new Error("expected rendered image src");

  const response = await page.request.get(imageSrc);
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

async function assertRenderedObjectCover(page: Page, image: Locator, pixelTolerance = 80) {
  const imageSrc = await image.getAttribute("src");
  expect(imageSrc).toBeTruthy();
  if (!imageSrc) throw new Error("expected rendered cover src");

  await expect
    .poll(() =>
      image.evaluate((node) => {
        const element = node as HTMLImageElement;
        return element.complete && element.naturalWidth > 0;
      })
    )
    .toBe(true);
  await image.evaluate(async (node) => {
    const element = node as HTMLImageElement;
    if (typeof element.decode === "function") await element.decode().catch(() => undefined);
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );

  const sourceResponse = await page.request.get(imageSrc);
  expect(sourceResponse.ok()).toBeTruthy();
  const source = await sharp(await sourceResponse.body())
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const screenshot = await image.screenshot();
  const rendered = await sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const layout = await image.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  const scale = Math.max(layout.width / source.info.width, layout.height / source.info.height);
  const cropX = (source.info.width * scale - layout.width) / 2;
  const cropY = (source.info.height * scale - layout.height) / 2;
  const samplePoints = [
    [Math.floor(rendered.info.width / 2), 8],
    [Math.floor(rendered.info.width / 2), rendered.info.height - 9],
    [8, Math.floor(rendered.info.height / 2)],
    [rendered.info.width - 9, Math.floor(rendered.info.height / 2)],
  ];

  for (const [x, y] of samplePoints) {
    // Locator screenshots round fractional CSS boxes to image pixels. Map sample
    // centers through the CSS box first, then allow one source pixel of browser
    // resampling variance when comparing against the decoded source.
    const cssX = ((x + 0.5) / rendered.info.width) * layout.width;
    const cssY = ((y + 0.5) / rendered.info.height) * layout.height;
    const sourceX = Math.min(
      source.info.width - 1,
      Math.max(0, Math.round((cssX + cropX) / scale))
    );
    const sourceY = Math.min(
      source.info.height - 1,
      Math.max(0, Math.round((cssY + cropY) / scale))
    );
    const renderedOffset = (y * rendered.info.width + x) * rendered.info.channels;
    const renderedRgb = [0, 1, 2].map((channel) => rendered.data[renderedOffset + channel]);
    const neighborhoodDelta = [];
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const nearbyX = Math.min(source.info.width - 1, Math.max(0, sourceX + offsetX));
        const nearbyY = Math.min(source.info.height - 1, Math.max(0, sourceY + offsetY));
        const sourceOffset = (nearbyY * source.info.width + nearbyX) * source.info.channels;
        neighborhoodDelta.push(
          renderedRgb.reduce(
            (total, channel, index) =>
              total + Math.abs(channel - source.data[sourceOffset + index]),
            0
          )
        );
      }
    }
    expect(Math.min(...neighborhoodDelta)).toBeLessThan(pixelTolerance);
  }
}

test.describe("public cover media in Web Demo", () => {
  test("renders clean list covers with the historical crop and hover scale", async ({ page }) => {
    await page.goto("/posts/", { waitUntil: "networkidle" });

    const image = page.locator('[data-testid="post-card-cover"] img').first();
    await expect(image).toBeVisible();
    const imageSrc = await image.getAttribute("src");
    expect(imageSrc).toBeTruthy();
    if (!imageSrc) throw new Error("expected Web Demo list cover src");

    expect(new URL(imageSrc, page.url()).pathname).toMatch(
      /\/api\/public\/assets\/(post|memo)\/[^/]+\/[0-9a-f]+\/card\.webp$/
    );
    expect(imageSrc).not.toContain("/wm-");
    expect(await image.getAttribute("class")).toContain("object-cover");
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBe(900);
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalHeight))
      .toBe(600);
    await assertOpaqueImageCorners(page, image);

    const layout = await image.evaluate((node) => {
      const container = node.parentElement;
      const imageRect = node.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      return {
        objectFit: getComputedStyle(node).objectFit,
        imageWidth: imageRect.width,
        imageHeight: imageRect.height,
        containerWidth: containerRect?.width ?? 0,
        containerHeight: containerRect?.height ?? 0,
        sourceRatio: node.naturalWidth / node.naturalHeight,
      };
    });
    expect(layout.objectFit).toBe("cover");
    expect(Math.abs(layout.imageWidth - layout.containerWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(layout.imageHeight - layout.containerHeight)).toBeLessThanOrEqual(2);
    expect(
      Math.abs(layout.containerWidth / layout.containerHeight - layout.sourceRatio)
    ).toBeGreaterThan(0.1);
    await assertRenderedObjectCover(page, image);

    await image.locator("..").hover();
    await expect.poll(() => image.evaluate((node) => getComputedStyle(node).scale)).toBe("1.05");

    const screenshot = await page.screenshot({
      path: test.info().outputPath("posts-desktop.png"),
    });
    await test.info().attach("posts-desktop", { body: screenshot, contentType: "image/png" });
  });

  test("renders the clean timeline cover with the historical crop", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const image = page.getByTestId("home-timeline").locator("img").first();
    await expect(image).toBeVisible();
    const imageSrc = await image.getAttribute("src");
    expect(imageSrc).toBeTruthy();
    if (!imageSrc) throw new Error("expected Web Demo timeline cover src");

    expect(new URL(imageSrc, page.url()).pathname).toMatch(
      /\/api\/public\/assets\/(post|memo)\/[^/]+\/[0-9a-f]+\/card\.webp$/
    );
    expect(imageSrc).not.toContain("/wm-");
    expect(await image.getAttribute("class")).toContain("object-cover");
    expect(await image.getAttribute("class")).not.toContain("group-hover:scale-105");
    expect(await image.evaluate((node) => getComputedStyle(node).objectFit)).toBe("cover");
    await assertOpaqueImageCorners(page, image);
    await assertRenderedObjectCover(page, image, 300);
  });

  test("keeps detail and related media watermarked separately", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/posts/hello-world/", { waitUntil: "networkidle" });

    const detailCover = page.locator(".post-detail-cover img");
    await expect(detailCover).toBeVisible();
    const detailCoverSrc = await detailCover.getAttribute("src");
    expect(detailCoverSrc).toBeTruthy();
    if (!detailCoverSrc) throw new Error("expected Web Demo detail cover src");
    expect(new URL(detailCoverSrc, page.url()).pathname).toMatch(
      /\/api\/public\/assets\/post\/hello-world\/[0-9a-f]+\/wm-[ab]-v5\/cover\.webp$/
    );
    expect(await detailCover.getAttribute("class")).toContain("object-contain");
    await expect
      .poll(() => detailCover.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBe(900);
    await expect
      .poll(() => detailCover.evaluate((node) => (node as HTMLImageElement).naturalHeight))
      .toBe(600);
    const detailLayout = await detailCover.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        objectFit: getComputedStyle(node).objectFit,
        width: rect.width,
        height: rect.height,
        sourceRatio: node.naturalWidth / node.naturalHeight,
      };
    });
    expect(detailLayout.objectFit).toBe("contain");
    expect(
      Math.abs(detailLayout.width / detailLayout.height - detailLayout.sourceRatio)
    ).toBeLessThan(0.05);
    await assertOpaqueImageCorners(page, detailCover);

    const bodyImage = page.locator(".post-detail-body img").first();
    await expect(bodyImage).toBeVisible();
    expect(await bodyImage.getAttribute("src")).toMatch(/\/wm-[ab]-v5\/content\.webp/);

    const relatedImage = page.locator('article[itemprop="isRelatedTo"] img').first();
    await expect(relatedImage).toBeVisible();
    const relatedSrc = await relatedImage.getAttribute("src");
    expect(relatedSrc).toBeTruthy();
    if (!relatedSrc) throw new Error("expected Web Demo related cover src");
    expect(new URL(relatedSrc, page.url()).pathname).toMatch(
      /\/api\/public\/assets\/post\/code-block-fixture\/[0-9a-f]+\/card\.webp$/
    );
    expect(relatedSrc).not.toContain("/wm-");
    expect(await relatedImage.getAttribute("class")).toContain("object-cover");
    await expect
      .poll(() => relatedImage.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBe(900);
    await expect
      .poll(() => relatedImage.evaluate((node) => (node as HTMLImageElement).naturalHeight))
      .toBe(600);
    const relatedLayout = await relatedImage.evaluate((node) => {
      const container = node.parentElement;
      const imageRect = node.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      return {
        objectFit: getComputedStyle(node).objectFit,
        imageWidth: imageRect.width,
        imageHeight: imageRect.height,
        containerWidth: containerRect?.width ?? 0,
        containerHeight: containerRect?.height ?? 0,
        sourceRatio: node.naturalWidth / node.naturalHeight,
      };
    });
    expect(relatedLayout.objectFit).toBe("cover");
    expect(Math.abs(relatedLayout.imageWidth - relatedLayout.containerWidth)).toBeLessThanOrEqual(
      2
    );
    expect(Math.abs(relatedLayout.imageHeight - relatedLayout.containerHeight)).toBeLessThanOrEqual(
      2
    );
    expect(
      Math.abs(
        relatedLayout.containerWidth / relatedLayout.containerHeight - relatedLayout.sourceRatio
      )
    ).toBeGreaterThan(0.1);
    await assertOpaqueImageCorners(page, relatedImage);
    // Linux Chromium's responsive card compositing can differ from Sharp's
    // decoded source by a small channel-sum margin; retain the crop and
    // geometry checks while allowing the observed cross-runtime delta.
    await assertRenderedObjectCover(page, relatedImage, 128);
    await page.evaluate(() => window.scrollTo(0, 0));

    const screenshot = await page.screenshot({
      path: test.info().outputPath("post-detail-mobile.png"),
    });
    await test.info().attach("post-detail-mobile", {
      body: screenshot,
      contentType: "image/png",
    });
  });
});
