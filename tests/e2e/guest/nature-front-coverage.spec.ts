import { expect, type Locator, type Page, test } from "@playwright/test";
import { migratedProjectSlugs } from "../../fixtures/project-content";

async function gotoWithTheme(page: Page, route: string, theme: "light" | "dark" | "system") {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await page.addInitScript(() => {
    const scopedWindow = window as Window & { __naturePageLoadReady?: boolean };
    if (scopedWindow.__naturePageLoadReady) return;
    scopedWindow.__naturePageLoadReady = false;
    document.addEventListener("astro:page-load", () => {
      scopedWindow.__naturePageLoadReady = true;
    });
  });
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const scopedWindow = window as Window & { __naturePageLoadReady?: boolean };
    return scopedWindow.__naturePageLoadReady === true;
  });
}

async function readTimelineEntries(items: Locator) {
  return items.evaluateAll((entries) =>
    entries.map((entry) => ({
      kind: entry.querySelector<HTMLElement>("[data-timeline-kind]")?.dataset.timelineKind ?? null,
      date: entry.querySelector("time")?.getAttribute("datetime") ?? null,
      href:
        entry
          .querySelector<HTMLAnchorElement>(".nature-timeline-card h2 a, a[href*='/memos/']")
          ?.getAttribute("href") ?? null,
    }))
  );
}

async function readTypeDateGaps(items: Locator) {
  return items.evaluateAll((entries) =>
    entries.map((entry) => {
      const icon = entry.querySelector<HTMLElement>('[data-testid="timeline-type-icon"]');
      const date = entry.querySelector("time");
      if (!icon || !date) return null;
      return date.getBoundingClientRect().left - icon.getBoundingClientRect().right;
    })
  );
}

