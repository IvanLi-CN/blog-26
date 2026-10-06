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
