import { afterEach, expect, test } from "bun:test";
import { clearSearchCache, getCachedSearchResults, getSearchCacheSize } from "./search-cache";

afterEach(() => {
  clearSearchCache();
});

test("search cache reuses results for equivalent queries until cleared", async () => {
  let loadCount = 0;
  const load = async () => {
    loadCount++;
    return [{ slug: "arch-linux", title: "Arch Linux" }];
  };

  const first = await getCachedSearchResults("enhanced", { q: "  Arch   Linux ", topK: 20 }, load);
  const second = await getCachedSearchResults("enhanced", { q: "arch linux", topK: 20 }, load);

  expect(first).toEqual(second);
  expect(loadCount).toBe(1);
  expect(getSearchCacheSize()).toBe(1);

  clearSearchCache();
  await getCachedSearchResults("enhanced", { q: "arch linux", topK: 20 }, load);

  expect(loadCount).toBe(2);
});

test("search cache keeps distinct search modes separate", async () => {
  let loadCount = 0;
  const load = async () => {
    loadCount++;
    return [{ slug: `result-${loadCount}` }];
  };

  const semantic = await getCachedSearchResults("semantic", { q: "Arch", topK: 20 }, load);
  const enhanced = await getCachedSearchResults("enhanced", { q: "Arch", topK: 20 }, load);

  expect(semantic).not.toEqual(enhanced);
  expect(loadCount).toBe(2);
  expect(getSearchCacheSize()).toBe(2);
});
