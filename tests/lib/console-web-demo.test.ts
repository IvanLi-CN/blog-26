import { describe, expect, test } from "bun:test";
import {
  CONSOLE_WEB_DEMO_SLUGS,
  createConsoleWebDemoStore,
  getConsoleWebDemoClippingArticle,
} from "../../src/lib/console-web-demo";

describe("Console Web Demo persona projections", () => {
  test("guest list and detail omit authoring-only fields", () => {
    const store = createConsoleWebDemoStore();
    const guestList = store.list("guest").memos;
    const guestMemo = store.get(CONSOLE_WEB_DEMO_SLUGS.public, "guest");

    expect(guestList).toHaveLength(2);
    expect(guestList.map((memo) => memo.slug)).toEqual([
      CONSOLE_WEB_DEMO_SLUGS.clipping,
      CONSOLE_WEB_DEMO_SLUGS.public,
    ]);
    expect(guestMemo).not.toBeNull();
    if (!guestMemo) throw new Error("guest fixture missing");
    for (const value of [guestMemo, ...guestList]) {
      expect("authoredContent" in value).toBe(false);
      expect("authoredTitle" in value).toBe(false);
      expect("source" in value).toBe(false);
      expect("draft" in value).toBe(false);
      expect("dataSource" in value).toBe(false);
      expect("filePath" in value).toBe(false);
      expect("media" in value).toBe(false);
    }
  });

  test("guest detail keeps private and draft records indistinguishable from missing", () => {
    const store = createConsoleWebDemoStore();

    expect(store.get(CONSOLE_WEB_DEMO_SLUGS.private, "guest")).toBeNull();
    expect(store.get(CONSOLE_WEB_DEMO_SLUGS.draft, "guest")).toBeNull();
  });

  test("guest clipping detail keeps source and translation without discussion access", () => {
    const article = getConsoleWebDemoClippingArticle(CONSOLE_WEB_DEMO_SLUGS.clipping, "guest");

    expect(article?.source).toContain("Durable article workflows");
    expect(article?.translation).toContain("持久文章工作流");
    expect(article?.canDiscuss).toBe(false);
  });
});
