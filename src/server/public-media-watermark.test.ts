import { describe, expect, it } from "bun:test";
import {
  chooseWatermarkInk,
  createWatermarkPlan,
  renderWatermarkMask,
  resetWatermarkAnalysisStateForTests,
  runWatermarkAnalysis,
  type WatermarkFrame,
  watermarkAssetName,
} from "./public-media-watermark";

function frame(red: number, green: number, blue: number, delayMs = 100): WatermarkFrame {
  return { data: Buffer.from([red, green, blue, 255]), width: 1, height: 1, delayMs };
}

describe("public media watermark contrast", () => {
  it("chooses dark ink for a light covered region and light ink for a dark one", () => {
    const mask = { data: new Uint8Array([255]), width: 1, height: 1 };
    expect(chooseWatermarkInk([frame(255, 255, 255)], mask)).toBe("dark");
    expect(chooseWatermarkInk([frame(20, 30, 25)], mask)).toBe("light");
    expect(
      chooseWatermarkInk([{ data: Buffer.from([0, 0, 0, 0]), width: 1, height: 1 }], mask)
    ).toBe("dark");
    expect(
      chooseWatermarkInk([{ data: Buffer.from([128, 128, 128, 255]), width: 1, height: 1 }], mask)
    ).toBe("light");
    expect(
      chooseWatermarkInk([{ data: Buffer.from([160, 160, 160, 255]), width: 1, height: 1 }], mask)
    ).toBe("dark");
  });

  it("uses frame duration when combining animated backgrounds", () => {
    const mask = { data: new Uint8Array([255]), width: 1, height: 1 };
    expect(chooseWatermarkInk([frame(255, 255, 255, 100), frame(20, 30, 25, 900)], mask)).toBe(
      "light"
    );
    expect(chooseWatermarkInk([frame(255, 255, 255, 900), frame(20, 30, 25, 100)], mask)).toBe(
      "dark"
    );
  });

  it("rejects analysis after its deadline and releases the slot when work settles", async () => {
    let lateWorkSettled = false;
    await expect(
      runWatermarkAnalysis(async () => {
        await Bun.sleep(20);
        lateWorkSettled = true;
        return "late";
      }, 5)
    ).rejects.toThrow("watermark analysis deadline exceeded");
    await Bun.sleep(30);
    expect(lateWorkSettled).toBe(true);
    await expect(runWatermarkAnalysis(async () => "next", 50)).resolves.toBe("next");
    resetWatermarkAnalysisStateForTests();
  });

  it("releases the logical slot when an aborted analysis never settles", async () => {
    await expect(runWatermarkAnalysis(() => new Promise(() => undefined), 5)).rejects.toThrow(
      "watermark analysis deadline exceeded"
    );
    await expect(runWatermarkAnalysis(async () => "next", 50)).resolves.toBe("next");
    resetWatermarkAnalysisStateForTests();
  });

  it("renders a foreground-only mask without the SVG shadow", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><filter id="soft-shadow"><feDropShadow flood-color="#000"/></filter></defs><rect filter="url(#soft-shadow)" width="10" height="10" fill="#fff"/></svg>';
    const mask = await renderWatermarkMask(svg, 10);
    expect(mask.width).toBe(10);
    expect(mask.height).toBe(10);
    expect(mask.data.some((value) => value > 0)).toBe(true);
  });

  it("keeps historical asset identity and gives v3 explicit ink assets", () => {
    expect(watermarkAssetName("a", "v1")).toBe("watermark-ivanli-a.v1.svg");
    expect(watermarkAssetName("b", "v2")).toBe("watermark-ivanli-b.v1.svg");
    expect(watermarkAssetName("a", "v3", "dark")).toBe("watermark-ivanli-a.dark.v3.svg");
    expect(
      createWatermarkPlan({
        composition: "b",
        version: "v3",
        ink: "dark",
        dimensions: { width: 1000, height: 600 },
      })
    ).toMatchObject({
      asset: "watermark-ivanli-b.dark.v3.svg",
      width: 180,
      margin: 20,
      opacity: 0.64,
      heightRatio: 100,
    });
    resetWatermarkAnalysisStateForTests();
  });
});
