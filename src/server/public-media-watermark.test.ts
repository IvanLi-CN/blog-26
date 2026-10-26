import { describe, expect, it } from "bun:test";
import {
  chooseWatermarkInk,
  createWatermarkPlan,
  renderWatermarkMask,
  resetWatermarkAnalysisStateForTests,
  runWatermarkAnalysis,
  type WatermarkFrame,
  watermarkAssetName,
  watermarkCacheKey,
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

  it("keeps timed-out work accounted until the underlying task settles", async () => {
    let settleFirstTimedOutWork: (() => void) | undefined;
    let settleSecondTimedOutWork: (() => void) | undefined;
    const firstTimedOutWork = new Promise<void>((resolve) => {
      settleFirstTimedOutWork = resolve;
    });
    const secondTimedOutWork = new Promise<void>((resolve) => {
      settleSecondTimedOutWork = resolve;
    });
    let nextStarted = false;
    const firstTimedOut = runWatermarkAnalysis(() => firstTimedOutWork, 5);
    const secondTimedOut = runWatermarkAnalysis(() => secondTimedOutWork, 5);
    await expect(Promise.all([firstTimedOut, secondTimedOut])).rejects.toThrow(
      "watermark analysis deadline exceeded"
    );
    const next = runWatermarkAnalysis(async () => {
      nextStarted = true;
      return "next";
    }, 50);
    await Bun.sleep(10);
    expect(nextStarted).toBe(false);
    settleFirstTimedOutWork?.();
    await expect(next).resolves.toBe("next");
    expect(nextStarted).toBe(true);
    settleSecondTimedOutWork?.();
    resetWatermarkAnalysisStateForTests();
  });

  it("counts queue wait against the analysis deadline", async () => {
    let settleFirst: (() => void) | undefined;
    let settleSecond: (() => void) | undefined;
    const firstWork = new Promise<void>((resolve) => {
      settleFirst = resolve;
    });
    const secondWork = new Promise<void>((resolve) => {
      settleSecond = resolve;
    });
    const first = runWatermarkAnalysis(() => firstWork, 100);
    const second = runWatermarkAnalysis(() => secondWork, 100);
    let queuedStarted = false;
    const queued = runWatermarkAnalysis(async () => {
      queuedStarted = true;
      return "queued";
    }, 5);
    await expect(queued).rejects.toThrow("watermark analysis deadline exceeded");
    expect(queuedStarted).toBe(false);
    settleFirst?.();
    settleSecond?.();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
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

  it("keeps historical asset identity and gives v3-v5 explicit ink assets", () => {
    expect(watermarkAssetName("a", "v1")).toBe("watermark-ivanli-a.v1.svg");
    expect(watermarkAssetName("b", "v2")).toBe("watermark-ivanli-b.v1.svg");
    expect(watermarkAssetName("a", "v3", "dark")).toBe("watermark-ivanli-a.dark.v3.svg");
    expect(watermarkAssetName("a", "v4", "dark")).toBe("watermark-ivanli-a.dark.v4.svg");
    expect(watermarkAssetName("b", "v4", "dark")).toBe("watermark-ivanli-b.dark.v3.svg");
    expect(watermarkAssetName("a", "v5", "dark")).toBe("watermark-ivanli-a.dark.v5.svg");
    expect(watermarkAssetName("b", "v5", "dark")).toBe("watermark-ivanli-b.dark.v3.svg");
    expect(
      createWatermarkPlan({
        composition: "a",
        version: "v4",
        ink: "dark",
        dimensions: { width: 1000, height: 600 },
      })
    ).toMatchObject({
      asset: "watermark-ivanli-a.dark.v4.svg",
      width: 70,
      margin: 20,
      opacity: 0.64,
      heightRatio: 100,
    });
    resetWatermarkAnalysisStateForTests();
  });

  it("separates adaptive ink cache keys by render version", () => {
    const base = {
      sourcePath: "blog/assets/cover.png",
      size: 1024,
      mtimeMs: 10,
      ctimeMs: 10,
      variant: "cover",
      composition: "a",
    };
    expect(watermarkCacheKey({ ...base, version: "v3" })).not.toBe(
      watermarkCacheKey({ ...base, version: "v4" })
    );
  });

  it("keeps the compact v5 A plan bounded by the final output width", () => {
    expect(
      createWatermarkPlan({
        composition: "a",
        version: "v5",
        ink: "light",
        dimensions: { width: 744, height: 464 },
      })
    ).toMatchObject({
      asset: "watermark-ivanli-a.light.v5.svg",
      width: 52,
      margin: 15,
      heightRatio: 100,
    });
  });
});
