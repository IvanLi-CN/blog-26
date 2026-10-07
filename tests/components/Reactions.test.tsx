import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import Reactions from "../../src/components/blog/Reactions";
import {
  cancelWebDemoRequests,
  getWebDemoRuntimeState,
  setWebDemoRuntimeState,
  type WebDemoEnvironment,
} from "../../src/lib/web-demo-runtime";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });

const originalFetch = globalThis.fetch;
const userInfo = {
  id: "demo-admin",
  nickname: "Admin",
  email: "admin@example.test",
  avatarUrl: "",
};

function changeEnvironment(patch: Partial<WebDemoEnvironment>) {
  const state = getWebDemoRuntimeState(window.location, "public");
  act(() =>
    setWebDemoRuntimeState(
      { ...state, environment: { ...state.environment, ...patch } },
      { syncTheme: false }
    )
  );
}

afterEach(() => {
  cleanup();
  cancelWebDemoRequests();
  globalThis.fetch = originalFetch;
  window.history.replaceState({}, "", "/");
  window.sessionStorage.removeItem("web-demo-global-environment");
  delete document.documentElement.dataset.webDemoBuild;
  delete document.documentElement.dataset.webDemoMotion;
  document.body.replaceChildren();
});

describe("Reactions environment recovery", () => {
  test("replaces a canceled delayed read without retaining its error", async () => {
    document.documentElement.dataset.webDemoBuild = "true";
    window.history.replaceState(
      {},
      "",
      "/posts/code-block-fixture/?d_persona=admin&d_connection=online&d_delay=custom&d_delay_ms=2300"
    );
    const { getByRole, queryByText } = render(
      <Reactions targetType="post" targetId="fixture" userInfo={userInfo} />
    );
    expect(getByRole("button", { name: "React with 👍" }).hasAttribute("disabled")).toBe(true);
    changeEnvironment({ delay: "normal" });
    await waitFor(() => {
      expect(getByRole("button", { name: "React with 👍" }).hasAttribute("disabled")).toBe(false);
      expect(queryByText("加载失败")).toBeNull();
    });
  });

  test("recovers an existing component when the connection returns online", async () => {
    document.documentElement.dataset.webDemoBuild = "true";
    window.history.replaceState(
      {},
      "",
      "/posts/code-block-fixture/?d_persona=admin&d_connection=offline&d_delay=normal"
    );
    const { getByText, queryByText, getByRole } = render(
      <Reactions targetType="post" targetId="fixture" userInfo={userInfo} />
    );
    await waitFor(() => expect(getByText("加载失败")).toBeTruthy());
    changeEnvironment({ connection: "online" });
    await waitFor(() => {
      expect(queryByText("加载失败")).toBeNull();
      expect(getByRole("button", { name: "React with 👍" }).hasAttribute("disabled")).toBe(false);
    });
  });

  test("ignores a stale result after the product target changes", async () => {
    const responses: ((response: Response) => void)[] = [];
    globalThis.fetch = () => new Promise<Response>((resolve) => responses.push(resolve));
    const { getByRole, rerender } = render(
      <Reactions targetType="post" targetId="first" userInfo={userInfo} />
    );
    rerender(<Reactions targetType="post" targetId="second" userInfo={userInfo} />);
    expect(responses).toHaveLength(2);
    const response = (count: number) =>
      new Response(JSON.stringify({ reactions: [{ emoji: "👍", count }] }), {
        headers: { "content-type": "application/json" },
      });
    await act(async () => responses[1]?.(response(2)));
    await waitFor(() =>
      expect(getByRole("button", { name: "React with 👍" }).textContent).toContain("2")
    );
    await act(async () => responses[0]?.(response(9)));
    expect(getByRole("button", { name: "React with 👍" }).textContent).toContain("2");
    expect(getByRole("button", { name: "React with 👍" }).textContent).not.toContain("9");
  });
});
