import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useComments, useUserInfo } from "../../src/components/comments/hooks";
import { useAuth } from "../../src/hooks/useAuth";
import {
  cancelWebDemoRequests,
  getWebDemoRuntimeState,
  setWebDemoRuntimeState,
  type WebDemoPersona,
} from "../../src/lib/web-demo-runtime";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });

function IdentityProbe() {
  const auth = useAuth();
  const commentsUser = useUserInfo();
  const comments = useComments({ postSlug: "code-block-fixture" });
  return (
    <>
      <output data-testid="auth">{auth.isLoading ? "loading" : (auth.user?.id ?? "guest")}</output>
      <output data-testid="comments-user">
        {commentsUser.isLoading ? "loading" : (commentsUser.userInfo?.id ?? "guest")}
      </output>
      <output data-testid="permission">{String(comments.isAdmin)}</output>
      <output data-testid="error">{auth.error?.message ?? "none"}</output>
    </>
  );
}

function changePersona(persona: WebDemoPersona) {
  const state = getWebDemoRuntimeState(window.location, "public");
  act(() =>
    setWebDemoRuntimeState(
      { ...state, environment: { ...state.environment, persona, delay: "normal" } },
      { syncTheme: false }
    )
  );
}

afterEach(() => {
  cleanup();
  cancelWebDemoRequests();
  window.history.replaceState({}, "", "/");
  window.sessionStorage.removeItem("web-demo-global-environment");
  delete document.documentElement.dataset.webDemoBuild;
  document.body.replaceChildren();
});

describe("Web Demo public identity", () => {
  test("updates existing auth and comment permissions without remounting", async () => {
    document.documentElement.dataset.webDemoBuild = "true";
    window.history.replaceState(
      {},
      "",
      "/posts/code-block-fixture/?d_persona=guest&d_connection=online&d_delay=normal"
    );
    const { getByTestId } = render(<IdentityProbe />);
    await waitFor(() => expect(getByTestId("auth").textContent).toBe("guest"));
    changePersona("admin");
    await waitFor(() => {
      expect(getByTestId("auth").textContent).toBe("demo-admin");
      expect(getByTestId("comments-user").textContent).toBe("demo-admin");
      expect(getByTestId("permission").textContent).toBe("true");
    });
    changePersona("user");
    await waitFor(() => {
      expect(getByTestId("auth").textContent).toBe("demo-user");
      expect(getByTestId("comments-user").textContent).toBe("demo-user");
      expect(getByTestId("permission").textContent).toBe("false");
    });
  });

  test("ignores canceled identity reads after a fast environment change", async () => {
    document.documentElement.dataset.webDemoBuild = "true";
    window.history.replaceState(
      {},
      "",
      "/posts/code-block-fixture/?d_persona=guest&d_connection=online&d_delay=custom&d_delay_ms=2300"
    );
    const { getByTestId } = render(<IdentityProbe />);
    changePersona("admin");
    await waitFor(() => {
      expect(getByTestId("auth").textContent).toBe("demo-admin");
      expect(getByTestId("comments-user").textContent).toBe("demo-admin");
      expect(getByTestId("error").textContent).toBe("none");
    });
  });
});
