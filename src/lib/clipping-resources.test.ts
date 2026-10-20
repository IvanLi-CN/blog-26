import { expect, test } from "bun:test";
import {
  buildClippingResourceBaseUrl,
  clippingResourceFilename,
  mapClippingResourceUrl,
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
