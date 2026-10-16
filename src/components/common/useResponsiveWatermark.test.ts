import { describe, expect, it } from "bun:test";
import { chooseWatermarkVariant, getVisibleImageWidth } from "./useResponsiveWatermark";

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

  it("measures the contain content box instead of the border box", () => {
    const image = {
      getBoundingClientRect: () => ({ width: 600, height: 600 }),
      naturalHeight: 600,
      naturalWidth: 600,
    } as Pick<HTMLImageElement, "getBoundingClientRect" | "naturalHeight" | "naturalWidth">;
    const styles = {
      borderBottomWidth: "1px",
      borderLeftWidth: "1px",
      borderRightWidth: "1px",
      borderTopWidth: "1px",
      paddingBottom: "0px",
      paddingLeft: "0px",
      paddingRight: "0px",
      paddingTop: "0px",
    };

    const visibleWidth = getVisibleImageWidth(image, styles);

    expect(visibleWidth).toBe(598);
    expect(chooseWatermarkVariant(visibleWidth)).toBe("a");
  });
});
