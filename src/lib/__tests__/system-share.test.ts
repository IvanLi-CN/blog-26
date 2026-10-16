import { describe, expect, test } from "bun:test";
import { recognizeMemoClipping } from "../memo-clipping";
import {
  composeSystemShareMemoContent,
  normalizeSystemShare,
  normalizeSystemShareEditor,
  SYSTEM_SHARE_CLIPPING_MARKER,
  stripSystemShareClippingMarker,
  validateSystemShareFiles,
} from "../system-share";

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

  test("keeps the clipping target visible in the single Memo editor field", () => {
    const normalized = normalizeSystemShare({
      text: "来自分享的备注",
      url: "https://example.com/article",
    });
    expect(composeSystemShareMemoContent(normalized)).toBe(
      `https://example.com/article\n\n来自分享的备注\n\n${SYSTEM_SHARE_CLIPPING_MARKER}`
    );
  });

  test("writes a parser marker so the composed body is self-identifying", () => {
    const content = composeSystemShareMemoContent(
      normalizeSystemShare({
        text: "来自分享的备注",
        url: "https://example.com/article",
      })
    );
    const recognition = recognizeMemoClipping(content, {});
    expect(recognition).toMatchObject({
      enabled: true,
      targetUrl: "https://example.com/article",
      remarks: "来自分享的备注",
    });
  });

  test("does not duplicate an existing parser marker", () => {
    const content = composeSystemShareMemoContent(
      normalizeSystemShare({
        text: "已有备注\n\n#剪藏",
        url: "https://example.com/article",
      })
    );
    expect(content.match(/#剪藏/gu)).toHaveLength(1);
  });

  test("recognizes an edited canonical clipping body without a second URL field", () => {
    expect(
      normalizeSystemShareEditor({
        text: "https://example.com/article\n\n编辑后的备注",
      })
    ).toMatchObject({
      classification: "clipping",
      url: "https://example.com/article",
    });
    expect(
      normalizeSystemShareEditor({
        text: "[阅读原文](https://example.com/article)\n\n编辑后的备注",
      })
    ).toMatchObject({
      classification: "clipping",
      url: "https://example.com/article",
    });
  });

  test("removes the generated clipping marker after an edit becomes a memo", () => {
    expect(
      stripSystemShareClippingMarker(
        `https://example.com/article\n\n已改成普通闪念\n\n${SYSTEM_SHARE_CLIPPING_MARKER}`
      )
    ).toBe("https://example.com/article\n\n已改成普通闪念");
    expect(stripSystemShareClippingMarker("普通闪念")).toBe("普通闪念");
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
  expect(
    validateSystemShareFiles(new Array(3).fill({ name: "a", type: "", size: 17 * 1024 * 1024 }))
  ).toMatchObject({ ok: false });
  expect(validateSystemShareFiles([{ name: "a", type: "", size: 1 }])).toEqual({ ok: true });
});
