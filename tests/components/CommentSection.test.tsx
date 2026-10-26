import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import CommentAvatar, { DEFAULT_COMMENT_AVATAR } from "../../src/components/comments/CommentAvatar";
import CommentForm from "../../src/components/comments/CommentForm";
import CommentSection from "../../src/components/comments/CommentSection";
import {
  cancelWebDemoRequests,
  getWebDemoRuntimeState,
  setWebDemoRuntimeState,
} from "../../src/lib/web-demo-runtime";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });

const target = { type: "article" as const, key: "demo-article" };
const originalFetch = globalThis.fetch;

function installDemo(search: string) {
  document.documentElement.dataset.webDemoBuild = "true";
  window.history.replaceState({}, "", `/posts/demo-article/${search}`);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  cancelWebDemoRequests();
  window.history.replaceState({}, "", "/");
  window.sessionStorage.clear();
  delete document.documentElement.dataset.webDemoBuild;
  document.body.replaceChildren();
});

describe("CommentSection states", () => {
  test("exposes loading while the explicit target is being resolved", async () => {
    installDemo("?d_delay=slow&d_connection=online");
    const { findByTestId } = render(<CommentSection postSlug={target.key} target={target} />);

    expect(await findByTestId("comments-loading")).toBeTruthy();
  });

  test("renders a valid empty target as a flat comment state", async () => {
    installDemo("?d_data=empty&d_connection=online");
    const { findByTestId, getByRole, queryByText } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByTestId("comments-empty")).toBeTruthy();
    expect(getByRole("heading", { name: "评论" })).toBeTruthy();
    expect(queryByText("Conversation")).toBeNull();
    expect(document.querySelector(".comment-empty.nature-empty")).toBeNull();
  });

  test("renders target unavailable without login or empty-comment content", async () => {
    installDemo("?d_scene=comments-target-unavailable&d_connection=online");
    const { findByTestId, queryByLabelText, queryByText, queryByRole } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByTestId("comment-target-unavailable")).toBeTruthy();
    expect(queryByText("评论目标不存在")).toBeTruthy();
    expect(queryByText("暂无评论")).toBeNull();
    expect(queryByLabelText("评论内容")).toBeNull();
    expect(queryByRole("button", { name: "提交审核" })).toBeNull();
  });

  test("keeps a generic 404 as a retryable request error", async () => {
    delete document.documentElement.dataset.webDemoBuild;
    window.history.replaceState({}, "", "/posts/demo-article/");
    let commentAttempts = 0;
    globalThis.fetch = async (input) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!requestUrl.includes("/api/public/comments")) {
        return new Response(JSON.stringify({ reader: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      commentAttempts += 1;
      return commentAttempts === 1
        ? new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          })
        : new Response(JSON.stringify({ comments: [], totalPages: 1, isAdmin: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    };
    const { findByTestId, queryByTestId, getByTestId } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByTestId("comment-load-error")).toBeTruthy();
    expect(queryByTestId("comment-target-unavailable")).toBeNull();
    fireEvent.click(getByTestId("comment-retry"));
    expect(await findByTestId("comments-empty")).toBeTruthy();
    expect(commentAttempts).toBe(2);
  });

  test("renders a retryable network error and recovers in place", async () => {
    installDemo("?d_connection=offline");
    const { findByTestId, findByText, getByTestId } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByTestId("comment-load-error")).toBeTruthy();
    window.history.replaceState({}, "", "/posts/demo-article/?d_connection=online");
    fireEvent.click(getByTestId("comment-retry"));
    expect(await findByText("这篇内容的边界整理得很清楚。")).toBeTruthy();
  });

  test("keeps loaded comments and the composer when a refresh fails", async () => {
    installDemo("?d_connection=online");
    const { findByText, findByTestId } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByText("这篇内容的边界整理得很清楚。")).toBeTruthy();
    const state = getWebDemoRuntimeState(window.location, "public");
    act(() => {
      setWebDemoRuntimeState(
        { ...state, environment: { ...state.environment, connection: "offline" } },
        { syncTheme: false }
      );
    });

    expect(await findByTestId("comment-retry")).toBeTruthy();
    expect(document.body.textContent).toContain("这篇内容的边界整理得很清楚。");
    expect(document.querySelector('[aria-label="评论内容"]')).toBeTruthy();
  });

  test("keeps the current reader identity when a refresh fails", async () => {
    installDemo("?d_persona=user&d_connection=online");
    const { findByRole, findByTestId } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByRole("heading", { name: "Demo User", level: 3 })).toBeTruthy();
    const state = getWebDemoRuntimeState(window.location, "public");
    act(() => {
      setWebDemoRuntimeState(
        { ...state, environment: { ...state.environment, connection: "offline" } },
        { syncTheme: false }
      );
    });

    expect(await findByTestId("comment-retry")).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector(".comment-form h3")?.textContent).toBe("Demo User")
    );
  });

  test("removes loaded comments and composer context after a target becomes unavailable", async () => {
    installDemo("?d_persona=admin&d_connection=online");
    const { findByText, findByTestId, queryByLabelText, queryByText } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByText("这篇内容的边界整理得很清楚。")).toBeTruthy();
    const state = getWebDemoRuntimeState(window.location, "public");
    act(() => {
      setWebDemoRuntimeState(
        {
          ...state,
          sceneState: { ...state.sceneState, scene: "comments-target-unavailable" },
          environment: { ...state.environment, connection: "offline" },
        },
        { syncTheme: false }
      );
    });
    act(() => {
      setWebDemoRuntimeState(
        {
          ...getWebDemoRuntimeState(window.location, "public"),
          environment: { ...state.environment, connection: "online" },
        },
        { syncTheme: false }
      );
    });

    expect(await findByTestId("comment-target-unavailable")).toBeTruthy();
    expect(queryByText("这篇内容的边界整理得很清楚。")).toBeNull();
    expect(queryByLabelText("评论内容")).toBeNull();
  });

  test("does not retain admin comments when a persona refresh fails", async () => {
    installDemo("?d_persona=admin&d_connection=online");
    const { findByText, findByTestId, queryByText, queryByRole } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByText("这条评论用于演示待审核状态。")).toBeTruthy();
    const state = getWebDemoRuntimeState(window.location, "public");
    act(() => {
      setWebDemoRuntimeState(
        {
          ...state,
          environment: { ...state.environment, persona: "guest", connection: "offline" },
        },
        { syncTheme: false }
      );
    });

    expect(await findByTestId("comment-load-error")).toBeTruthy();
    expect(queryByText("这条评论用于演示待审核状态。")).toBeNull();
    expect(queryByRole("button", { name: "提交审核" })).toBeNull();
  });

  test("clears loaded context before a scene or data refresh fails", async () => {
    installDemo("?d_connection=online");
    const { findByText, findByTestId, queryByText } = render(
      <CommentSection postSlug={target.key} target={target} />
    );

    expect(await findByText("这篇内容的边界整理得很清楚。")).toBeTruthy();
    const state = getWebDemoRuntimeState(window.location, "public");
    act(() => {
      setWebDemoRuntimeState(
        {
          ...state,
          sceneState: { ...state.sceneState, data: "empty" },
          environment: { ...state.environment, connection: "offline" },
        },
        { syncTheme: false }
      );
    });

    expect(await findByTestId("comment-load-error")).toBeTruthy();
    expect(queryByText("这篇内容的边界整理得很清楚。")).toBeNull();
  });
});

