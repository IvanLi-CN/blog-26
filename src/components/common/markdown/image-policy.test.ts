import { describe, expect, mock, test } from "bun:test";
import { imageResourceCases } from "../../../../tests/fixtures/assistant-markdown";
import { classifyConversationImage } from "./image-policy";

describe("conversation image policy", () => {
  test("only a trusted exact-source binding authorizes a facade", () => {
    for (const fixture of imageResourceCases) {
      const result = classifyConversationImage(fixture.input.src, fixture.input.resourceContext);
      expect(result.kind).toBe(fixture.expectedResolution ? "authorized" : "unavailable");
      if (result.kind === "authorized") expect(fixture.expectedResolution).toBe(result.src);
    }
    for (const src of [
      "/api/public/assets/post/a/x/content.png",
      "/api/files/local/a.png",
      "a.png",
    ]) {
      expect(classifyConversationImage(src).kind).toBe("unavailable");
    }
    const src = "https://images.example.invalid/a.png?variant=1#image";
    expect(classifyConversationImage(src)).toEqual({
      kind: "external",
      src,
      domain: "images.example.invalid",
    });
  });

  test("rejects dangerous sources before invoking the resolver", () => {
    const resolveAuthorizedImage = mock(() => ({ src: "/safe.png" }));
    for (const src of [
      "",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\nscript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "blob:https://images.example.invalid/id",
      "file:///tmp/a.png",
      "http://images.example.invalid/a.png",
      "//images.example.invalid/a.png",
      "https://user:secret@images.example.invalid/a.png",
      "https://@images.example.invalid/a.png",
      "https:////images.example.invalid/a.png",
      "https:\\images.example.invalid/a.png",
      " https://images.example.invalid/a.png",
      "https:///",
      "#image",
      "?image=a",
    ]) {
      expect(classifyConversationImage(src, { resolveAuthorizedImage }).kind).toBe("unavailable");
    }
    expect(resolveAuthorizedImage).not.toHaveBeenCalled();
  });

  test("validates the resolver output and contains resolver exceptions", () => {
    for (const src of [
      "javascript:alert(1)",
      "//evil.invalid/a",
      "./unresolved.png",
      "https://u:p@evil.invalid/a",
    ]) {
      expect(
        classifyConversationImage("./a.png", { resolveAuthorizedImage: () => ({ src }) }).kind
      ).toBe("unavailable");
    }
    expect(
      classifyConversationImage("./a.png", {
        resolveAuthorizedImage: () => {
          throw new Error("denied");
        },
      })
    ).toEqual({ kind: "unavailable", reason: "resolver-failed" });
  });
});
