import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import config, { consoleFiles, publicFiles } from "../e2e/web-demo/ci.config";

type Spec = { file: string; title: string; tags: string[]; tests: unknown[] };
type Suite = { specs?: Spec[]; suites?: Suite[] };
function collect(suites: Suite[]): Spec[] {
  return suites.flatMap((suite) => [...(suite.specs ?? []), ...collect(suite.suites ?? [])]);
}
const ownViewportTitles = [
  "keeps compact mobile publish controls in the first viewport",
  "wraps publish controls only below the compact mobile width",
  "uses the mobile edge-to-edge surface without horizontal overflow",
  "scrolls the document from attachment controls with a native touch gesture",
  "preserves the original desktop header while switching to the public header on mobile",
  "uses the main public navigation on mobile without adding extra entries",
  "opens the mobile conversation list as a modal sheet above the chat surface",
  "keeps the guest mobile surface focused on chat instead of an inline list",
  "keeps detail and related media watermarked separately",
  "mobile mode controls remain keyboard accessible without horizontal overflow",
];
const list = (configPath: string, files: string[], mobile = false) => {
  const result = JSON.parse(
    execFileSync(
      "bunx",
      ["playwright", "test", "--config", configPath, ...files, "--list", "--reporter=json"],
      {
        encoding: "utf8",
        env: { ...process.env, WEB_DEMO_VIEWPORT: mobile ? "mobile" : "desktop" },
      }
    )
  );
  expect(result.errors).toEqual([]);
  return collect(result.suites as Suite[]);
};

test("grouped Web Demo preserves every unique file/title/viewport scenario", () => {
  const standard = "tests/e2e/web-demo/playwright.config.ts";
  const grouped = "tests/e2e/web-demo/ci.config.ts";
  const paths = (names: string[]) => names.map((name) => `tests/e2e/web-demo/${name}`);
  for (const mobile of [false, true]) {
    const original = list(
      standard,
      paths([
        ...consoleFiles,
        ...publicFiles.filter((name) => !mobile || name !== "project-runtime-motion.spec.ts"),
        ...(mobile ? [] : ["assistant-markdown.spec.ts"]),
      ]),
      mobile
    );
    const actual = list(grouped, [], mobile);
    const identity = (s: Spec) => `${s.file}:${s.title}`;
    const expected = original.filter((s) => !mobile || !s.tags.includes("own-viewport"));
    expect(actual.map(identity).sort()).toEqual(expected.map(identity).sort());
    expect(actual.every((s) => s.tests.length === 1)).toBe(true);
    expect(
      original
        .filter((s) => s.tags.includes("own-viewport"))
        .map((s) => s.title)
        .sort()
    ).toEqual([...ownViewportTitles].sort());
  }
}, 30000);

test("grouping retains the worker ceiling and individual suite retry contracts", () => {
  expect(config.workers).toBe(2);
  expect(config.projects?.map((p) => [p.name, p.fullyParallel, p.retries])).toEqual([
    ["assistant-markdown", false, 0],
    ["console", true, 2],
    ["public", true, 0],
  ]);
  expect(config.projects?.map((p) => p.use?.baseURL)).toEqual([
    "http://127.0.0.1:38211",
    "http://127.0.0.1:38210",
    "http://127.0.0.1:38211",
  ]);
});
