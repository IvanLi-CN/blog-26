import { describe, expect, it } from "bun:test";
import { detectContentAnomalies } from "../content-anomalies";

describe("detectContentAnomalies", () => {
  it("should return no anomalies for empty content", () => {
    const res = detectContentAnomalies("");
    expect(res.hasInlineDataImages).toBe(false);
    expect(res.inlineImageCount).toBe(0);
    expect(res.largeInlineImageCount).toBe(0);
  });

  it("should detect a small inline base64 image", () => {
    const md = "![icon](data:image/png;base64,iVBORw0KGgo=)";
    const res = detectContentAnomalies(md);
    expect(res.hasInlineDataImages).toBe(true);
    expect(res.inlineImageCount).toBe(1);
    expect(res.largeInlineImageCount).toBe(0);
  });

  it("should detect large inline base64 image by length heuristic", () => {
    const payload = "A".repeat(80 * 1024); // ~80KB base64 text
    const md = `![big](data:image/jpeg;base64,${payload})`;
    const res = detectContentAnomalies(md);
    expect(res.hasInlineDataImages).toBe(true);
    expect(res.inlineImageCount).toBe(1);
    expect(res.largeInlineImageCount).toBe(1);
    expect(res.details.join(" ")).toContain("≥50KB");
  });
});
