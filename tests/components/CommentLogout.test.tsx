import { afterEach, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useUserInfo } from "../../src/components/comments/hooks";
import {
  createSessionPresentationStore,
  readConversationPresentation,
  writeConversationPresentation,
} from "../../src/components/common/conversation/presentation-state";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });

const originalFetch = globalThis.fetch;
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const reload = spyOn(window.location, "reload").mockImplementation(() => {
  // Keep the old document mounted so stale writers can be exercised after logout.
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  if (storageDescriptor) Object.defineProperty(globalThis, "sessionStorage", storageDescriptor);
  sessionStorage.clear();
  reload.mockClear();
});

function auth(id: string) {
  return { authenticated: true, principal: { id, displayName: id, isAdmin: false } };
}

test("real logout revokes only its principal before POST settles and rejects retained writers", async () => {
  const principal = "logout-reader";
  const key = `site-knowledge-assistant-ui:${principal}:presentation:conversation`;
  const other = `site-knowledge-assistant-ui:${principal}-other:presentation:conversation`;
  const ui = `site-knowledge-assistant-ui:${principal}`;
  const store = createSessionPresentationStore(key);
  store.write("code:message:0", false);
  writeConversationPresentation(key, "scroll", 120);
  writeConversationPresentation(`${key}-older`, "scroll", 80);
  writeConversationPresentation(other, "scroll", 240);
  sessionStorage.setItem(ui, '{"drafts":{"conversation":"keep draft"}}');
  sessionStorage.setItem("unrelated", "keep");
  let finishLogout!: (response: Response) => void;
  const posts: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/logout")) {
      posts.push(init?.method ?? "GET");
      return new Promise<Response>((resolve) => {
        finishLogout = resolve;
      });
    }
    return Response.json(auth(principal));
  }) as typeof fetch;
  const { result } = renderHook(() => useUserInfo());
  await waitFor(() => expect(result.current.userInfo?.id).toBe(principal));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.logout();
  });
  expect(posts).toEqual(["POST"]);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(sessionStorage.getItem(`${key}-older`)).toBeNull();
  expect(reload).not.toHaveBeenCalled();

  // These are the same shared entry points used by scroll/pagehide and CodeBlock.
  writeConversationPresentation(key, "scroll", 500);
  store.write("code:message:0", true);
  expect(sessionStorage.getItem(key)).toBeNull();
  sessionStorage.setItem(key, '{"scroll":600,"code:message:0":true}');
  expect(readConversationPresentation(key)).toEqual({});
  expect(store.read("code:message:0")).toBeUndefined();
  sessionStorage.removeItem(key);
  await act(async () => {
    finishLogout(Response.json({ authenticated: false }));
    await pending;
  });
  expect(reload).toHaveBeenCalledTimes(1);
  writeConversationPresentation(key, "scroll", 700);
  store.write("code:message:0", false);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(readConversationPresentation(other)).toEqual({ scroll: 240 });
  expect(sessionStorage.getItem(ui)).toBe('{"drafts":{"conversation":"keep draft"}}');
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
});

test("real logout without an assistant survives disabled storage and failed POST without reopening writers", async () => {
  const principal = "logout-disabled-storage";
  const key = `site-knowledge-assistant-ui:${principal}:presentation:conversation`;
  let logoutPosts = 0;
  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith("/logout")) {
      if (init?.method === "POST") logoutPosts++;
      return Response.json({ error: "offline" }, { status: 503 });
    }
    return Response.json(auth(principal));
  }) as typeof fetch;
  const { result } = renderHook(() => useUserInfo());
  await waitFor(() => expect(result.current.userInfo?.id).toBe(principal));
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("disabled");
    },
  });
  await act(async () => {
    await expect(result.current.logout()).rejects.toThrow("offline");
  });
  expect(logoutPosts).toBe(1);
  expect(reload).toHaveBeenCalledTimes(1);
  if (storageDescriptor) Object.defineProperty(globalThis, "sessionStorage", storageDescriptor);
  createSessionPresentationStore(key).write("code:message:0", false);
  writeConversationPresentation(key, "scroll", 120);
  expect(sessionStorage.getItem(key)).toBeNull();
});
