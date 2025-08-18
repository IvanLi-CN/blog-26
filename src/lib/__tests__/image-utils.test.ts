import { describe, expect, it } from "bun:test";
import {
  extractArticleDir,
  isImagePath,
  resolveImagePath,
  resolveImagePaths,
} from "../image-utils";

describe("extractArticleDir", () => {
  it("should extract directory from post path", () => {
    expect(extractArticleDir("/posts/react-hooks-deep-dive")).toBe("");
    expect(extractArticleDir("/posts/graphql-api-design")).toBe("");
  });

  it("should extract directory from memo path", () => {
    expect(extractArticleDir("/memos/20250801-zhou1-mo4-hong1-bei4-shi2-guang1")).toBe("memos/");
    expect(extractArticleDir("/memos/20250802-test")).toBe("memos/");
  });

  it("should handle paths without leading slash", () => {
    expect(extractArticleDir("posts/my-post")).toBe("");
    expect(extractArticleDir("memos/my-memo")).toBe("memos/");
  });

  it("should handle empty or invalid paths", () => {
    expect(extractArticleDir("")).toBe("");
    expect(extractArticleDir("/")).toBe("");
    expect(extractArticleDir("//")).toBe("");
  });

  it("should handle single segment paths", () => {
    expect(extractArticleDir("/posts")).toBe("");
    expect(extractArticleDir("posts")).toBe("");
  });

  it("should handle other directory types", () => {
    expect(extractArticleDir("/projects/my-project")).toBe("projects/");
    expect(extractArticleDir("/docs/api-guide")).toBe("docs/");
  });
});

describe("resolveImagePath", () => {
  describe("invalid inputs", () => {
    it("should return null for undefined or empty inputs", () => {
      expect(resolveImagePath(undefined)).toBeNull();
      expect(resolveImagePath("")).toBeNull();
      expect(resolveImagePath("   ")).toBeNull();
      expect(resolveImagePath(null as any)).toBeNull();
    });
  });

  describe("external URLs", () => {
    it("should return external HTTP URLs unchanged", () => {
      const httpUrl = "http://example.com/image.jpg";
      expect(resolveImagePath(httpUrl)).toBe(httpUrl);
    });

    it("should return external HTTPS URLs unchanged", () => {
      const httpsUrl = "https://example.com/image.jpg";
      expect(resolveImagePath(httpsUrl)).toBe(httpsUrl);
    });
  });

  describe("API endpoints", () => {
    it("should return existing API file endpoints unchanged", () => {
      const apiUrl = "/api/files/webdav/assets/image.jpg";
      expect(resolveImagePath(apiUrl)).toBe(apiUrl);
    });
  });

  describe("data URLs", () => {
    it("should return data URLs unchanged", () => {
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
      expect(resolveImagePath(dataUrl)).toBe(dataUrl);
    });
  });

  describe("relative paths", () => {
    it("should resolve current directory relative paths", () => {
      expect(resolveImagePath("./assets/image.jpg", "/posts/my-post")).toBe(
        "/api/files/webdav/assets/image.jpg"
      );

      expect(resolveImagePath("./images/photo.png", "/memos/my-memo")).toBe(
        "/api/files/webdav/memos/images/photo.png"
      );
    });

    it("should resolve parent directory relative paths", () => {
      expect(resolveImagePath("../shared/image.jpg", "/memos/category/my-memo")).toBe(
        "/api/files/webdav/shared/image.jpg"
      );

      expect(
        resolveImagePath("../../common/logo.png", "/projects/category/subcategory/my-project")
      ).toBe("/api/files/webdav/common/logo.png");
    });

    it("should handle relative paths without context", () => {
      expect(resolveImagePath("./assets/image.jpg")).toBe("/api/files/webdav/assets/image.jpg");

      expect(resolveImagePath("../shared/image.jpg")).toBe("/api/files/webdav/shared/image.jpg");
    });
  });

  describe("absolute paths", () => {
    it("should convert absolute paths to API endpoints", () => {
      expect(resolveImagePath("/assets/image.jpg")).toBe("/api/files/webdav/assets/image.jpg");

      expect(resolveImagePath("/images/photo.png")).toBe("/api/files/webdav/images/photo.png");
    });
  });

  describe("other paths", () => {
    it("should handle paths without leading indicators", () => {
      expect(resolveImagePath("image.jpg", "/posts/my-post")).toBe("/api/files/webdav/image.jpg");

      expect(resolveImagePath("assets/image.jpg", "/memos/my-memo")).toBe(
        "/api/files/webdav/memos/assets/image.jpg"
      );
    });

    it("should handle paths without context", () => {
      expect(resolveImagePath("image.jpg")).toBe("/api/files/webdav/image.jpg");
    });
  });

  describe("edge cases", () => {
    it("should handle paths with whitespace", () => {
      expect(resolveImagePath("  ./assets/image.jpg  ", "/posts/my-post")).toBe(
        "/api/files/webdav/assets/image.jpg"
      );
    });

    it("should handle complex nested relative paths", () => {
      expect(
        resolveImagePath(
          "../../assets/shared/image.jpg",
          "/projects/category/subcategory/my-project"
        )
      ).toBe("/api/files/webdav/assets/shared/image.jpg");
    });
  });
});

