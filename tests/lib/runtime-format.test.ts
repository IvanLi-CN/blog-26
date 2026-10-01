import { describe, expect, test } from "bun:test";
import { formatRuntimeValue, getRuntimeValueCandidates } from "../../site/lib/runtime-format";

describe("formatRuntimeValue", () => {
  test("uses compact units for large runtime values", () => {
    expect(formatRuntimeValue(793_758)).toBe("793.758K");
    expect(formatRuntimeValue(2_110_898_841)).toBe("2.111B");
    expect(formatRuntimeValue(1_587)).toBe("1.587K");
    expect(formatRuntimeValue(21_000)).toBe("21K");
  });

  test("keeps small values readable and limits decimals", () => {
    expect(formatRuntimeValue(501)).toBe("501");
    expect(formatRuntimeValue(7.5139)).toBe("7.514");
    expect(formatRuntimeValue(0)).toBe("0");
  });

  test("offers shorter precision and promoted units for narrow stats", () => {
    const candidates = getRuntimeValueCandidates(793_758);

    expect(candidates.slice(0, 4)).toEqual(["793.758K", "793.76K", "793.8K", "794K"]);
    expect(getRuntimeValueCandidates(999_999.9)).toContain("1M");
    expect(formatRuntimeValue(999_999.9)).toBe("1M");
  });
});
