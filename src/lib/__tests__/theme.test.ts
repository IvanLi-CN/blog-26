import { describe, expect, it } from "bun:test";
import { isDarkTheme, resolveThemeName } from "../theme";

describe("theme helpers", () => {
  it("resolves system theme correctly", () => {
    expect(resolveThemeName("system", true)).toBe("dark");
    expect(resolveThemeName("system", false)).toBe("light");
  });

  it("keeps non-system theme as-is", () => {
    expect(resolveThemeName("forest", true)).toBe("forest");
    expect(resolveThemeName("light", false)).toBe("light");
  });

  it("dark theme list matches UI config expectations", () => {
    // Previously drifted in ThemeToggle/layout hardcodes; keep these assertions to prevent regression.
    expect(isDarkTheme("sunset")).toBe(false);
    expect(isDarkTheme("aqua")).toBe(true);
    expect(isDarkTheme("business")).toBe(true);
    expect(isDarkTheme("light")).toBe(false);
  });
});
