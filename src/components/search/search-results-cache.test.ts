import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { countSearchResultsByType, groupSearchResults } from "./search-model";
import {
  getSearchResultsCacheKey,
  readCachedSearchResults,
  writeCachedSearchResults,
} from "./search-results-cache";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
afterEach(() => window.sessionStorage.clear());
const items = [
  { slug: "same", type: "post" as const, title: "Same" },
  { slug: "same", type: "post" as const, title: "Duplicate" },
  { slug: "same", type: "memo" as const, title: null },
];

describe("content-level result cache", () => {
  test("groups before counting and retains independent types and untitled memos", () => {
    const result = groupSearchResults(items);
    expect(result).toHaveLength(2);
    expect(countSearchResultsByType(result)).toMatchObject({ all: 2, post: 1, memo: 1 });
    expect(result[1].title).toBeNull();
  });
  test("old flat caches are ignored and bound editions never share results", () => {
    window.sessionStorage.setItem(
      "blog25:public-search:v4:one:release:50",
      JSON.stringify({ expiresAt: Date.now() + 10000, results: items })
    );
    expect(readCachedSearchResults("release", "one")).toBeNull();
    writeCachedSearchResults("release", groupSearchResults(items), "one");
    expect(readCachedSearchResults("release", "two")).toBeNull();
    expect(readCachedSearchResults(" RELEASE ", "one")).toHaveLength(2);
  });
  test("malformed and expired v5 entries are removed rather than rendered", () => {
    const key = getSearchResultsCacheKey("release", "one");
    for (const entry of [
      { expiresAt: Date.now() + 10000, results: items },
      { expiresAt: 0, results: groupSearchResults(items) },
      { results: groupSearchResults(items) },
      {
        expiresAt: Date.now() + 10000,
        results: [{ ...groupSearchResults(items)[0], sections: [null] }],
      },
    ]) {
      window.sessionStorage.setItem(key, JSON.stringify(entry));
      expect(readCachedSearchResults("release", "one")).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
  });
  test("duplicate groups in a current cache cannot inflate restored counts", () => {
    const group = groupSearchResults(items)[0];
    writeCachedSearchResults("release", [group, group], "one");
    expect(readCachedSearchResults("release", "one")).toHaveLength(1);
  });
});
