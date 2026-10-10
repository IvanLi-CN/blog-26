import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../..");

test("Web Demo Inspector uses a wide public rail without affecting normal desktop layout", async () => {
  const [styles, component] = await Promise.all([
    readFile(resolve(repoRoot, "src/components/WebDemoInspector.css"), "utf8"),
    readFile(resolve(repoRoot, "src/components/WebDemoInspector.tsx"), "utf8"),
  ]);

  expect(styles).toContain("position: fixed;");
  expect(styles).toContain("right: 1.5rem;");
  expect(styles).toContain("@media (min-width: 1280px)");
  expect(styles).toContain('[data-web-demo-inspector-root="public"] .web-demo-inspector');
  expect(styles).toContain(
    'body[data-web-demo-inspector-app="public"][data-web-demo-inspector-open="true"]'
  );
  expect(styles).toContain("padding-left: 18rem;");
  expect(styles).toContain("height: 100dvh;");
  expect(styles).not.toContain("padding-left: min(22rem");
  expect(styles).not.toContain("padding-right: min(24rem");
  expect(component).toContain("const DEFAULT_INSPECTOR_OPEN = false;");
  expect(component).toContain("return DEFAULT_INSPECTOR_OPEN;");
  expect(component).toContain("document.body.dataset.webDemoInspectorApp");
  expect(component).toContain("document.body.dataset.webDemoInspectorOpen");
  expect(component).toContain("const [isOpen, setIsOpen] = useState(false);");
  expect(component).toContain("setIsOpen(readInitialOpen());");
});

test("Web Demo Inspector uses the project Select primitive for scene selection", async () => {
  const [styles, component] = await Promise.all([
    readFile(resolve(repoRoot, "src/components/WebDemoInspector.css"), "utf8"),
    readFile(resolve(repoRoot, "src/components/WebDemoInspector.tsx"), "utf8"),
  ]);

  expect(component).toContain('from "@radix-ui/react-select"');
  expect(component).toContain("<SelectPrimitive.Root");
  expect(component).toContain("<SelectPrimitive.Content");
  expect(component).toContain("<SelectPrimitive.Item");
  expect(component).toContain("onValueChange");
  expect(component).not.toContain("<select");
  expect(styles).toContain(".web-demo-inspector-select-content");
  expect(styles).toContain(".web-demo-inspector-select-item[data-highlighted]");
});

test("Web Demo Inspector keeps primary controls ahead of secondary share history", async () => {
  const component = await readFile(
    resolve(repoRoot, "src/components/WebDemoInspector.tsx"),
    "utf8"
  );

  expect(component).toContain("web-demo-inspector-global-group");
  expect(component).toContain("web-demo-inspector-scene-group");
  expect(component).toContain("web-demo-inspector-data-group");
  expect(component).toContain("web-demo-inspector-actions-group");
  expect(component).toContain('aria-labelledby="web-demo-inspector-global-heading"');
  expect(component).toContain("web-demo-inspector-group-heading");
  expect(component).not.toContain('<fieldset className="web-demo-inspector-group');
  expect(component).toContain("web-demo-inspector-secondary");
  expect(component.indexOf("web-demo-inspector-scene-group")).toBeLessThan(
    component.indexOf("web-demo-inspector-secondary")
  );
  expect(component).toContain('<details className="web-demo-inspector-secondary">');
  expect(component).toContain("分享与记录");
});

test("Web Demo Inspector keeps advanced settings full-width inside global environment", async () => {
  const styles = await readFile(resolve(repoRoot, "src/components/WebDemoInspector.css"), "utf8");

  expect(styles).toContain(".web-demo-inspector-global-group .web-demo-inspector-advanced");
  expect(styles).toContain("margin: 0.65rem 0 0;");
  expect(styles).toContain("background: transparent;");
  expect(styles).not.toContain("border-left: 1px solid var(--web-demo-line)");
  expect(styles).not.toContain(
    "background: color-mix(in srgb, var(--web-demo-inset) 34%, transparent)"
  );
});

test("Web Demo Inspector describes available advanced settings accurately", async () => {
  const component = await readFile(
    resolve(repoRoot, "src/components/WebDemoInspector.tsx"),
    "utf8"
  );

  expect(component).toContain('isAdvancedOpen ? "收起设置" : "展开设置"');
  expect(component).not.toContain("暂无高级设置");
});

test("Web Demo Inspector uses a consistent compact section rhythm", async () => {
  const styles = await readFile(resolve(repoRoot, "src/components/WebDemoInspector.css"), "utf8");

  expect(styles).toContain("padding: 0.7rem 0 0.75rem;");
  expect(styles).toContain(".web-demo-inspector-group + .web-demo-inspector-group {");
  expect(styles).toContain("padding-top: 0.75rem;");
  expect(styles).toContain(
    ".web-demo-inspector-scene-group .web-demo-inspector-field {\n  margin-top: 0.5rem;"
  );
  expect(styles).toContain(
    ".web-demo-inspector-data-mode,\n.web-demo-inspector-actions-group .web-demo-inspector-actions {\n  margin-top: 0.5rem;"
  );
  expect(styles).toContain("row-gap: 0.65rem;\n  margin-top: 0.55rem;");
});

test("Web Demo Inspector uses shared compact control variants", async () => {
  const [component, button, input, radioGroup, compactStyles] = await Promise.all([
    readFile(resolve(repoRoot, "src/components/WebDemoInspector.tsx"), "utf8"),
    readFile(resolve(repoRoot, "src/components/ui/button.tsx"), "utf8"),
    readFile(resolve(repoRoot, "src/components/ui/input.tsx"), "utf8"),
    readFile(resolve(repoRoot, "src/components/ui/radio-group.tsx"), "utf8"),
    readFile(resolve(repoRoot, "src/components/ui/compact-controls.css"), "utf8"),
  ]);

  expect(component).toContain('density="compact"');
  expect(component).toContain('size="compact"');
  expect(component).toContain("web-demo-inspector-data-mode");
  expect(component).toContain('aria-label="数据规模"');
  expect(component).toContain("CircleUserRound");
  expect(component).toContain("personaOptions.map(({ value, label, icon: Icon })");
  expect(button).toContain('compact: "nature-button-compact"');
  expect(input).toContain('density?: "default" | "compact"');
  expect(radioGroup).toContain('"nature-radio-item-compact"');
  expect(compactStyles).toContain("height: 2.25rem;");
  expect(compactStyles).toContain(".nature-radio-item-compact:focus-visible");
});