describe("resolveImagePaths", () => {
  it("should process array of image paths", () => {
    const paths = [
      "./assets/image1.jpg",
      "https://example.com/image2.jpg",
      undefined,
      "/assets/image3.png",
      "",
    ];

    const result = resolveImagePaths(paths, "/posts/my-post");

    expect(result).toEqual([
      "/api/files/webdav/assets/image1.jpg",
      "https://example.com/image2.jpg",
      "/api/files/webdav/assets/image3.png",
    ]);
  });

  it("should return empty array for empty input", () => {
    expect(resolveImagePaths([])).toEqual([]);
  });

  it("should filter out all invalid paths", () => {
    const paths = [undefined, "", "   ", null as any];
    expect(resolveImagePaths(paths)).toEqual([]);
  });
});

describe("isImagePath", () => {
  it("should identify common image extensions", () => {
    expect(isImagePath("image.jpg")).toBe(true);
    expect(isImagePath("photo.jpeg")).toBe(true);
    expect(isImagePath("icon.png")).toBe(true);
    expect(isImagePath("animation.gif")).toBe(true);
    expect(isImagePath("modern.webp")).toBe(true);
    expect(isImagePath("vector.svg")).toBe(true);
    expect(isImagePath("bitmap.bmp")).toBe(true);
    expect(isImagePath("favicon.ico")).toBe(true);
  });

  it("should handle case insensitive extensions", () => {
    expect(isImagePath("IMAGE.JPG")).toBe(true);
    expect(isImagePath("Photo.PNG")).toBe(true);
    expect(isImagePath("file.WEBP")).toBe(true);
  });

  it("should reject non-image files", () => {
    expect(isImagePath("document.pdf")).toBe(false);
    expect(isImagePath("script.js")).toBe(false);
    expect(isImagePath("style.css")).toBe(false);
    expect(isImagePath("data.json")).toBe(false);
    expect(isImagePath("readme.txt")).toBe(false);
  });

  it("should handle invalid inputs", () => {
    expect(isImagePath("")).toBe(false);
    expect(isImagePath(null as any)).toBe(false);
    expect(isImagePath(undefined as any)).toBe(false);
    expect(isImagePath("   ")).toBe(false);
  });

  it("should handle paths with directories", () => {
    expect(isImagePath("/assets/images/photo.jpg")).toBe(true);
    expect(isImagePath("./images/icon.png")).toBe(true);
    expect(isImagePath("../shared/logo.svg")).toBe(true);
  });
});
