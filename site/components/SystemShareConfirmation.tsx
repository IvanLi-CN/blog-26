"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeSystemShare } from "@/lib/system-share";
import { toPublicApiUrl } from "../lib/runtime-urls";
import {
  clearPendingSystemShare,
  type PendingSystemShare,
  readPendingSystemShare,
} from "../lib/system-share-store";

type AuthUser = { isAdmin?: boolean } | null;

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `请求失败（${response.status}）`;
    throw new Error(message);
  }
  return payload as T;
}

function splitTags(value: string) {
  return value
    .split(/[\s,，]+/u)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function SystemShareConfirmation() {
  const [pending, setPending] = useState<PendingSystemShare | null>(null);
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    let active = true;
    if (new URLSearchParams(window.location.search).get("error") === "storage") {
      setError("浏览器无法保存这次分享，请检查存储权限后重新发起系统分享。");
    }
    Promise.all([
      readPendingSystemShare(),
      readJson<AuthUser>(toPublicApiUrl("/api/public/auth/me")),
    ])
      .then(([nextPending, nextUser]) => {
        if (!active) return;
        setPending(nextPending);
        setUser(nextUser);
        setTitle(nextPending?.title ?? "");
        setText(nextPending?.text ?? "");
        setUrl(nextPending?.url ?? "");
      })
      .catch((nextError) => {
        if (active)
          setError(nextError instanceof Error ? nextError.message : "无法读取待处理分享。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const normalized = useMemo(
    () =>
      normalizeSystemShare({
        title,
        text,
        url,
        tags: splitTags(tags),
        isPublic,
        files: pending?.files ?? [],
      }),
    [isPublic, pending?.files, tags, text, title, url]
  );

  async function cancel() {
    await clearPendingSystemShare();
    setPending(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending || !user?.isAdmin) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("submissionId", pending.submissionId);
      form.set("title", title);
      form.set("text", text);
      form.set("url", url);
      form.set("tags", JSON.stringify(splitTags(tags)));
      form.set("isPublic", String(isPublic));
      for (const file of pending.files) {
        form.append(
          "files",
          new File([file.blob], file.name, { type: file.type, lastModified: file.lastModified })
        );
      }
      await readJson(toPublicApiUrl("/api/public/system-share"), { method: "POST", body: form });
      try {
        await clearPendingSystemShare();
      } catch (cleanupError) {
        // The server commit is authoritative; a local cleanup failure must not hide success.
        console.warn("[system-share] failed to clear the local pending share", cleanupError);
      }
      window.location.replace("/memos");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "发布失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="nature-container px-4 py-12" data-testid="system-share-loading">
        正在读取待处理分享…
      </main>
    );
  }

  if (error && !pending) {
    return (
      <main className="nature-container px-4 py-12" data-testid="system-share-error">
        {error}
      </main>
    );
  }

  if (!pending) {
    return (
      <main className="nature-container px-4 py-12" data-testid="system-share-empty">
        <h1 className="nature-title text-3xl">没有待处理分享</h1>
        <p className="nature-muted mt-3">分享内容不存在，或已经过期。</p>
      </main>
    );
  }

  if (!user?.isAdmin) {
    return (
      <main
        className="nature-container max-w-2xl px-4 py-12"
        data-testid="system-share-auth-required"
      >
        <h1 className="nature-title text-3xl">登录后继续发布</h1>
        <p className="nature-muted mt-3">分享内容已保存在当前浏览器，登录控制台后可以继续确认。</p>
        <a className="nature-button mt-6 inline-flex" href="/admin/">
          打开控制台
        </a>
        <button
          className="nature-button nature-button-outline mt-3 ml-3"
          type="button"
          onClick={() => void cancel()}
        >
          取消分享
        </button>
      </main>
    );
  }

  return (
    <main
      className="nature-container max-w-3xl px-4 py-8 sm:px-6 sm:py-12"
      data-testid="system-share-page"
    >
      <div className="mb-8">
        <span className="nature-kicker">System Share</span>
        <h1 className="nature-title mt-3 text-3xl sm:text-4xl">确认发布闪念</h1>
        <p className="nature-muted mt-3">
          确认后会创建一条新的 Memo，当前分类为「
          {normalized.classification === "clipping" ? "剪藏" : "普通闪念"}」。
        </p>
      </div>

      <form className="nature-panel space-y-5 p-5 sm:p-7" onSubmit={submit}>
        <label className="block">
          <span className="block text-sm font-medium">标题</span>
          <input
            className="nature-input mt-2 w-full"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium">网址</span>
          <input
            className="nature-input mt-2 w-full"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium">正文 / 备注</span>
          <textarea
            className="nature-input mt-2 min-h-40 w-full"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium">标签</span>
          <input
            className="nature-input mt-2 w-full"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="用空格或逗号分隔"
          />
        </label>
        <div>
          <span className="block text-sm font-medium">附件</span>
          <ul className="nature-muted mt-2 space-y-1 text-sm">
            {pending.files.length ? (
              pending.files.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  {file.name}（{Math.ceil(file.size / 1024)} KiB）
                </li>
              ))
            ) : (
              <li>无附件</li>
            )}
          </ul>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
          />
          发布到公开时间线
        </label>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <button className="nature-button" type="submit" disabled={submitting}>
            {submitting ? "发布中…" : "确认发布"}
          </button>
          <button
            className="nature-button nature-button-outline"
            type="button"
            onClick={() => void cancel()}
            disabled={submitting}
          >
            取消
          </button>
        </div>
      </form>
    </main>
  );
}
