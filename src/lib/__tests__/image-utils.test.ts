import { describe, expect, it } from "bun:test";
import { isImagePath, resolveImagePath, resolveImagePaths } from "../image-utils";

describe("isImagePath", () => {
  it("should identify image file extensions", () => {
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
    expect(isImagePath("icon.SVG")).toBe(true);
  });

  it("should reject non-image files", () => {
    expect(isImagePath("document.pdf")).toBe(false);
    expect(isImagePath("script.js")).toBe(false);
    expect(isImagePath("style.css")).toBe(false);
    expect(isImagePath("data.json")).toBe(false);
    expect(isImagePath("readme.md")).toBe(false);
  });

  it("should handle invalid inputs", () => {
    expect(isImagePath("")).toBe(false);
    expect(isImagePath(null as any)).toBe(false);
    expect(isImagePath(undefined as any)).toBe(false);
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
      const apiUrl = "/api/files/local/assets/image.jpg";
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

  describe("relative paths with file context", () => {
    it("should resolve current directory relative paths for local content", () => {
      // 使用真实的 local 文件路径格式
      expect(resolveImagePath("./assets/image.jpg", "local", "/Hardware/my-post.md")).toBe(
        "/api/files/local/Hardware/assets/image.jpg"
      );

      expect(resolveImagePath("./images/photo.png", "local", "/Memos/my-memo.md")).toBe(
        "/api/files/local/Memos/images/photo.png"
      );

      // 博客示例：local 文章使用 blog/<slug>.md 形式的真实 markdown 路径
      expect(
        resolveImagePath("./assets/svg-test-diagram.svg", "local", "blog/06-svg-image-test.md")
      ).toBe("/api/files/local/blog/assets/svg-test-diagram.svg");
    });

    it("should resolve current directory relative paths for local", () => {
      // 使用真实的本地文件路径格式
      expect(resolveImagePath("./assets/image.jpg", "local", "blog/my-post.md")).toBe(
        "/api/files/local/blog/assets/image.jpg"
      );
      // 博客示例：本地文章使用 blog/<slug>.md 形式的真实 markdown 路径
      expect(
        resolveImagePath("./assets/react-hooks.jpg", "local", "blog/01-react-hooks-deep-dive.md")
      ).toBe("/api/files/local/blog/assets/react-hooks.jpg");
    });

    it("should resolve images from real local content roots without slug-derived paths", () => {
      expect(resolveImagePath("./assets/board.png", "local", "Hardware/power-board.md")).toBe(
        "/api/files/local/Hardware/assets/board.png"
      );
      expect(
        resolveImagePath("assets/dashboard.png", "local", "HomeLab/upgrade-all-in-one-pve-pbs.md")
      ).toBe("/api/files/local/HomeLab/assets/dashboard.png");
      expect(resolveImagePath("./images/memo.png", "local", "Memos/daily-note.md")).toBe(
        "/api/files/local/Memos/images/memo.png"
      );
    });

    it("should resolve parent directory relative paths", () => {
      expect(
        resolveImagePath("../shared/image.jpg", "local", "/Hardware/category/my-post.md")
      ).toBe("/api/files/local/Hardware/shared/image.jpg");

      expect(
        resolveImagePath(
          "../../common/logo.png",
          "local",
          "/Hardware/category/subcategory/my-post.md"
        )
      ).toBe("/api/files/local/Hardware/common/logo.png");
    });

    it("should handle paths without leading indicators", () => {
      expect(resolveImagePath("image.jpg", "local", "/Hardware/my-post.md")).toBe(
        "/api/files/local/Hardware/image.jpg"
      );

      expect(resolveImagePath("assets/image.jpg", "local", "/Memos/my-memo.md")).toBe(
        "/api/files/local/Memos/assets/image.jpg"
      );

      // 博客示例：不以 ./ 开头的相对路径也应与 ./assets/ 语义一致
      expect(
        resolveImagePath("assets/svg-test-diagram.svg", "local", "blog/06-svg-image-test.md")
      ).toBe("/api/files/local/blog/assets/svg-test-diagram.svg");
    });
  });

  describe("absolute paths", () => {
    it("should convert absolute paths to API endpoints", () => {
      expect(resolveImagePath("/assets/image.jpg", "local")).toBe(
        "/api/files/local/assets/image.jpg"
      );

      expect(resolveImagePath("/images/photo.png", "local")).toBe(
        "/api/files/local/images/photo.png"
      );
    });
  });

  describe("content source handling", () => {
    it("should use correct content source in API endpoint", () => {
      expect(resolveImagePath("./assets/image.jpg", "local", "blog/my-post.md")).toBe(
        "/api/files/local/blog/assets/image.jpg"
      );

      expect(resolveImagePath("./assets/image.jpg", "local", "/Hardware/my-post.md")).toBe(
        "/api/files/local/Hardware/assets/image.jpg"
      );
    });

    it("should default to local when content source not specified", () => {
      expect(resolveImagePath("/assets/image.jpg")).toBe("/api/files/local/assets/image.jpg");
    });
  });

  describe("edge cases", () => {
    it("should handle paths with whitespace", () => {
      expect(resolveImagePath("  ./assets/image.jpg  ", "local", "/Hardware/my-post.md")).toBe(
        "/api/files/local/Hardware/assets/image.jpg"
      );
    });

    it("should handle complex nested relative paths", () => {
      expect(
        resolveImagePath(
          "../../assets/shared/image.jpg",
          "local",
          "/Hardware/category/subcategory/my-post.md"
        )
      ).toBe("/api/files/local/Hardware/assets/shared/image.jpg");
    });

    it("should handle paths without file context", () => {
      expect(resolveImagePath("./assets/image.jpg", "local")).toBe(
        "/api/files/local/assets/image.jpg"
      );

      expect(resolveImagePath("../shared/image.jpg", "local")).toBe(
        "/api/files/local/shared/image.jpg"
      );
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

    const result = resolveImagePaths(paths, "local", "/Hardware/my-post.md");

    expect(result).toEqual([
      "/api/files/local/Hardware/assets/image1.jpg",
      "https://example.com/image2.jpg",
      "/api/files/local/assets/image3.png",
    ]);
  });

  it("should return empty array for empty input", () => {
    expect(resolveImagePaths([])).toEqual([]);
  });

  it("should filter out all invalid paths", () => {
    const paths = [undefined, "", "   ", null as any];
    expect(resolveImagePaths(paths)).toEqual([]);
  });

  it("should handle different content sources", () => {
    const paths = ["./assets/image1.jpg", "./assets/image2.jpg"];

    const hardwareResult = resolveImagePaths(paths, "local", "/Hardware/my-post.md");
    const localResult = resolveImagePaths(paths, "local", "blog/my-post.md");

    expect(hardwareResult).toEqual([
      "/api/files/local/Hardware/assets/image1.jpg",
      "/api/files/local/Hardware/assets/image2.jpg",
    ]);

    expect(localResult).toEqual([
      "/api/files/local/blog/assets/image1.jpg",
      "/api/files/local/blog/assets/image2.jpg",
    ]);
  });
});