test.describe("Nature frontend public coverage", () => {
  test("core public routes render under the Nature shell", async ({ page }) => {
    const routes = [
      { path: "/", heading: /Ivan's Blog/ },
      { path: "/posts", heading: "文章" },
      { path: "/memos", heading: "Memos" },
      { path: "/tags", heading: "浏览所有标签" },
      { path: "/search", heading: "搜索内容" },
      { path: "/about", heading: /你好，我是 Ivan/ },
      { path: "/projects", heading: "项目" },
    ] as const;

    for (const route of routes) {
      await gotoWithTheme(page, route.path, "light");
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "light");
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    }
  });

  test("public shell persists across client-side navigation without losing theme", async ({
    page,
  }) => {
    await gotoWithTheme(page, "/", "dark");

    const publicShell = page.getByTestId("public-site-shell");
    await expect(publicShell).toBeVisible();
    const shellInstanceId = await page.locator("html").getAttribute("data-public-session-id");

    expect(shellInstanceId).toBeTruthy();
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );

    const mainNavigation = page.getByRole("navigation", { name: "Main navigation" });

    await mainNavigation.getByRole("link", { name: "文章", exact: true }).click();
    await expect(page).toHaveURL(/\/posts\/$/);
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );

    await mainNavigation.getByRole("link", { name: "标签", exact: true }).click();
    await expect(page).toHaveURL(/\/tags\/$/);
    await expect(page.getByRole("heading", { name: "浏览所有标签" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );

    const firstTag = page.locator('a[href^="/tags/"]').first();
    await firstTag.click();
    await expect(page).toHaveURL(/\/tags\//);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
  });

  test("detail routes and tag drill-down remain navigable", async ({ page }) => {
    await gotoWithTheme(page, "/posts/hello-world", "light");
    await expect(page.locator("main h1").first()).toHaveText("Hello World");

    await gotoWithTheme(page, "/memos/local-memo", "light");
    await expect(page.locator("main h1").first()).toHaveText("Local Memo");
    await expect(page.getByRole("heading", { name: "Local Memo", exact: true })).toHaveCount(1);

    await gotoWithTheme(page, "/tags", "light");
    const firstTag = page.locator('a[href^="/tags/"]').first();
    await expect(firstTag).toBeVisible();
    await firstTag.click();
    await expect(page).toHaveURL(/\/tags\//);
    await expect(page.locator("main h1").first()).toBeVisible();

    await gotoWithTheme(page, "/projects/kaisoumail", "light");
    await expect(page.locator("main h1").first()).toHaveText("KaisouMail");
    await expect(page.getByRole("heading", { name: "公开入口" })).toBeVisible();

    await gotoWithTheme(page, "/projects/loadlynx", "dark");
    await expect(page.locator("main h1").first()).toHaveText("LoadLynx");
    const poster = page.locator(".project-poster");
    const posterImage = poster.locator("img");
    const posterPicture = poster.locator("picture[data-themed-project-picture]");
    const socialPreview = page.locator(".project-social-preview");
    const socialPreviewImage = page.locator(".project-social-preview img");
    await expect(posterImage).toHaveCount(1);
    await expect(posterImage).toHaveAttribute("src", /loadlynx-dark-960\.webp$/);
    await expect(posterImage).toHaveAttribute("srcset", /loadlynx-dark-480\.webp 480w/);
    await expect(poster.locator('source[type="image/avif"]')).toHaveAttribute(
      "srcset",
      /loadlynx-dark-480\.avif 480w/
    );
    await expect(posterImage).toHaveAttribute("loading", "eager");
    await expect(posterImage).toHaveAttribute("fetchpriority", "high");
    await expect(poster).toHaveCSS("aspect-ratio", "4 / 5");
    await expect(posterPicture).toHaveAttribute("data-project-poster-theme", "dark");
    await expect
      .poll(() =>
        poster.evaluate((element) => {
          const picture = element.querySelector<HTMLPictureElement>(
            "[data-themed-project-picture]"
          );
          const placeholder = picture?.dataset.darkPlaceholder;
          return Boolean(placeholder && element.getAttribute("style")?.includes(placeholder));
        })
      )
      .toBe(true);
    await expect(socialPreview.locator('source[type="image/avif"]')).toHaveAttribute(
      "srcset",
      /loadlynx-dark-640\.avif 640w/
    );
    await expect(socialPreview.locator('source[type="image/webp"]')).toHaveAttribute(
      "srcset",
      /loadlynx-dark-640\.webp 640w/
    );
    await expect(socialPreviewImage).toHaveAttribute("src", /loadlynx-dark-1280\.webp$/);
    await expect(socialPreviewImage).toHaveAttribute("srcset", /loadlynx-dark-640\.webp 640w/);
    await expect(socialPreviewImage).toHaveAttribute(
      "sizes",
      "(min-width: 1328px) 52.5rem, (min-width: 1200px) calc(70vw - 5.625rem), (min-width: 1024px) calc(100vw - 28rem), (min-width: 640px) calc(100vw - 6rem), calc(100vw - 2rem)"
    );
    await expect(socialPreviewImage).toHaveAttribute("width", "1280");
    await expect(socialPreviewImage).toHaveAttribute("height", "640");
    await expect
      .poll(() =>
        socialPreviewImage.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
        )
      )
      .toBe(true);
    await page.evaluate(() => {
      document.documentElement.dataset.uiTheme = "light";
    });
    await expect(posterImage).toHaveAttribute("src", /loadlynx-light-960\.webp$/);
    await expect(posterImage).toHaveAttribute("srcset", /loadlynx-light-480\.webp 480w/);
    await expect(posterPicture).toHaveAttribute("data-project-poster-theme", "light");
    await expect
      .poll(() =>
        poster.evaluate((element) => {
          const picture = element.querySelector<HTMLPictureElement>(
            "[data-themed-project-picture]"
          );
          const placeholder = picture?.dataset.lightPlaceholder;
          return Boolean(placeholder && element.getAttribute("style")?.includes(placeholder));
        })
      )
      .toBe(true);
    await expect(socialPreview.locator('source[type="image/avif"]')).toHaveAttribute(
      "srcset",
      /loadlynx-light-640\.avif 640w/
    );
    await expect(socialPreview.locator('source[type="image/webp"]')).toHaveAttribute(
      "srcset",
      /loadlynx-light-640\.webp 640w/
    );
    await expect(socialPreviewImage).toHaveAttribute("src", /loadlynx-light-1280\.webp$/);
    await expect(page.getByRole("heading", { name: "项目概览" })).toHaveCount(0);

    await gotoWithTheme(page, "/projects/octo-rill", "light");
    const octoSocialPreview = page.locator(".project-social-preview");
    const octoSocialPreviewImage = octoSocialPreview.locator("img");
    await expect(octoSocialPreview.locator('source[type="image/avif"]')).toHaveAttribute(
      "srcset",
      /octo-rill-light-640\.avif 640w/
    );
    await expect(octoSocialPreview.locator('source[type="image/webp"]')).toHaveAttribute(
      "srcset",
      /octo-rill-light-640\.webp 640w/
    );
    await expect(octoSocialPreviewImage).toHaveAttribute("src", /octo-rill-light-1280\.webp$/);
    await expect(octoSocialPreviewImage).toHaveAttribute("width", "1280");
    await expect(octoSocialPreviewImage).toHaveAttribute("height", "640");
    await expect(octoSocialPreviewImage).toHaveAttribute(
      "sizes",
      "(min-width: 1328px) 52.5rem, (min-width: 1200px) calc(70vw - 5.625rem), (min-width: 1024px) calc(100vw - 28rem), (min-width: 640px) calc(100vw - 6rem), calc(100vw - 2rem)"
    );
    await expect(octoSocialPreview).toHaveCSS("aspect-ratio", "2 / 1");
    await expect
      .poll(() =>
        octoSocialPreviewImage.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
        )
      )
      .toBe(true);
    await expect(page.locator(".project-poster img[data-project-poster-image]")).toHaveAttribute(
      "src",
      /octo-rill-light-960\.webp$/
    );
    await expect(
      page.locator(".project-poster picture[data-themed-project-picture]")
    ).toHaveAttribute("data-project-poster-theme", "light");

    await page.evaluate(() => {
      document.documentElement.setAttribute("data-ui-theme", "dark");
    });
    await expect(octoSocialPreviewImage).toHaveAttribute("src", /octo-rill-dark-1280\.webp$/);
    await expect(octoSocialPreviewImage).toHaveAttribute("srcset", /octo-rill-dark-640\.webp 640w/);
    await expect(octoSocialPreview.locator('source[type="image/avif"]')).toHaveAttribute(
      "srcset",
      /octo-rill-dark-640\.avif 640w/
    );
    await expect(octoSocialPreview.locator('source[type="image/webp"]')).toHaveAttribute(
      "srcset",
      /octo-rill-dark-640\.webp 640w/
    );
    await expect(page.locator(".project-poster img[data-project-poster-image]")).toHaveAttribute(
      "src",
      /octo-rill-dark-960\.webp$/
    );
    await expect(
      page.locator(".project-poster picture[data-themed-project-picture]")
    ).toHaveAttribute("data-project-poster-theme", "dark");

    await gotoWithTheme(page, "/projects/codex-vibe-monitor", "light");
    const codexPoster = page.locator(".project-poster");
    const codexPosterImage = codexPoster.locator("img[data-project-poster-image]");
    const codexPosterPicture = codexPoster.locator("picture[data-themed-project-picture]");
    await expect(codexPosterImage).toHaveCount(1);
    await expect(codexPosterImage).toHaveAttribute("src", /codex-vibe-monitor-light-960\.webp$/);
    await expect(codexPosterPicture).toHaveAttribute("data-project-poster-theme", "light");
    await expect(codexPoster).toHaveCSS("aspect-ratio", "4 / 5");
    await expect(page.getByRole("heading", { name: "Codex Vibe Monitor" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "定位与问题边界" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "设计取舍：保留可复盘的证据链" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "系统结构与实现重点" })).toBeVisible();
    await expect(page.locator(".project-social-preview")).toHaveCount(1);
    await expect(page.locator(".project-social-preview img")).toHaveAttribute(
      "src",
      /codex-vibe-monitor-light-1280\.webp$/
    );
    await page.evaluate(() => {
      document.documentElement.dataset.uiTheme = "dark";
    });
    await expect(codexPosterImage).toHaveAttribute("src", /codex-vibe-monitor-dark-960\.webp$/);
    await expect(codexPosterPicture).toHaveAttribute("data-project-poster-theme", "dark");
  });

  test("new project media selects the matching light and dark variants", async ({ page }) => {
    const themedMedia = [
      { slug: "codex-vibe-monitor", selector: ".project-poster", width: 960 },
      { slug: "codex-vibe-monitor", selector: ".project-social-preview", width: 1280 },
      { slug: "kaisoumail", selector: ".project-poster", width: 960 },
      { slug: "kaisoumail", selector: ".project-social-preview", width: 1280 },
      { slug: "octo-rill", selector: ".project-poster", width: 960 },
      { slug: "octo-rill", selector: ".project-social-preview", width: 1280 },
      { slug: "paste-preset", selector: ".project-poster", width: 960 },
      { slug: "paste-preset", selector: ".project-social-preview", width: 1280 },
      { slug: "spoti-bind", selector: ".project-poster", width: 960 },
      { slug: "spoti-bind", selector: ".project-social-preview", width: 1280 },
      { slug: "isolappurr-usb-hub", selector: ".project-poster", width: 960 },
      { slug: "isolappurr-usb-hub", selector: ".project-social-preview", width: 1280 },
      { slug: "mains-aegis", selector: ".project-poster", width: 960 },
      { slug: "mains-aegis", selector: ".project-social-preview", width: 1280 },
      { slug: "tuckmark", selector: ".project-poster", width: 960 },
      { slug: "tuckmark", selector: ".project-social-preview", width: 1280 },
      { slug: "xp", selector: ".project-poster", width: 960 },
      { slug: "xp", selector: ".project-social-preview", width: 1280 },
      { slug: "dockrev", selector: ".project-poster", width: 960 },
    ] as const;

    for (const media of themedMedia) {
      await gotoWithTheme(page, `/projects/${media.slug}`, "light");
      const image = page.locator(`${media.selector} img`).first();
      await expect(image).toHaveAttribute(
        "src",
        new RegExp(`${media.slug}-light-${media.width}\\.webp$`)
      );

      await page.evaluate(() => {
        document.documentElement.dataset.uiTheme = "dark";
      });
      await expect(image).toHaveAttribute(
        "src",
        new RegExp(`${media.slug}-dark-${media.width}\\.webp$`)
      );
    }

    const singleMedia = [{ slug: "dockrev", selector: ".project-social-preview" }] as const;

    for (const media of singleMedia) {
      await gotoWithTheme(page, `/projects/${media.slug}`, "light");
      const image = page.locator(`${media.selector} img`).first();
      await expect(image).toHaveAttribute("src", new RegExp(`${media.slug}-1280\\.webp$`));
      await expect(image).toHaveAttribute("srcset", new RegExp(`${media.slug}-640\\.webp 640w`));

      await page.evaluate(() => {
        document.documentElement.dataset.uiTheme = "dark";
      });
      await expect(image).toHaveAttribute("src", new RegExp(`${media.slug}-1280\\.webp$`));
    }
  });

  test("themed project placeholders match the active theme before media loads", async ({
    page,
  }) => {
    await page.route(/\/projects\/(posters|social)\/xp-(light|dark)-/, (route) => route.abort());
    await gotoWithTheme(page, "/projects/xp/", "dark");

    const placeholders = await page.evaluate(() => {
      const poster = document.querySelector(".project-poster");
      const posterPreview = poster?.querySelector(".project-poster-preview");
      const posterPicture = poster?.querySelector("picture[data-themed-project-picture]");
      const social = document.querySelector(".project-social-preview");
      const socialPicture = social?.querySelector("picture[data-themed-project-social-picture]");

      return {
        poster: {
          expected: posterPicture?.getAttribute("data-dark-placeholder") ?? "",
          actual: posterPreview ? getComputedStyle(posterPreview).backgroundImage : "",
        },
        social: {
          expected: socialPicture?.getAttribute("data-dark-placeholder") ?? "",
          actual: social ? getComputedStyle(social).backgroundImage : "",
        },
      };
    });

    expect(placeholders.poster.expected).not.toBe("");
    expect(placeholders.poster.actual).toContain(placeholders.poster.expected);
    expect(placeholders.social.expected).not.toBe("");
    expect(placeholders.social.actual).toContain(placeholders.social.expected);
  });

  test("project catalog keeps each domain within the card-density contract", async ({ page }) => {
    await gotoWithTheme(page, "/projects", "light");

    await expect(page.getByText("15 个公开项目", { exact: true })).toBeVisible();
    await expect(page.getByText("6 个产品领域", { exact: true })).toBeVisible();

    const expectedGroups = [
      { title: "开发工具", count: 3 },
      { title: "效率工具", count: 2 },
      { title: "Web 产品", count: 2 },
      { title: "硬件产品", count: 3 },
      { title: "设备控制", count: 3 },
      { title: "运维工具", count: 2 },
    ] as const;
    const panel = page.locator(".projects-domain-stack.nature-surface");
    await expect(panel).toHaveCount(1);
    const sections = panel.locator(":scope > .projects-domain-section");
    await expect(sections).toHaveCount(expectedGroups.length);
    const dividerContent = await sections
      .nth(1)
      .evaluate((section) => getComputedStyle(section, "::before").getPropertyValue("content"));
    expect(dividerContent).not.toBe("none");

    for (const [index, group] of expectedGroups.entries()) {
      const section = sections.nth(index);
      await expect(section.getByRole("heading", { name: group.title, exact: true })).toBeVisible();
      await expect(section.locator(".projects-poster-card")).toHaveCount(group.count);
      await expect(section.locator(".projects-domain-count")).toHaveText(`${group.count} 项`);
    }

    const projectImages = page.locator(".projects-poster-card img");
    await expect(projectImages.first()).toHaveAttribute("loading", "eager");
    await expect(projectImages.first()).toHaveAttribute("fetchpriority", "high");
    await expect(projectImages.nth(1)).toHaveAttribute("loading", "lazy");

    await gotoWithTheme(page, "/", "light");
    await expect(page.getByRole("heading", { name: "精选项目 (6)", exact: true })).toBeVisible();
  });

  test("homepage featured cards align project identities and theme-aware logos", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoWithTheme(page, "/", "light");

    const cards = page.getByTestId("featured-project-card");
    await expect(cards).toHaveCount(6);
    await expect(page.locator('[data-logo-state="available"]')).toHaveCount(5);
    const wideCodexLinks = page
      .locator('[data-testid="featured-project-card"][data-project-slug="codex-vibe-monitor"]')
      .locator("[data-project-external-links]");
    await expect(wideCodexLinks).toHaveAttribute("data-ready", "true");
    await expect(wideCodexLinks).toHaveAttribute("data-compact", "false");
    await expect(wideCodexLinks.locator(".project-external-link-label").first()).toBeVisible();

    const loadLynxCard = page.locator(
      '[data-testid="featured-project-card"][data-project-slug="loadlynx"]'
    );
    await expect(loadLynxCard).toHaveAttribute("data-logo-state", "missing");
    await expect(loadLynxCard.locator("[data-featured-project-logo]")).toHaveCount(0);
    await expect(
      page.locator('[data-featured-project-logo][data-logo-variant="watermark"]')
    ).toHaveCount(5);

    const codexCard = page.locator(
      '[data-testid="featured-project-card"][data-project-slug="codex-vibe-monitor"]'
    );
    const codexLogo = codexCard.locator('[data-featured-project-logo][data-logo-variant="inline"]');
    const codexTitle = codexCard.locator("h3");
    const [logoBox, titleBox] = await Promise.all([
      codexLogo.boundingBox(),
      codexTitle.boundingBox(),
    ]);
    expect(logoBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    if (!logoBox || !titleBox) throw new Error("Featured project identity row is not measurable");
    expect(
      Math.abs(logoBox.y + logoBox.height / 2 - (titleBox.y + titleBox.height / 2))
    ).toBeLessThan(12);
    await expect(
      codexCard.locator('[data-featured-project-logo][data-logo-variant="watermark"]')
    ).toHaveAttribute("aria-hidden", "true");
    await expect(
      codexCard.locator('[data-featured-project-logo][data-logo-variant="watermark"]')
    ).toHaveCSS("opacity", "0.09");

    const spotiCard = page.locator(
      '[data-testid="featured-project-card"][data-project-slug="spoti-bind"]'
    );
    await expect(
      spotiCard.locator('[data-featured-project-logo][data-logo-kind="mask"]').first()
    ).toHaveCSS("color", "rgb(23, 130, 67)");
    await page.locator("html").evaluate((element) => element.setAttribute("data-ui-theme", "dark"));
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
    await expect(
      codexCard.locator('[data-featured-project-logo][data-logo-variant="watermark"]')
    ).toHaveCSS("opacity", "0.12");
    await expect(
      spotiCard.locator('[data-featured-project-logo][data-logo-kind="mask"]').first()
    ).toHaveCSS("color", "rgb(101, 213, 150)");

    const kaisouInlineLogo = page
      .locator('[data-testid="featured-project-card"][data-project-slug="kaisoumail"]')
      .locator('[data-featured-project-logo][data-logo-variant="inline"]');
    await expect(kaisouInlineLogo.locator(".featured-project-logo-light")).toBeHidden();
    await expect(kaisouInlineLogo.locator(".featured-project-logo-dark")).toBeVisible();
  });

  test("homepage featured links adapt at mobile widths without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/", "light");

    for (const width of [393, 320]) {
      await page.setViewportSize({ width, height: 852 });
      await expect
        .poll(() =>
          page.evaluate(() => {
            const pageWidth = document.documentElement.clientWidth;
            return document.documentElement.scrollWidth <= pageWidth;
          })
        )
        .toBe(true);
      await expect(
        page.locator('[data-featured-project-logo][data-logo-variant="watermark"]:visible')
      ).toHaveCount(0);

      const codexLinks = page
        .locator('[data-testid="featured-project-card"][data-project-slug="codex-vibe-monitor"]')
        .locator("[data-project-external-links]");
      await expect(codexLinks).toHaveAttribute("data-ready", "true");
      await expect(codexLinks.locator("[data-project-external-link]")).toHaveCount(3);
      await expect(codexLinks.locator("[data-project-external-link]").first()).toHaveAttribute(
        "aria-label",
        "项目站点"
      );
      await expect(codexLinks.locator("[data-project-external-link]").first()).toHaveAttribute(
        "target",
        "_blank"
      );

      if (width === 320) {
        await expect(codexLinks).toHaveAttribute("data-compact", "true");
        const iconTargets = codexLinks.locator("[data-project-external-link]");
        const targetBoxes = await iconTargets.evaluateAll((links) =>
          links.map((link) => ({
            width: link.getBoundingClientRect().width,
            height: link.getBoundingClientRect().height,
          }))
        );
        expect(
          targetBoxes.every(({ width: targetWidth, height }) => targetWidth >= 44 && height >= 44)
        ).toBe(true);
      }
    }
  });

  test("SpotiBind exposes its catalog metadata", async ({ page }) => {
    await gotoWithTheme(page, "/projects/spoti-bind", "light");

    await expect(page.getByRole("heading", { name: "SpotiBind", exact: true })).toBeVisible();
    await expect(
      page.locator('a[href="https://github.com/IvanLi-CN/spoti-bind"]').first()
    ).toBeVisible();
    await expect(page.getByText("Media Keys", { exact: true })).toBeVisible();
  });

  test("project wall separates detail navigation from available quick links", async ({ page }) => {
    await gotoWithTheme(page, "/projects", "light");

    const codexCard = page.locator(".projects-poster-card").filter({
      has: page.getByRole("link", { name: "查看 Codex Vibe Monitor 项目案例" }),
    });
    await expect(codexCard.locator(".projects-poster-link")).toHaveAttribute(
      "href",
      "/projects/codex-vibe-monitor/"
    );
    await expect(codexCard.getByRole("link", { name: "项目站点" })).toHaveAttribute(
      "target",
      "_blank"
    );
    await expect(codexCard.getByRole("link", { name: "官方文档" })).toHaveAttribute(
      "target",
      "_blank"
    );
    await expect(codexCard.getByRole("link", { name: "开源仓库" })).toHaveAttribute(
      "target",
      "_blank"
    );
    await expect(codexCard.locator(".project-external-link-icon.nature-button-ghost")).toHaveCount(
      3
    );
    await expect(
      codexCard.locator(".project-external-link-icon.nature-button-outline")
    ).toHaveCount(0);
    await expect(codexCard.locator(".project-external-link-icon").first()).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)"
    );
    await expect(codexCard.locator(".project-external-links")).toHaveCSS("opacity", "0.48");
    const posterVisual = codexCard.locator(".projects-poster-visual");
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const restingVisualTop = await posterVisual.evaluate(
      (element) => element.getBoundingClientRect().top
    );
    await codexCard.hover();
    await expect(codexCard.locator(".project-external-links")).toHaveCSS("opacity", "1");
    await expect(posterVisual).toHaveCSS("transition-property", "transform");
    await expect
      .poll(() => posterVisual.evaluate((element) => element.getBoundingClientRect().top))
      .toBeLessThan(restingVisualTop - 1);
    const [gridTop, posterTop] = await Promise.all([
      codexCard.evaluate((element) => {
        const grid = element.closest(".projects-domain-grid");
        if (!grid) throw new Error("Project card is outside its scroll grid");
        return grid.getBoundingClientRect().top;
      }),
      codexCard
        .locator(".project-poster")
        .evaluate((element) => element.getBoundingClientRect().top),
    ]);
    expect(posterTop).toBeGreaterThanOrEqual(gridTop - 0.5);
    await expect(codexCard.getByRole("link", { name: "项目站点" })).toHaveCount(1);
    await expect(codexCard.locator(".projects-poster-summary-link")).toHaveAttribute(
      "title",
      "自部署 OpenAI 兼容代理的观测与排障工作台。"
    );
    await expect(codexCard.locator(".projects-poster-summary")).toHaveCSS("white-space", "nowrap");
    await expect(codexCard.locator(".projects-poster-summary")).toHaveCSS(
      "text-overflow",
      "ellipsis"
    );
    await codexCard.locator(".projects-poster-summary-link").focus();
    await expect(codexCard.locator(".projects-poster-summary")).toHaveCSS("white-space", "normal");
    await expect(codexCard.locator(".projects-poster-summary")).toHaveCSS("overflow", "visible");
    await expect(codexCard.locator(".projects-poster-heading")).toHaveCSS("display", "flex");
  });

  test("MDX detail keeps sidebar entry order and omits generic fallback cards", async ({
    page,
  }) => {
    await gotoWithTheme(page, "/projects/codex-vibe-monitor", "light");

    await expect(page.locator(".project-detail-sidebar")).toBeVisible();
    await expect(page.locator(".project-detail-sidebar .project-external-links a")).toHaveCount(4);
    await expect(
      page.locator(".project-detail-sidebar .project-external-links a").nth(0)
    ).toHaveAccessibleName("项目站点");
    await expect(
      page.locator(".project-detail-sidebar .project-external-links a").nth(1)
    ).toHaveAccessibleName("Demo");
    await expect(
      page.locator(".project-detail-sidebar .project-external-links a").nth(2)
    ).toHaveAccessibleName("官方文档");
    await expect(
      page.locator(".project-detail-sidebar .project-external-links a").nth(3)
    ).toHaveAccessibleName("开源仓库");
    await expect(page.getByRole("heading", { name: "项目概览" })).toHaveCount(0);
    await expect(page.locator(".project-toc a")).toHaveCount(3);
    await expect(page.locator(".project-mdx-section")).toHaveCount(3);
  });

  test("migrated detail renders project-specific MDX content", async ({ page }) => {
    await gotoWithTheme(page, "/projects/kaisoumail", "light");

    await expect(page.getByRole("heading", { name: "项目概览" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "临时邮箱控制面" })).toBeVisible();
  });

  test("all migrated detail routes render their compiled body and TOC targets", async ({
    page,
  }) => {
    for (const slug of migratedProjectSlugs) {
      await gotoWithTheme(page, `/projects/${slug}`, "light");

      const body = page.locator("article.project-mdx-content:not(.project-catalog-fallback)");
      await expect(body, `${slug} should render MDX instead of fallback`).toHaveCount(1);
      expect(await body.locator("h2").count(), `${slug} should have an H2`).toBeGreaterThan(0);

      const tocTargets = await page
        .locator(".project-toc a")
        .evaluateAll((links) =>
          links
            .map((link) => link.getAttribute("href"))
            .filter((href): href is string => Boolean(href))
        );
      for (const href of tocTargets) {
        const targetId = href.startsWith("#") ? href.slice(1) : href;
        expect(
          await page.evaluate((id) => document.getElementById(id) !== null, targetId),
          `${slug} TOC target ${href}`
        ).toBe(true);
      }
    }
  });

  test("social preview selects the 640w candidate at the lg boundary", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await gotoWithTheme(page, "/projects/octo-rill", "light");

    const socialPreviewImage = page.locator(".project-social-preview img");
    await expect
      .poll(() => socialPreviewImage.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/octo-rill-light-640\.(avif|webp)$/);
  });

  test("project posters provide progressive media and prioritize only the first poster", async ({
    page,
  }) => {
    await gotoWithTheme(page, "/projects", "light");

    const posters = page.locator(".project-poster");
    const posterImages = page.locator("img[data-project-poster-image]");
    const eagerPosters = page.locator('img[data-project-poster-image][loading="eager"]');
    const lazyPosters = page.locator('img[data-project-poster-image][loading="lazy"]');
    const kaisouPoster = posters
      .filter({ has: page.getByRole("img", { name: "KaisouMail 项目海报" }) })
      .first();
    const kaisouImage = kaisouPoster.locator("img[data-project-poster-image]");

    await expect(posterImages).toHaveCount(14);
    await expect(eagerPosters).toHaveCount(1);
    await expect(eagerPosters.first()).toHaveAttribute("fetchpriority", "high");
    await expect(lazyPosters).toHaveCount(13);
    await expect(kaisouPoster.locator(".project-poster-preview")).toBeVisible();
    await expect(kaisouPoster.locator(".project-poster-copy")).toHaveCount(0);
    await expect(kaisouPoster.locator(".project-poster-scrim")).toHaveCount(0);
    await expect(kaisouPoster.locator('source[type="image/avif"]')).toHaveAttribute(
      "srcset",
      /kaisoumail-light-480\.avif 480w/
    );
    await expect(kaisouPoster.locator('source[type="image/webp"]')).toHaveAttribute(
      "srcset",
      /kaisoumail-light-480\.webp 480w/
    );
    await expect(kaisouImage).toHaveAttribute("src", /kaisoumail-light-960\.webp$/);
    await expect(kaisouImage).toHaveClass(/is-loaded/);
    await expect(
      posters.filter({ has: page.locator(".project-poster-media") }).locator(".project-poster-copy")
    ).toHaveCount(0);

    const themedPoster = page
      .getByRole("link", { name: "查看 IsolaRail 项目案例" })
      .locator(".project-poster");
    await expect(themedPoster.locator(".project-poster-copy")).toHaveCount(0);
    await expect(themedPoster.locator(".project-poster-scrim")).toHaveCount(0);
  });

  test("project poster preserves its fallback when image delivery fails", async ({ page }) => {
    await page.route(/\/projects\/posters\/kaisoumail-light-(480|960)\.(avif|webp)$/, (route) =>
      route.abort()
    );
    await gotoWithTheme(page, "/projects/kaisoumail", "light");

    const poster = page.locator(".project-poster");
    const image = poster.locator("img[data-project-poster-image]");
    await expect(poster.locator(".project-poster-fallback")).toBeVisible();
    await expect(poster.locator(".project-poster-copy")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "KaisouMail" })).toBeVisible();
    await expect(image).toHaveClass(/is-error/);
  });

  test("project poster disables the reveal transition for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoWithTheme(page, "/projects/kaisoumail", "dark");

    await expect(page.locator(".project-poster-image")).toHaveCSS("transition-duration", "0s");
  });

  test("mobile detail reading measure does not apply a second horizontal gutter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithTheme(page, "/posts/hello-world", "light");

    const detailContainer = page.locator(".nature-detail-container");
    const readingMeasure = detailContainer.locator(":scope > .nature-reading-measure");
    const [containerBounds, readingBounds, horizontalPadding] = await Promise.all([
      detailContainer.boundingBox(),
      readingMeasure.boundingBox(),
      detailContainer.evaluate((element) => {
        const style = getComputedStyle(element);
        return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      }),
    ]);

    expect(containerBounds).not.toBeNull();
    expect(readingBounds).not.toBeNull();
    expect(
      Math.abs((readingBounds?.width ?? 0) - ((containerBounds?.width ?? 0) - horizontalPadding))
    ).toBeLessThanOrEqual(1);
  });

  test("mobile search entry still redirects correctly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithTheme(page, "/", "light");

    const shellInstanceId = await page.locator("html").getAttribute("data-public-session-id");
    const searchEntry = page.getByRole("link", { name: "搜索" });
    await expect(searchEntry).toBeVisible();
    await searchEntry.click();
    await expect(page).toHaveURL(/\/search\/$/);

    const searchInput = page.getByRole("textbox").first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Vue");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\/\?q=Vue/);
    await expect(page.getByRole("heading", { name: "搜索内容" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );
  });

  test("mobile search keeps visible header navigation on a second aligned row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const headerSurface = page.locator(".nature-site-header .nature-surface");
    const mainContainer = page.locator("main .nature-container:visible").first();
    const mobileNavigation = page.getByRole("navigation", { name: "Main navigation" });
    const brand = page.getByRole("link", { name: "Ivan's Blog" });

    await expect(headerSurface).toBeVisible();
    await expect(mainContainer).toBeVisible();
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation.getByRole("link", { name: "文章", exact: true })).toBeVisible();
    await expect(page.locator('summary[aria-label="打开导航"]')).toHaveCount(0);

    const [headerBounds, mainBounds, navigationBounds, brandBounds] = await Promise.all([
      headerSurface.boundingBox(),
      mainContainer.boundingBox(),
      mobileNavigation.boundingBox(),
      brand.boundingBox(),
    ]);

    expect(headerBounds).not.toBeNull();
    expect(mainBounds).not.toBeNull();
    expect(navigationBounds).not.toBeNull();
    expect(brandBounds).not.toBeNull();
    expect(Math.abs((headerBounds?.x ?? 0) - (mainBounds?.x ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((headerBounds?.width ?? 0) - (mainBounds?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(navigationBounds?.y ?? 0).toBeGreaterThanOrEqual(
      brandBounds?.y ?? 0 + (brandBounds?.height ?? 0)
    );

    await expect(page.getByRole("button", { name: "Auto" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "RSS Feed" })).toBeVisible();
  });

  test("medium header keeps navigation left-aligned with compact gaps", async ({ page }) => {
    for (const width of [640, 772, 1023]) {
      await page.setViewportSize({ width, height: width === 772 ? 599 : 800 });
      await gotoWithTheme(page, "/posts/code-block-fixture", "dark");

      const headerSurface = page.locator(".nature-site-header .nature-surface");
      const brand = page.getByRole("link", { name: "Ivan's Blog" });
      const navigation = page.getByRole("navigation", { name: "Main navigation" });
      const navigationList = navigation.locator("ul");
      const tools = page.locator(".nature-header-tools");
      const [headerBounds, brandBounds, navigationBounds, listBounds, toolsBounds, navMetrics] =
        await Promise.all([
          headerSurface.boundingBox(),
          brand.boundingBox(),
          navigation.boundingBox(),
          navigationList.boundingBox(),
          tools.boundingBox(),
          navigation.evaluate((nav) => {
            const list = nav.querySelector("ul");
            if (!list) return null;
            const links = [...list.querySelectorAll("a")].map((link) => {
              const rect = link.getBoundingClientRect();
              const styles = getComputedStyle(link);
              const horizontalInsets =
                Number.parseFloat(styles.paddingLeft) +
                Number.parseFloat(styles.paddingRight) +
                Number.parseFloat(styles.borderLeftWidth) +
                Number.parseFloat(styles.borderRightWidth);
              return {
                left: rect.left,
                right: rect.right,
                contentWidth: rect.width - horizontalInsets,
              };
            });
            return {
              gaps: links.slice(1).map((link, index) => link.left - links[index].right),
              averageContentWidth:
                links.reduce((total, link) => total + link.contentWidth, 0) / links.length,
            };
          }),
        ]);

      expect(headerBounds).not.toBeNull();
      expect(brandBounds).not.toBeNull();
      expect(navigationBounds).not.toBeNull();
      expect(listBounds).not.toBeNull();
      expect(toolsBounds).not.toBeNull();
      expect(navMetrics).not.toBeNull();

      const brandCenter = (brandBounds?.y ?? 0) + (brandBounds?.height ?? 0) / 2;
      const toolsCenter = (toolsBounds?.y ?? 0) + (toolsBounds?.height ?? 0) / 2;
      expect(Math.abs(brandCenter - toolsCenter)).toBeLessThanOrEqual(1);
      expect(navigationBounds?.y ?? 0).toBeGreaterThan(
        (brandBounds?.y ?? 0) + (brandBounds?.height ?? 0)
      );
      expect(Math.abs((listBounds?.x ?? 0) - (navigationBounds?.x ?? 0))).toBeLessThanOrEqual(1);
      expect(listBounds?.width ?? 0).toBeLessThan(navigationBounds?.width ?? 0);
      const headerRight = (headerBounds?.x ?? 0) + (headerBounds?.width ?? 0);
      const toolsRight = (toolsBounds?.x ?? 0) + (toolsBounds?.width ?? 0);
      const navigationRight = (navigationBounds?.x ?? 0) + (navigationBounds?.width ?? 0);
      expect(toolsRight).toBeLessThanOrEqual(headerRight + 1);
      expect(navigationRight).toBeLessThanOrEqual(headerRight + 1);
      const gaps = navMetrics?.gaps ?? [];
      const averageContentWidth = navMetrics?.averageContentWidth ?? 0;
      expect(gaps).toHaveLength(3);
      expect(averageContentWidth).toBeGreaterThan(0);
      for (const gap of gaps) {
        expect(gap).toBeCloseTo(16, 0);
        expect(gap).toBeLessThanOrEqual(averageContentWidth);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        )
      ).toBe(false);
    }
  });

  test("mobile header keeps the RSS control touch-sized", async ({ page }) => {
    await page.setViewportSize({ width: 438, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const rssLink = page.getByRole("link", { name: "RSS Feed" });
    await expect(rssLink).toBeVisible();
    await expect(rssLink).toHaveCSS("width", "44px");
    await expect(rssLink).toHaveCSS("height", "44px");
  });

  test("mobile public header scroll follows document movement and settles at endpoints", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/memos", "light");

    const header = page.locator("[data-public-header]");
    await expect(header).toHaveAttribute("data-public-header-state", "expanded");

    const initialHeight = await header.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    expect(initialHeight).toBeGreaterThan(0);

    const firstScroll = Math.min(
      48,
      Math.max(
        1,
        await page.evaluate(() => document.documentElement.scrollHeight - innerHeight - 1)
      )
    );
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), firstScroll);
    await expect
      .poll(() => header.getAttribute("data-public-header-offset"))
      .toBe(`${Math.max(initialHeight - firstScroll, 0)}`);

    const collapseScroll = Math.min(
      Math.ceil(initialHeight * 1.2),
      await page.evaluate(() => document.documentElement.scrollHeight - innerHeight - 1)
    );
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), collapseScroll);
    await expect(header).toHaveAttribute("data-public-header-state", "collapsed");
    await expect(header).toHaveAttribute("data-public-header-offset", "0");
    await expect
      .poll(() => header.evaluate((element) => element.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(0);
    expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(
      -initialHeight,
      0
    );

    const firstNavigationLink = header.getByRole("link", { name: "文章", exact: true });
    await firstNavigationLink.focus();
    await expect(header).toHaveAttribute("data-public-header-state", "expanded");
    await expect(firstNavigationLink).not.toHaveAttribute("tabindex", "-1");

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).toHaveAttribute("data-public-header-state", "expanded");
  });

  test("mobile header keeps a focused control visible during collapse", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/memos", "light");

    const header = page.locator("[data-public-header]");
    const firstNavigationLink = header.getByRole("link", { name: "文章", exact: true });
    await firstNavigationLink.focus();

    const headerHeight = await header.evaluate((element) => element.getBoundingClientRect().height);
    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight - 1
    );
    await page.evaluate(
      (scrollY) => window.scrollTo(0, scrollY),
      Math.min(Math.ceil(headerHeight * 1.2), maxScroll)
    );

    await expect(header).toHaveAttribute("data-public-header-state", "expanded");
    await expect(firstNavigationLink).toBeFocused();
    await expect(firstNavigationLink).not.toHaveAttribute("tabindex", "-1");
  });

  test("mobile header settles only after touch release", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/memos", "light");

    const header = page.locator("[data-public-header]");
    const initialHeight = await header.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    await page.evaluate(() => window.dispatchEvent(new Event("touchstart")));
    const firstTouchScroll = Math.ceil(initialHeight * 0.3);
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), firstTouchScroll);
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), firstTouchScroll - 5);
    await page.waitForTimeout(180);

    await expect(header).toHaveAttribute("data-public-header-state", "partial");
    await expect(header).toHaveAttribute(
      "data-public-header-offset",
      `${initialHeight - firstTouchScroll + 5}`
    );
    await expect.poll(() => header.getAttribute("data-public-header-settling")).toBeNull();

    await page.evaluate(() => window.dispatchEvent(new Event("touchend")));
    await expect(header).toHaveAttribute("data-public-header-state", "expanded");
  });

  test("mobile header honors reduced motion and remeasures its height", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/memos", "light");

    const header = page.locator("[data-public-header]");
    await expect
      .poll(() => header.evaluate((element) => getComputedStyle(element).transitionProperty))
      .toBe("none");

    const initialHeight = await header.getAttribute("data-public-header-height");
    expect(initialHeight).toBeTruthy();
    await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>("[data-public-header]");
      if (header) header.style.minHeight = "180px";
    });
    await expect
      .poll(() => header.getAttribute("data-public-header-height"))
      .not.toBe(initialHeight);
  });

  test("public header resets on client navigation and stays untouched on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/memos", "dark");

    const mobileHeader = page.locator("[data-public-header]");
    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight - 1
    );
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), Math.min(220, maxScroll));
    await expect(mobileHeader).toHaveAttribute("data-public-header-state", "collapsed");

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "文章", exact: true })
      .click();
    await expect(page).toHaveURL(/\/posts\/$/);
    await expect(page.locator("[data-public-header]")).toHaveAttribute(
      "data-public-header-state",
      "expanded"
    );

    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoWithTheme(page, "/posts", "dark");
    const desktopHeader = page.locator("[data-public-header]");
    await expect(desktopHeader).toBeVisible();
    await expect(desktopHeader).toHaveAttribute("data-public-header-state", "expanded");
    await expect(desktopHeader).toHaveCSS("top", "0px");
    await expect(desktopHeader).not.toHaveAttribute("data-public-header-offset");
  });

  test("mobile search exposes its results region in the first viewport", async ({ page }) => {
    await page.setViewportSize({ width: 438, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const resultsRegion = page.locator("[data-search-island] [data-search-results-region]");
    const firstResult = resultsRegion.locator(":scope > *").first();
    await expect(resultsRegion).toBeVisible();
    await expect(firstResult).toBeVisible();

    const bounds = await firstResult.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(426);
  });

  test("mobile search avoids repeating its page purpose", async ({ page }) => {
    await page.setViewportSize({ width: 438, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const redundantKicker = page.locator(
      "[data-search-island] [data-search-query-panel] .nature-kicker"
    );
    await expect(redundantKicker).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "搜索内容" })).toBeVisible();
  });

  test("mobile search removes the redundant no-results summary", async ({ page }) => {
    await page.setViewportSize({ width: 438, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const queryPanel = page.locator("[data-search-island] [data-search-query-panel]");
    const redundantSummary = queryPanel.getByText("还没有找到「SSH」", { exact: true });
    await expect(redundantSummary).toHaveCount(1);
    await expect(redundantSummary).toBeHidden();
    await expect(page.getByRole("heading", { name: "没有找到相关内容" })).toBeVisible();
  });

  test("query stays visible while the search island is waiting to hydrate", async ({ page }) => {
    let releaseSearchIsland: (() => void) | undefined;
    let markSearchIslandRequested: (() => void) | undefined;
    const searchIslandGate = new Promise<void>((resolve) => {
      releaseSearchIsland = resolve;
    });
    const searchIslandRequested = new Promise<void>((resolve) => {
      markSearchIslandRequested = resolve;
    });

    await page.route(/\/_astro\/SearchPageIsland\.[^/]+\.js$/, async (route) => {
      markSearchIslandRequested?.();
      await searchIslandGate;
      await route.continue();
    });

    try {
      await gotoWithTheme(page, "/search/?q=SSH%20%E6%8E%92%E9%9A%9C", "light");
      await searchIslandRequested;

      const bootstrap = page.locator("[data-search-bootstrap]");
      const islandHost = page.locator("[data-search-island]");
      await expect(bootstrap).toBeVisible();
      await expect(islandHost).toHaveAttribute("hidden", "");
      await expect(islandHost).toHaveAttribute("inert", "");
      await expect(islandHost).toHaveAttribute("aria-hidden", "true");
      await expect(page.getByRole("textbox", { name: "搜索关键词" })).toHaveCount(1);
      await expect(page.getByRole("textbox", { name: "搜索关键词" })).toHaveValue("SSH 排障");
      await expect(page.getByLabel("搜索结果加载中")).toBeVisible();
      await expect(page.getByText("正在检索「SSH 排障」")).toBeVisible();
      await expect(page.getByText("等待输入关键词")).toBeHidden();
      await expect(page.getByText("输入关键词开始搜索")).toBeHidden();

      await islandHost.locator("astro-island").dispatchEvent("public-search:error");
      await expect(page.getByRole("alert")).toContainText("搜索组件暂时没有加载完成");
      await expect(page.getByRole("alert")).toContainText("SSH 排障");
      await expect(page.getByRole("button", { name: "刷新重试" })).toBeVisible();
      await expect(page.getByLabel("搜索结果加载中")).toBeHidden();

      releaseSearchIsland?.();
      await expect(islandHost.locator("astro-island")).toHaveAttribute("data-search-ready", "true");
      await expect(bootstrap).toBeHidden();
      await expect(islandHost).not.toHaveAttribute("hidden", "");
      await expect(page.getByRole("textbox", { name: "搜索关键词" })).toHaveValue("SSH 排障");

      await page.goto("/search/?q=%20%20", { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-search-bootstrap]")).toBeHidden();
      await expect(page.getByText("等待输入关键词")).toBeVisible();
      await expect(page.getByText("输入关键词开始搜索")).toBeVisible();
    } finally {
      releaseSearchIsland?.();
    }
  });

  test("public mobile density stays compact without shrinking touch targets", async ({ page }) => {
    for (const width of [393, 375, 360, 320]) {
      await page.setViewportSize({
        width,
        height: width === 393 ? 852 : width === 320 ? 700 : 800,
      });

      for (const route of ["/", "/memos", "/posts", "/search", "/projects"]) {
        await gotoWithTheme(page, route, "dark");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth
          )
        ).toBe(false);
      }

      await gotoWithTheme(page, "/memos", "dark");
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const header = document.querySelector<HTMLElement>(
          ".nature-site-header-frame > .nature-surface"
        );
        const card = document.querySelector<HTMLElement>(".nature-timeline-card");
        const typeIcon = document.querySelector<HTMLElement>('[data-testid="timeline-type-icon"]');
        const navLabels = Array.from(
          document.querySelectorAll<HTMLElement>(".nature-nav-link-label")
        );
        const navTargets = Array.from(
          document.querySelectorAll<HTMLElement>(".nature-nav-link")
        ).map((target) => target.getBoundingClientRect());
        const nav = document.querySelector<HTMLElement>(".nature-site-header-frame nav");
        const navBounds = nav?.getBoundingClientRect();
        const viewportWidth = root.clientWidth;
        const edgeSelectors = [
          ".nature-site-header-frame > .nature-surface",
          "main > .nature-container",
          "footer .nature-container > .nature-surface",
        ];
        const shellEdges = edgeSelectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          const bounds = element?.getBoundingClientRect();

          return bounds
            ? { left: bounds.left, right: viewportWidth - bounds.right }
            : { left: -1, right: -1 };
        });

        return {
          hasRequiredElements: Boolean(header && card && typeIcon),
          headerRadius: header ? Number.parseFloat(getComputedStyle(header).borderRadius) : 0,
          cardWidth: card?.getBoundingClientRect().width ?? 0,
          typeIconWidth: typeIcon?.getBoundingClientRect().width ?? 0,
          visibleNavLabels: navLabels.filter((label) => getComputedStyle(label).display !== "none")
            .length,
          shellEdges,
          navTargets: navTargets.map(({ width: targetWidth, height }) => ({
            width: targetWidth,
            height,
          })),
          navSpacing:
            navBounds && navTargets.length > 0
              ? {
                  left: navTargets[0].left - navBounds.left,
                  between: navTargets
                    .slice(1)
                    .map((target, index) => target.left - navTargets[index].right),
                  right: navBounds.right - navTargets[navTargets.length - 1].right,
                }
              : null,
        };
      });

      expect(metrics.hasRequiredElements).toBe(true);
      expect(metrics.headerRadius).toBeLessThanOrEqual(16);
      for (const edges of metrics.shellEdges) {
        const expectedEdge = width <= 375 ? 8 : 12;
        expect(edges.left).toBeCloseTo(expectedEdge, 0);
        expect(edges.right).toBeCloseTo(expectedEdge, 0);
      }
      expect(metrics.navTargets).toHaveLength(4);
      for (const target of metrics.navTargets) {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }

      if (width === 320) {
        expect(metrics.visibleNavLabels).toBe(0);
        expect(metrics.typeIconWidth).toBeGreaterThanOrEqual(20);
        expect(metrics.cardWidth).toBeGreaterThanOrEqual(250);
        expect(metrics.navSpacing).not.toBeNull();
        const spacing = metrics.navSpacing;
        const reference = spacing?.left ?? 0;
        expect(Math.abs((spacing?.right ?? reference) - reference)).toBeLessThanOrEqual(1);
        for (const gap of spacing?.between ?? []) {
          expect(Math.abs(gap - reference)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test("home and memos switch from desktop timelines to mobile content streams", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });

    await gotoWithTheme(page, "/", "light");
    const homeTimeline = page.getByTestId("home-timeline");
    await expect(homeTimeline).toBeVisible();
    await expect(homeTimeline.getByTestId("timeline-item").first()).toBeVisible();
    await expect(homeTimeline.getByTestId("timeline-node").first()).toBeVisible();
    await expect(homeTimeline.getByTestId("timeline-connector").first()).toBeVisible();
    expect(await homeTimeline.getByTestId("timeline-item").count()).toBeGreaterThan(1);
    await expect(
      homeTimeline.getByTestId("timeline-type-label").filter({ hasText: "文章" }).first()
    ).toBeVisible();
    await expect(
      homeTimeline.getByTestId("timeline-type-label").filter({ hasText: "闪念" }).first()
    ).toBeVisible();
    const desktopHomeEntries = await readTimelineEntries(homeTimeline.getByTestId("timeline-item"));
    expect(desktopHomeEntries.every((entry) => entry.kind && entry.date && entry.href)).toBe(true);

    const desktopNodeMetrics = await homeTimeline
      .getByTestId("timeline-node")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return {
            kind: node.getAttribute("data-timeline-kind"),
            width: rect.width,
            height: rect.height,
            border: style.border,
            borderRadius: style.borderRadius,
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            boxShadow: style.boxShadow,
          };
        })
      );
    expect(desktopNodeMetrics.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["post", "memo"])
    );
    const desktopReference = desktopNodeMetrics[0];
    expect(desktopReference).toBeTruthy();
    for (const node of desktopNodeMetrics) {
      expect(Math.abs(node.width - node.height)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(node.width - (desktopReference?.width ?? node.width))).toBeLessThanOrEqual(
        0.5
      );
      expect(node.border).not.toBe("none");
      expect(Number.parseFloat(node.borderRadius)).toBeGreaterThanOrEqual(node.width / 2);
      expect(node.backgroundColor !== "rgba(0, 0, 0, 0)" || node.backgroundImage !== "none").toBe(
        true
      );
      expect(node.boxShadow).not.toBe("none");
    }

    await gotoWithTheme(page, "/memos", "light");
    const memosTimeline = page.getByTestId("memos-timeline");
    await expect(memosTimeline).toBeVisible();
    await expect(memosTimeline.getByTestId("memo-card").first()).toBeVisible();
    await expect(memosTimeline.getByTestId("timeline-node").first()).toBeVisible();
    const desktopMemo = memosTimeline.getByTestId("memo-card").first();
    await expect(desktopMemo.getByTestId("timeline-date-icon")).toBeVisible();
    await expect(desktopMemo.getByTestId("timeline-type-icon")).toBeHidden();
    const memoCount = await memosTimeline.getByTestId("memo-card").count();
    expect(memoCount).toBeGreaterThan(0);
    const desktopMemoEntries = await readTimelineEntries(memosTimeline.getByTestId("memo-card"));
    expect(desktopMemoEntries.every((entry) => entry.kind && entry.date && entry.href)).toBe(true);
    if (memoCount > 1) {
      await expect(memosTimeline.getByTestId("timeline-connector").first()).toBeVisible();
    } else {
      await expect(memosTimeline.getByTestId("timeline-connector")).toHaveCount(0);
    }

    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/", "light");
    const mobileTimeline = page.getByTestId("home-timeline");
    const mobileNodes = mobileTimeline.getByTestId("timeline-node");
    await expect(mobileNodes.first()).toBeHidden();
    await expect(mobileTimeline.getByTestId("timeline-connector").first()).toBeHidden();
    await expect(mobileTimeline.getByTestId("timeline-type-icon").first()).toBeVisible();
    await expect(mobileTimeline.getByTestId("timeline-type-label").first()).toBeHidden();
    const mobileHomeEntries = await readTimelineEntries(
      mobileTimeline.getByTestId("timeline-item")
    );
    expect(mobileHomeEntries).toEqual(desktopHomeEntries);
    const firstMobileItem = mobileTimeline.getByTestId("timeline-item").first();
    const hiddenTypeLabel = await firstMobileItem.getByTestId("timeline-type-label").textContent();
    await expect(firstMobileItem.getByTestId("timeline-accessible-type")).toHaveText(
      hiddenTypeLabel?.trim() ?? ""
    );
    expect(await firstMobileItem.ariaSnapshot()).toContain(hiddenTypeLabel?.trim() ?? "");

    const mobileHomeTypeDateGaps = await readTypeDateGaps(
      mobileTimeline.getByTestId("timeline-item")
    );
    expect(mobileHomeTypeDateGaps.length).toBe(mobileHomeEntries.length);
    for (const gap of mobileHomeTypeDateGaps) {
      expect(gap).not.toBeNull();
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(9);
    }

    await gotoWithTheme(page, "/memos", "light");
    const mobileMemosTimeline = page.getByTestId("memos-timeline");
    const mobileMemoEntries = await readTimelineEntries(
      mobileMemosTimeline.getByTestId("memo-card")
    );
    expect(mobileMemoEntries).toEqual(desktopMemoEntries);
    const mobileMemoTypeDateGaps = await readTypeDateGaps(
      mobileMemosTimeline.getByTestId("memo-card")
    );
    expect(mobileMemoTypeDateGaps.length).toBe(mobileMemoEntries.length);
    for (const gap of mobileMemoTypeDateGaps) {
      expect(gap).not.toBeNull();
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(9);
    }
    await expect(mobileMemosTimeline.getByTestId("timeline-node").first()).toBeHidden();
    await expect(mobileMemosTimeline.getByTestId("timeline-connector").first()).toBeHidden();
    const mobileMemo = mobileMemosTimeline.getByTestId("memo-card").first();
    await expect(mobileMemo.getByTestId("timeline-type-icon")).toBeVisible();
    await expect(mobileMemo.getByTestId("timeline-date-icon")).toBeHidden();
    await expect(mobileMemo.getByTestId("timeline-accessible-type")).toHaveText("闪念");
    expect(await mobileMemo.ariaSnapshot()).toContain("闪念");
  });

  test.describe("system theme and reduced motion", () => {
    test("public shell resolves dark theme when motion is reduced", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await gotoWithTheme(page, "/", "system");

      await expect(page.locator("html")).toHaveAttribute("data-ui-preference", "system");
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");

      const media = await page.evaluate(() => ({
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
        prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      }));

      expect(media.prefersDark).toBe(true);
      expect(media.prefersReducedMotion).toBe(true);
      await expect(page.getByRole("heading", { name: /Ivan's Blog/ })).toBeVisible();
      const panelTransitionDurationMs = await page
        .locator(".nature-panel")
        .first()
        .evaluate((panel) =>
          Math.max(
            ...getComputedStyle(panel)
              .transitionDuration.split(",")
              .map((duration) => {
                const value = duration.trim();
                const numericValue = Number.parseFloat(value);
                return value.endsWith("ms") ? numericValue : numericValue * 1000;
              })
          )
        );
      expect(panelTransitionDurationMs).toBeLessThanOrEqual(0.01);
    });
  });

  test("non-production tooling routes return 404 in production gateway", async ({ request }) => {
    for (const route of ["/theme-test", "/test-editor", "/demo-integration", "/demo-memo-card"]) {
      const response = await request.get(route);
      expect(response.status(), route).toBe(404);
    }
  });
});