test("uses the local avatar fallback for empty and failed URLs", async () => {
  const { getAllByRole } = render(
    <>
      <CommentAvatar avatarUrl="" alt="empty" width={28} height={28} />
      <CommentAvatar
        avatarUrl="/site-assets/missing-avatar.svg"
        alt="broken"
        width={28}
        height={28}
      />
    </>
  );
  const images = getAllByRole("img") as HTMLImageElement[];
  expect(images[0]?.src).toContain(DEFAULT_COMMENT_AVATAR);
  expect(images[1]?.src).toContain("missing-avatar.svg");

  fireEvent.error(images[1]);
  await waitFor(() => expect(images[1]?.src).toContain(DEFAULT_COMMENT_AVATAR));
});

test("does not write a previous target draft into a new target", async () => {
  installDemo("?d_connection=online");
  const firstTarget = { type: "article" as const, key: "first-target" };
  const secondTarget = { type: "article" as const, key: "second-target" };
  const postComment = async () => ({ ok: true, json: async () => ({}) });
  const props = {
    postSlug: firstTarget.key,
    target: firstTarget,
    onCommentPosted: () => undefined,
    userInfo: null,
    postComment,
    isPosting: false,
    error: null,
    onLogout: () => undefined,
    onLoginSuccess: async () => undefined,
  };
  window.sessionStorage.setItem("reader-comment-draft:article:first-target:root", "已保存草稿");
  const { getByLabelText, rerender } = render(<CommentForm {...props} />);
  const firstTextarea = getByLabelText("评论内容") as HTMLTextAreaElement;
  await waitFor(() => expect(firstTextarea.value).toBe("已保存草稿"));

  rerender(<CommentForm {...props} target={secondTarget} postSlug={secondTarget.key} />);
  await waitFor(() => expect((getByLabelText("评论内容") as HTMLTextAreaElement).value).toBe(""));
  expect(window.sessionStorage.getItem("reader-comment-draft:article:second-target:root")).toBe(
    null
  );
});
