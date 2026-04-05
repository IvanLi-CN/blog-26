import { describe, expect, it } from "bun:test";
import { isDarkTheme, resolveThemeName } from "../theme";

describe("theme helpers", () => {
  it("resolves system theme correctly", () => {
    expect(resolveThemeName("system", true)).toBe("dark");
    expect(resolveThemeName("system", false)).toBe("light");
  });

  it("keeps non-system theme as-is", () => {
    expect(resolveThemeName("dark", true)).toBe("dark");
    expect(resolveThemeName("light", false)).toBe("light");
  });

  it("only dark resolves as dark", () => {
    expect(isDarkTheme("system")).toBe(false);
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("light")).toBe(false);
  });
});
