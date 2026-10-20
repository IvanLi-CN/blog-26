import { expect, test } from "bun:test";
import {
  buildClippingResourceBaseUrl,
  clippingResourceFilename,
  mapClippingResourceUrl,
  stripUncapturedClippingMedia,
} from "./clipping-resources";

const filename = `${"a".repeat(64)}.webp`;

test("maps version-relative clipping resources without touching ordinary links", () => {
  const base = buildClippingResourceBaseUrl("hello world", "version-1");
  expect(mapClippingResourceUrl(`./assets/${filename}`, base)).toBe(
    `/api/public/memos/hello%20world/clipping/assets/version-1/${filename}`
  );
  expect(mapClippingResourceUrl(`assets/${filename}?v=1`, base)).toContain(`/${filename}?v=1`);
  expect(mapClippingResourceUrl("https://article.example/image.webp", base)).toBe(
    "https://article.example/image.webp"
  );
  expect(clippingResourceFilename(filename)).toBe(filename);
  expect(clippingResourceFilename("../image.webp")).toBeNull();
});

test("removes uncaptured media from legacy public clipping prose", () => {
  expect(
    stripUncapturedClippingMedia(
      '![Hero](https://cdn.example/hero.webp) <img src="https://cdn.example/hero.webp"> <video src="./assets/' +
        filename +
        '">\n  <source src="https://cdn.example/video.mp4">\n</video>'
    )
  ).toBe("Hero 资源抓取失败：媒体 资源抓取失败：视频");
});
