import { describe, expect, it } from "bun:test";
import { isDarkTheme, normalizeThemeSelection, resolveThemeName } from "../theme";

describe("theme helpers", () => {
  it("resolves system theme correctly", () => {
    expect(resolveThemeName("system", true)).toBe("dark");
    expect(resolveThemeName("system", false)).toBe("light");
  });

  it("keeps non-system theme as-is", () => {
    expect(resolveThemeName("dark", true)).toBe("dark");
    expect(resolveThemeName("light", false)).toBe("light");
  });

  it("maps legacy DaisyUI themes to the stable three-state model", () => {
    expect(normalizeThemeSelection("forest")).toBe("dark");
    expect(normalizeThemeSelection("nord")).toBe("light");
    expect(resolveThemeName("forest", false)).toBe("dark");
    expect(resolveThemeName("nord", true)).toBe("light");
  });

  it("only dark resolves as dark", () => {
    expect(isDarkTheme("system")).toBe(false);
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("light")).toBe(false);
    expect(isDarkTheme("forest")).toBe(true);
    expect(isDarkTheme("nord")).toBe(false);
  });
});
