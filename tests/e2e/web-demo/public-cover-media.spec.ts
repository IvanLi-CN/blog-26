import { expect, test } from "@playwright/test";

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

    await image.locator("..").hover();
    await expect.poll(() => image.evaluate((node) => getComputedStyle(node).scale)).toBe("1.05");

    const screenshot = await page.screenshot({ path: test.info().outputPath("posts-desktop.png") });
    await test.info().attach("posts-desktop", { body: screenshot, contentType: "image/png" });
  });

  test("renders the clean timeline cover with the historical hover scale", async ({ page }) => {
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
    expect(await image.getAttribute("class")).toContain("group-hover:scale-105");

    await image.hover();
    await expect.poll(() => image.evaluate((node) => getComputedStyle(node).scale)).toBe("1.05");
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
    expect(await detailCover.evaluate((node) => getComputedStyle(node).borderRadius)).toBe("0px");

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

    const screenshot = await page.screenshot({
      path: test.info().outputPath("post-detail-mobile.png"),
    });
    await test.info().attach("post-detail-mobile", {
      body: screenshot,
      contentType: "image/png",
    });
  });
});
