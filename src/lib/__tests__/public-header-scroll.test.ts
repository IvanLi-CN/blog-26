import { describe, expect, test } from "bun:test";
import {
  createHeaderScrollState,
  reduceHeaderScrollState,
  resizeHeaderScrollState,
  settleHeaderScrollState,
} from "../public-header-scroll";

function scroll(
  state: ReturnType<typeof createHeaderScrollState>,
  scrollY: number,
  timestamp: number
) {
  return reduceHeaderScrollState(state, { scrollY, timestamp }).state;
}

describe("public header scroll state", () => {
  test("moves one-for-one with a downward document scroll", () => {
    const initial = createHeaderScrollState(200);
    const next = scroll(initial, 48, 48);

    expect(next.visibleOffset).toBe(152);
    expect(next.direction).toBe("hide");
  });

  test("settles a half-hidden gesture closed and a short gesture back to origin", () => {
    const initial = createHeaderScrollState(200);
    const halfHidden = scroll(initial, 120, 120);
    const shortHidden = scroll(initial, 60, 60);

    expect(settleHeaderScrollState(halfHidden).visibleOffset).toBe(0);
    expect(settleHeaderScrollState(shortHidden).visibleOffset).toBe(200);
  });

  test("uses the exact 50 percent hide threshold", () => {
    const initial = createHeaderScrollState(200);

    expect(settleHeaderScrollState(scroll(initial, 100, 100)).visibleOffset).toBe(0);
    expect(settleHeaderScrollState(scroll(initial, 99, 99)).visibleOffset).toBe(200);
  });

  test("requires fast reverse speed and 12px of reverse movement before revealing", () => {
    const hidden = scroll(createHeaderScrollState(200), 220, 220);
    const slowReverse = scroll(hidden, 210, 260);
    const fastReverse = scroll(hidden, 190, 270);

    expect(slowReverse.visibleOffset).toBe(0);
    expect(fastReverse.visibleOffset).toBeGreaterThan(0);
    expect(fastReverse.visibleOffset).toBe(30);
  });

  test("does not switch a partial hide gesture before 12px of reverse movement", () => {
    const partial = scroll(createHeaderScrollState(200), 100, 100);
    const shortReverse = scroll(partial, 95, 140);

    expect(shortReverse.direction).toBe("hide");
    expect(shortReverse.visibleOffset).toBe(100);
    expect(settleHeaderScrollState(shortReverse).visibleOffset).toBe(0);
  });

  test("keeps a slow partial reverse gesture on an endpoint after crossing 12px", () => {
    const partial = scroll(createHeaderScrollState(200), 100, 100);
    const slowReverseStart = scroll(partial, 95, 140);
    const slowReverse = scroll(slowReverseStart, 80, 180);

    expect(slowReverse.direction).toBe("hide");
    expect(slowReverse.visibleOffset).toBe(100);
    expect(settleHeaderScrollState(slowReverse).visibleOffset).toBe(0);
  });

  test("treats 0.3px per millisecond as fast and keeps sub-threshold recovery hidden", () => {
    const hidden = scroll(createHeaderScrollState(200), 220, 220);
    const belowDistance = reduceHeaderScrollState(hidden, { scrollY: 209, timestamp: 260 });
    const exactSpeed = reduceHeaderScrollState(hidden, { scrollY: 208, timestamp: 260 });

    expect(belowDistance.state.visibleOffset).toBe(0);
    expect(exactSpeed.speedPxPerMs).toBeCloseTo(0.3);
    expect(exactSpeed.state.visibleOffset).toBe(12);
  });

  test("settles fast reverse recovery at the 20 percent endpoint", () => {
    const hidden = scroll(createHeaderScrollState(200), 220, 220);
    const recovered = scroll(hidden, 170, 270);

    expect(settleHeaderScrollState(recovered).visibleOffset).toBe(200);
  });

  test("returns a fast reverse recovery below 20 percent to its hidden origin", () => {
    const hidden = scroll(createHeaderScrollState(200), 220, 220);
    const recovered = scroll(hidden, 190, 270);

    expect(settleHeaderScrollState(recovered).visibleOffset).toBe(0);
  });

  test("restores the expanded endpoint at the document origin", () => {
    const hidden = scroll(createHeaderScrollState(200), 220, 220);
    const atOrigin = scroll(hidden, 0, 300);

    expect(atOrigin.visibleOffset).toBe(200);
    expect(atOrigin.direction).toBe("idle");
  });

  test("preserves the current progress when the header is remeasured", () => {
    const partial = scroll(createHeaderScrollState(200), 50, 50);
    const resized = resizeHeaderScrollState(partial, 240);

    expect(resized.visibleOffset).toBe(180);
    expect(resized.headerHeight).toBe(240);
  });
});
