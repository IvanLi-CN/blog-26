import { describe, expect, it } from "bun:test";
import { chooseWatermarkVariant } from "./useResponsiveWatermark";

describe("chooseWatermarkVariant", () => {
  it.each([
    [0, "a"],
    [239.9, "a"],
    [361, "a"],
    [599.9, "a"],
    [600, "b"],
    [854, "b"],
  ] as const)("maps %s CSS px to %s", (visibleWidth, expected) => {
    expect(chooseWatermarkVariant(visibleWidth)).toBe(expected);
  });

  it("does not depend on device pixel ratio", () => {
    expect(chooseWatermarkVariant(599.9)).toBe(chooseWatermarkVariant(599.9));
    expect(chooseWatermarkVariant(600)).toBe(chooseWatermarkVariant(600));
  });
});
