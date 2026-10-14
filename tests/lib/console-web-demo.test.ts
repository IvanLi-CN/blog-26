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

  test("admin-to-public updates retain a published timestamp for the guest projection", () => {
    const store = createConsoleWebDemoStore({ storageKey: "console-web-demo-published-at-test" });
    const updated = store.update(CONSOLE_WEB_DEMO_SLUGS.private, {
      content: "# Now public\n\nThe current Console content is visible.",
      isPublic: true,
    });

    expect(updated?.publishedAt).toBeString();
    expect(store.get(CONSOLE_WEB_DEMO_SLUGS.private, "guest")?.publishedAt).toBe(
      updated?.publishedAt
    );
  });

  test("server-side store reconstruction applies the ephemeral mutation cookie", () => {
    const mutation = encodeURIComponent(
      JSON.stringify({
        sequence: 0,
        deleted: [],
        created: [],
        updated: [
          {
            s: CONSOLE_WEB_DEMO_SLUGS.public,
            c: "# Refreshed weekly notes\n\nSSR reads the current demo state.",
            p: true,
            t: ["公开", "刷新"],
            u: "2026-10-14T12:00:00.000Z",
            v: "2026-10-14T12:00:00.000Z",
          },
        ],
      })
    );
    const store = createConsoleWebDemoStore({
      cookieHeader: `console_web_demo_mutations_v1=${mutation}`,
    });

    expect(store.get(CONSOLE_WEB_DEMO_SLUGS.public, "guest")).toMatchObject({
      content: "# Refreshed weekly notes\n\nSSR reads the current demo state.",
      publishedAt: "2026-10-14T12:00:00.000Z",
    });
  });

  test("guest clipping detail keeps source and translation without discussion access", () => {
    const article = getConsoleWebDemoClippingArticle(CONSOLE_WEB_DEMO_SLUGS.clipping, "guest");

    expect(article?.source).toContain("Durable article workflows");
    expect(article?.translation).toContain("持久文章工作流");
    expect(article?.canDiscuss).toBe(false);
  });
});
