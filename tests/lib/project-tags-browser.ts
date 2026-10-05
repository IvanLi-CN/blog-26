import { chromium } from "playwright";
import { projectCatalog } from "../../src/lib/project-catalog";
import { buildTagHref } from "../../src/lib/tag-href";

const base = process.env.PROJECT_TAGS_DEMO_URL;
if (!base) throw new Error("PROJECT_TAGS_DEMO_URL must point at the leased, controlled Astro demo");
const browser = await chromium.launch({ headless: true });
const widths = [1280, 393, 375, 360, 320];
let pagesChecked = 0;
try {
  for (const width of widths)
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: width < 1024,
      });
      await context.addInitScript((theme) => localStorage.setItem("theme", theme), theme);
      const page = await context.newPage();
      const geometry = async () => {
        await page.evaluate((theme) => {
          document.documentElement.dataset.uiTheme = theme;
          document.documentElement.dataset.theme = theme;
        }, theme);
        const failure = await page.evaluate(() => {
          if (document.documentElement.scrollWidth > innerWidth + 1)
            return "Page overflows horizontally";
          const minimum = matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)")
            .matches
            ? 32
            : 44;
          for (const link of document.querySelectorAll<HTMLAnchorElement>(".native-tag-link")) {
            const rect = link.getBoundingClientRect();
            if (rect.height < minimum || rect.width < minimum)
              return `Target too small: ${link.textContent}`;
            if (rect.right > innerWidth + 1 || rect.left < -1)
              return `Tag overflows: ${link.textContent}`;
            link.focus();
            if (document.activeElement !== link || getComputedStyle(link).outlineStyle === "none")
              return "Missing keyboard focus";
          }
          for (const row of document.querySelectorAll("[data-tag-projects] article")) {
            const style = getComputedStyle(row);
            if (innerWidth >= 1024 && parseFloat(style.borderRadius) === 0)
              return "Desktop project lost its native card surface";
            if (innerWidth <= 393 && parseFloat(style.borderRadius) !== 0)
              return "Mobile project lost its continuous reading row";
          }
          return null;
        });
        if (failure) throw new Error(`${width}/${theme}/${page.url()}: ${failure}`);
        pagesChecked++;
      };
      await page.goto(new URL("./", `${base.replace(/\/$/, "")}/`).href);
      for (const project of projectCatalog.filter((project) => project.featuredTags)) {
        const links = page
          .locator("article")
          .filter({
            has: page.locator(
              `a[href$="/projects/${project.slug}"], a[href$="/projects/${project.slug}/"]`
            ),
          })
          .locator(".native-tag-link");
        if ((await links.count()) !== 2) throw new Error(`Homepage tag count: ${project.slug}`);
        for (let index = 0; index < 2; index++) {
          if ((await links.nth(index).textContent())?.trim() !== project.featuredTags?.[index])
            throw new Error(`Incorrect featured tag: ${project.slug}`);
        }
      }

      await geometry();
      for (const project of projectCatalog) {
        await page.goto(`${base.replace(/\/$/, "")}/projects/${project.slug}`);
        const tags = page.locator(".project-detail-header .native-tag-link");
        if ((await tags.count()) !== project.techTags.length)
          throw new Error(`Incomplete tags for ${project.slug}`);
        for (let index = 0; index < project.techTags.length; index++) {
          const href = await tags.nth(index).getAttribute("href");
          if (!href?.replace(/\/$/, "").endsWith(buildTagHref(project.techTags[index])))
            throw new Error(`Wrong tag URL: ${href}`);
        }
        await geometry();
      }
      for (const [slug, tag] of [
        ["mains-aegis", "USB-C PD + PPS"],
        ["iso-usb-hub", "I²C"],
        ["tuckmark", "Harness"],
      ]) {
        await page.goto(`${base.replace(/\/$/, "")}/projects/${slug}`);
        await page
          .locator(
            `.native-tag-link[href$="${buildTagHref(tag)}"], .native-tag-link[href$="${buildTagHref(tag)}/"]`
          )
          .click();
        await page.waitForFunction(
          (tag) => document.querySelector("h1")?.textContent?.includes(tag),
          tag
        );
        if (!(await page.locator("h1").innerText()).includes(tag))
          throw new Error(`Clicked tag reaches wrong page: ${tag}`);
      }
      for (const tag of ["React", "Harness", "USB-C PD + PPS", "I²C", "MemoOnly", "Engineering"]) {
        const response = await page.goto(`${base.replace(/\/$/, "")}${buildTagHref(tag)}`);
        if (response?.status() !== 200) throw new Error(`Missing native tag page: ${tag}`);
        const projects = page.locator("[data-tag-projects] article");
        const logos = page.locator("[data-tag-projects] [data-project-logo]");
        if ((await logos.count()) !== (await projects.count()))
          throw new Error(`Missing project identity icons on ${tag}`);
        for (const logo of await logos.all()) {
          const failure = await logo.evaluate((node) => {
            const box = node.getBoundingClientRect();
            if (Math.abs(box.width - box.height) > 1) return "Non-square logo container";
            for (const image of node.querySelectorAll("img")) {
              if (getComputedStyle(image).display === "none") continue;
              const rect = image.getBoundingClientRect();
              if (!image.complete || !image.naturalWidth || !image.naturalHeight)
                return "Logo resource failed to load";
              if (rect.width > box.width + 1 || rect.height > box.height + 1)
                return "Logo image overflows its box";
              const ratio = image.naturalWidth / image.naturalHeight;
              if (Math.abs(rect.width / rect.height - ratio) > 0.03)
                return "Logo image lost its original aspect ratio";
            }
            if (node.getAttribute("data-logo-kind") === "icon" && !node.querySelector("svg path"))
              return "Missing static fallback icon";
            return null;
          });
          if (failure) throw new Error(`${tag}: ${failure}`);
        }
        if (tag === "React") {
          if ((await projects.count()) !== 10) throw new Error("React project set is incomplete");
          const sections = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-tag-projects], [data-tag-dated]")).map(
              (node) => (node.hasAttribute("data-tag-projects") ? "projects" : "dated")
            )
          );
          if (sections.join(",") !== "projects,dated") throw new Error("Incorrect section order");
          if ((await page.locator("[data-tag-dated] article").count()) !== 2)
            throw new Error("Missing dated records");
        }
        if (
          tag === "Harness" &&
          !(await page.locator("[data-tag-dated]").innerText()).includes("暂无公开文章或闪念")
        )
          throw new Error("Missing project-only empty state");
        if (tag === "MemoOnly" && (await projects.count()) !== 0)
          throw new Error("Unexpected project section");
        if ((await page.locator("[data-tag-projects] time").count()) !== 0)
          throw new Error("Fabricated project dates");
        await geometry();
      }
      await page.goto(`${base.replace(/\/$/, "")}/tags`);
      if (
        !(
          await page
            .locator(`a[href$="${buildTagHref("React")}"], a[href$="${buildTagHref("React")}/"]`)
            .innerText()
        ).includes("10 个项目")
      )
        throw new Error("Missing per-type counts");
      await geometry();
      await context.close();
    }
  for (const tag of new Set(projectCatalog.flatMap((project) => project.techTags))) {
    const response = await fetch(`${base.replace(/\/$/, "")}${buildTagHref(tag)}`);
    if (!response.ok) throw new Error(`Missing catalog classification route: ${tag}`);
  }
  const rss = await fetch(`${base.replace(/\/$/, "")}/tags/Harness/feed.xml`);
  const xml = await rss.text();
  if (!rss.ok || !xml.includes("<rss") || xml.includes("<item>"))
    throw new Error("Invalid project-only RSS");
  const missing = await fetch(`${base.replace(/\/$/, "")}/tags/UnknownFixtureClassification`);
  if (missing.status !== 404) throw new Error("Unknown tag does not return 404");
  console.log(`Project tag demo: ${pagesChecked} page/theme/viewport checks passed`);
} finally {
  await browser.close();
}
