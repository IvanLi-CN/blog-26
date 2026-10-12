import { describe, expect, test } from "bun:test";
import { normalizeSystemShare, validateSystemShareFiles } from "../system-share";

describe("system share normalization", () => {
  test("classifies a dedicated URL as clipping and removes duplicate text", () => {
    expect(
      normalizeSystemShare({
        title: "A page",
        text: "https://example.com/",
        url: "https://example.com",
      })
    ).toMatchObject({
      classification: "clipping",
      url: "https://example.com/",
      remarks: "",
      title: "A page",
      isPublic: false,
    });
  });

  test("uses an exact URL-only text value when the dedicated URL is absent", () => {
    expect(normalizeSystemShare({ text: "  https://example.com/a  " })).toMatchObject({
      classification: "clipping",
      url: "https://example.com/a",
      remarks: "",
    });
  });

  test("removes a URL-only text value after URL normalization", () => {
    expect(
      normalizeSystemShare({ text: "https://example.com", url: "https://example.com/" })
    ).toMatchObject({
      classification: "clipping",
      url: "https://example.com/",
      remarks: "",
    });
  });

  test("keeps mixed text as an ordinary memo", () => {
    expect(normalizeSystemShare({ text: "Read this https://example.com later" })).toMatchObject({
      classification: "memo",
      url: null,
      remarks: "Read this https://example.com later",
    });
  });

  test("preserves files and defaults visibility to private", () => {
    expect(
      normalizeSystemShare({
        text: "note",
        files: [{ name: "a.bin", type: "application/octet-stream", size: 3 }],
      })
    ).toMatchObject({ classification: "memo", isPublic: false, files: [{ name: "a.bin" }] });
  });
});

test("system share file limits are enforced", () => {
  expect(
    validateSystemShareFiles(new Array(11).fill({ name: "a", type: "", size: 1 }))
  ).toMatchObject({
    ok: false,
  });
  expect(validateSystemShareFiles([{ name: "a", type: "", size: 21 * 1024 * 1024 }])).toMatchObject(
    {
      ok: false,
    }
  );
  expect(validateSystemShareFiles([{ name: "a", type: "", size: 1 }])).toEqual({ ok: true });
});
