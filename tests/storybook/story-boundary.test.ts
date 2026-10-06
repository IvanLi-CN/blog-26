import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../..");
const storyRoots = [resolve(repoRoot, "src"), resolve(repoRoot, "apps/admin/src")];

async function findStoryFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const glob = new Bun.Glob("**/*.stories.{ts,tsx,mdx}");
  for await (const relativePath of glob.scan({ cwd: root, absolute: true })) {
    files.push(relativePath);
  }
  return files.sort();
}

test("Storybook stays at component and reusable-state scope", async () => {
  const storyFiles = (await Promise.all(storyRoots.map(findStoryFiles))).flat();
  const contents = await Promise.all(
    storyFiles.map(async (file) => ({ file, content: await readFile(file, "utf8") }))
  );

  expect(
    contents.some(({ file }) => file.endsWith("apps/admin/src/pages/preview.stories.tsx"))
  ).toBe(false);
  expect(
    contents.some(({ file }) => file.endsWith("src/components/playbook/PlaybookPage.stories.tsx"))
  ).toBe(false);
  expect(contents.some(({ file }) => file.endsWith("PublicArticleDetail.stories.tsx"))).toBe(false);
  expect(contents.some(({ file }) => file.endsWith("PublicMemoDetail.stories.tsx"))).toBe(false);

  for (const { file, content } of contents) {
    expect(file).not.toContain("/src/pages/");
    expect(content).not.toContain('data-visual-evidence-surface="page"');
    expect(content).not.toMatch(/title:\s*["'](?:Admin\/Pages|Public\/Playbook\/Page)/u);
  }
});

test("page evidence mode is selected at build time", async () => {
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const astroConfig = await readFile(resolve(repoRoot, "astro.config.mjs"), "utf8");
  const adminMain = await readFile(resolve(repoRoot, "apps/admin/src/main.tsx"), "utf8");
  const memoPage = await readFile(resolve(repoRoot, "site/pages/memos/index.astro"), "utf8");
  const memoTimeline = await readFile(
    resolve(repoRoot, "site/components/MemoTimeline.tsx"),
    "utf8"
  );
  const webDemoSiteScript = packageJson.scripts?.["web-demo:site"] ?? "";

  expect(adminMain).toContain("VITE_WEB_DEMO_BUILD");
  expect(adminMain).not.toContain("localStorage");
  expect(adminMain).not.toContain("URLSearchParams");
  expect(memoPage).toContain('process.env.WEB_DEMO_BUILD === "true"');
  expect(memoPage).not.toContain("Astro.url.searchParams");
  expect(memoTimeline).toContain("PUBLIC_WEB_DEMO_BUILD");
  expect(memoTimeline).not.toContain("import.meta.env.DEV");
  expect(webDemoSiteScript).toContain("CONSOLE_RUNTIME=false");
  expect(webDemoSiteScript).toContain("ASTRO_CACHE_DIR=.astro-web-demo-dev");
  expect(webDemoSiteScript).toContain("VITE_CACHE_DIR=node_modules/.vite-web-demo-dev");
  expect(webDemoSiteScript).toContain("ASTRO_OUT_DIR=web-demo-site-dev-dist");
  expect(astroConfig).toContain('"**/web-demo-site-dist/**"');
  expect(astroConfig).toContain('"**/web-demo-admin-dist/**"');
});
