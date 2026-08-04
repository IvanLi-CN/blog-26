import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  clearSearchCache,
  getCachedSearchExecution,
  getCachedSearchResults,
  getSearchCacheSize,
} from "./search-cache";

beforeEach(() => {
  clearSearchCache();
});

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

test("does not cache FTS fallback executions", async () => {
  let loadCount = 0;
  const load = async () => {
    loadCount++;
    return {
      results: [{ slug: `fallback-${loadCount}` }],
      source: "fts" as const,
      cacheable: false,
    };
  };

  const first = await getCachedSearchExecution("semantic", { q: "搜索" }, load);
  const second = await getCachedSearchExecution("semantic", { q: "搜索" }, load);

  expect(first.results).toEqual([{ slug: "fallback-1" }]);
  expect(second.results).toEqual([{ slug: "fallback-2" }]);
  expect(first.source).toBe("fts");
  expect(second.source).toBe("fts");
  expect(getSearchCacheSize()).toBe(0);
});

test("separates cached results when the provider fingerprint changes", async () => {
  let loadCount = 0;
  const load = async () => {
    loadCount++;
    return [{ slug: `provider-${loadCount}` }];
  };

  const first = await getCachedSearchResults(
    "semantic",
    { q: "SQLite", providerFingerprint: "provider-a" },
    load
  );
  const second = await getCachedSearchResults(
    "semantic",
    { q: "SQLite", providerFingerprint: "provider-b" },
    load
  );

  expect(first).toEqual([{ slug: "provider-1" }]);
  expect(second).toEqual([{ slug: "provider-2" }]);
  expect(loadCount).toBe(2);
});
