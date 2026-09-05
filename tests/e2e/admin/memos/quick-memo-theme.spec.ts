import { expect, type Page } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { openMemoEditDialog, waitForQuickMemoEditor } from "./helpers";

const THEMES = ["light", "dark"] as const;

const CREPE_TO_NATURE = {
  "--crepe-color-background": "--nature-surface-inset",
  "--crepe-color-on-background": "--nature-text",
  "--crepe-color-surface": "--nature-surface-strong",
  "--crepe-color-surface-low": "--nature-surface-muted",
  "--crepe-color-on-surface": "--nature-text",
  "--crepe-color-on-surface-variant": "--nature-text-soft",
  "--crepe-color-outline": "--nature-line-strong",
  "--crepe-color-primary": "--nature-accent-strong",
  "--crepe-color-secondary": "--nature-secondary",
  "--crepe-color-on-secondary": "--nature-bg",
  "--crepe-color-inverse": "--nature-text",
  "--crepe-color-on-inverse": "--nature-bg",
  "--crepe-color-inline-code": "--nature-code-string",
  "--crepe-color-error": "--nature-danger",
  "--crepe-color-hover": "--nature-accent-soft",
  "--crepe-color-selected": "--nature-accent-soft",
  "--crepe-color-inline-area": "--nature-accent-soft",
  "--crepe-shadow-1": "--nature-shadow",
  "--crepe-shadow-2": "--nature-shadow-strong",
} as const;

async function gotoWithTheme(page: Page, route: string, theme: (typeof THEMES)[number]) {
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate((value) => localStorage.setItem("theme", value), theme);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", theme);
}

async function expectNatureEditorTheme(
  editor: ReturnType<Page["locator"]>,
  theme: (typeof THEMES)[number]
) {
  const styles = await editor.evaluate((element, mapping) => {
    const editorStyles = getComputedStyle(element);
    const rootStyles = getComputedStyle(document.documentElement);
    const editorValues = Object.fromEntries(
      Object.keys(mapping).map((name) => [name, editorStyles.getPropertyValue(name).trim()])
    );
    const rootValues = Object.fromEntries(
      Object.values(mapping).map((name) => [name, rootStyles.getPropertyValue(name).trim()])
    );
    const resolveColor = (value: string, property: "background-color" | "color") => {
      const probe = document.createElement("span");
      probe.style.setProperty(property, value);
      document.body.appendChild(probe);
      const styles = getComputedStyle(probe);
      const resolved = property === "background-color" ? styles.backgroundColor : styles.color;
      probe.remove();
      return resolved;
    };

    return {
      editorValues,
      rootValues,
      backgroundColor: editorStyles.backgroundColor,
      textColor: editorStyles.color,
      natureBackgroundColor: resolveColor(rootValues["--nature-surface-inset"], "background-color"),
      natureTextColor: resolveColor(rootValues["--nature-text"], "color"),
    };
  }, CREPE_TO_NATURE);

  for (const [crepeName, natureName] of Object.entries(CREPE_TO_NATURE)) {
    expect(styles.editorValues[crepeName], `${crepeName} should follow ${natureName}`).toBe(
      styles.rootValues[natureName]
    );
  }

  expect(styles.backgroundColor).toBe(styles.natureBackgroundColor);
  expect(styles.textColor).toBe(styles.natureTextColor);

  if (theme === "dark") {
    expect(styles.backgroundColor).not.toBe("rgb(255, 255, 255)");
    expect(styles.textColor).not.toBe("rgb(0, 0, 0)");
  }
}

test.describe("Public Milkdown Nature theme bridge", () => {
  test.describe.configure({ timeout: 180_000 });

  for (const theme of THEMES) {
    test(`quick publish editor uses ${theme} Nature colors`, async ({ page }) => {
      await gotoWithTheme(page, "/memos", theme);
      const { container } = await waitForQuickMemoEditor(page);
      const editor = container.locator(".milkdown").first();
      await expect(editor).toBeVisible();
      await expectNatureEditorTheme(editor, theme);
    });

    test(`public memo edit modal uses ${theme} Nature colors`, async ({ page }) => {
      await gotoWithTheme(page, "/memos/local-memo", theme);
      const controls = page.getByTestId("public-memo-detail-controls");
      await expect(controls).toBeVisible({ timeout: 60_000 });
      const dialog = await openMemoEditDialog(
        page,
        controls.getByRole("button", { name: "编辑 Memo" })
      );
      const editor = dialog.locator(".milkdown").first();
      await expect(editor).toBeVisible();
      await expectNatureEditorTheme(editor, theme);
    });
  }
});
