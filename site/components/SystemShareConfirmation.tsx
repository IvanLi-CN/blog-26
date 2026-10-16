"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MilkdownEditor, type MilkdownEditorRef } from "@/components/memos/MilkdownEditor";
import {
  composeSystemShareMemoContent,
  normalizeSystemShare,
  normalizeSystemShareEditor,
  SYSTEM_SHARE_TTL_MS,
  type SystemShareFile,
  validateSystemShareFiles,
} from "@/lib/system-share";
import { webDemoFetch } from "@/lib/web-demo-fetch";
import { toPublicApiUrl } from "../lib/runtime-urls";
import {
  clearPendingSystemShare,
  type PendingSystemShare,
  readPendingSystemShare,
  replacePendingSystemShare,
  updatePendingSystemShare,
} from "../lib/system-share-store";
import {
  showSystemShareError,
  showSystemShareProgress,
  showSystemShareSuccess,
} from "./SystemShareToast";

type AuthUser = { isAdmin?: boolean } | null;

class SystemShareHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SystemShareHttpError";
  }
}

type PublishResponse = {
  ok: true;
  duplicate: boolean;
  memoId: string;
  memo: { id: string; slug: string; title: string | null; isPublic: boolean };
  classification: "clipping" | "memo";
};

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await webDemoFetch(url, { credentials: "include", ...init }, "admin");
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `请求失败（${response.status}）`;
    throw new SystemShareHttpError(message, response.status);
  }
  return payload as T;
}

function demoPending(search: string): PendingSystemShare | null {
  const mode = new URLSearchParams(search).get("d_share");
  if (!mode) return null;
  const now = Date.now();
  const submissionIds: Record<string, string> = {
    mixed: "00000000-0000-4000-8000-000000000001",
    error: "00000000-0000-4000-8000-000000000002",
    url: "00000000-0000-4000-8000-000000000003",
    file: "00000000-0000-4000-8000-000000000004",
    text: "00000000-0000-4000-8000-000000000005",
  };
  const pending: PendingSystemShare = {
    version: 2,
    submissionId: submissionIds[mode] ?? submissionIds.text,
    createdAt: now,
    expiresAt: now + SYSTEM_SHARE_TTL_MS,
    title: mode === "file" ? "会议记录附件" : "从系统分享来的灵感",
    text:
      mode === "url" || mode === "mixed"
        ? "https://example.com/reading-note\n\n分享时附带的剪藏备注。"
        : "把这段文字整理成一条可以继续编辑的闪念。",
    url: mode === "url" || mode === "mixed" ? "https://example.com/reading-note" : "",
    tags: [],
    isPublic: false,
    files: [],
  };
  if (mode === "file" || mode === "mixed") {
    pending.files = [
      {
        name: "分享附件.txt",
        type: "text/plain",
        size: 32,
        lastModified: now,
        blob: new Blob(["这是 Web Demo 的受控附件。"], { type: "text/plain" }),
      },
    ];
  }
  return pending;
}

function fileMetadata(file: File): SystemShareFile & { blob: Blob } {
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
    blob: file,
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function rawShareValue(value: string) {
  return value.trim() || "（空）";
}

function projectPendingForEditor(value: PendingSystemShare): PendingSystemShare {
  const normalized = normalizeSystemShare(value);
  return {
    ...value,
    // The editor receives one canonical Memo field. A clipping keeps its target
    // as the first line so the authored content remains self-identifying.
    text: composeSystemShareMemoContent(normalized),
    isPublic: normalized.isPublic,
  };
}

export default function SystemShareConfirmation() {
  const [pending, setPending] = useState<PendingSystemShare | null>(null);
  const [originalPending, setOriginalPending] = useState<PendingSystemShare | null>(null);
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successLocked, setSuccessLocked] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const redirectTimer = useRef<number | null>(null);
  const submitRef = useRef<() => Promise<void>>(async () => undefined);
  const memoEditorRef = useRef<MilkdownEditorRef>(null);
  const initializedSubmissionId = useRef<string | null>(null);

  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (new URLSearchParams(window.location.search).get("error") === "storage") {
        setError("浏览器无法保存这次分享，请检查存储权限后重新发起系统分享。");
      }
      let nextPending = await readPendingSystemShare();
      if (!nextPending && document.documentElement.dataset.webDemoBuild === "true") {
        const seeded = demoPending(window.location.search);
        if (seeded) {
          await replacePendingSystemShare(seeded);
          nextPending = { ...seeded, original: seeded };
        }
      }
      if (nextPending && !nextPending.original) {
        await replacePendingSystemShare({ ...nextPending, original: nextPending });
        nextPending = { ...nextPending, original: nextPending };
      }
      const rawPending = nextPending?.original
        ? { ...nextPending, ...nextPending.original, original: nextPending.original }
        : nextPending;
      if (nextPending) nextPending = projectPendingForEditor(nextPending);
      let nextUser: AuthUser = null;
      try {
        nextUser = await readJson<AuthUser>(toPublicApiUrl("/api/public/auth/me"));
      } catch (nextError) {
        if (
          !(nextError instanceof SystemShareHttpError) ||
          ![401, 403].includes(nextError.status)
        ) {
          throw nextError;
        }
      }
      if (!active) return;
      setOriginalPending(rawPending);
      // Seed the editor state in the same render as the pending share. Milkdown
      // initializes asynchronously and must not mount once with an empty value.
      setText(nextPending?.text ?? "");
      setIsPublic(nextPending?.isPublic ?? false);
      setPending(nextPending);
      setUser(nextUser);
    };
    load()
      .catch((nextError) => {
        if (active)
          setError(nextError instanceof Error ? nextError.message : "无法读取待处理分享。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!pending) {
      initializedSubmissionId.current = null;
      return;
    }
    if (initializedSubmissionId.current === pending.submissionId) return;
    initializedSubmissionId.current = pending.submissionId;
    setText(pending.text);
    setIsPublic(pending.isPublic);
  }, [pending]);

  function persistPatch(patch: Parameters<typeof updatePendingSystemShare>[1]) {
    if (!pending) return;
    setPending((current) => (current ? { ...current, ...patch, version: 2 } : current));
    void updatePendingSystemShare(pending.submissionId, patch).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "无法保存当前编辑。请重试。");
    });
  }

  function setMemoContent(value: string) {
    setText(value);
    setError(null);
    persistPatch({ text: value });
  }

  async function cancel() {
    if (pending) await clearPendingSystemShare(pending.submissionId);
    setOriginalPending(null);
    setPending(null);
    window.location.replace("/memos");
  }

  async function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).map(fileMetadata);
    event.target.value = "";
    if (!selected.length || !pending) return;
    const nextFiles = [...pending.files, ...selected];
    const validation = validateSystemShareFiles(nextFiles);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    persistPatch({ files: nextFiles });
    setError(null);
  }

  function removeFile(index: number) {
    if (!pending) return;
    persistPatch({ files: pending.files.filter((_, fileIndex) => fileIndex !== index) });
  }

  async function submitCurrent() {
    if (!pending || !user?.isAdmin || successLocked || submitLock.current) return;
    const validation = validateSystemShareFiles(pending.files);
    if (!validation.ok) {
      setError(validation.error);
      showSystemShareError(validation.error, () => void submitRef.current());
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    showSystemShareProgress();
    try {
      const editorContent = memoEditorRef.current?.getMarkdown() ?? text;
      const editorNormalized = normalizeSystemShareEditor({
        title: pending.title,
        text: editorContent,
        url: "",
        tags: pending.tags,
        isPublic,
        files: pending.files,
      });
      const form = new FormData();
      form.set("submissionId", pending.submissionId);
      form.set("title", pending.title);
      form.set("text", editorContent);
      form.set("url", editorNormalized.url ?? "");
      form.set("tags", JSON.stringify(pending.tags));
      form.set("isPublic", String(isPublic));
      for (const file of pending.files) {
        form.append(
          "files",
          new File([file.blob], file.name, { type: file.type, lastModified: file.lastModified })
        );
      }
      const result = await readJson<PublishResponse>(toPublicApiUrl("/api/public/system-share"), {
        method: "POST",
        body: form,
      });
      setSuccessLocked(true);
      showSystemShareSuccess(result.duplicate ? "已恢复此前发布的内容" : "发布成功");
      void clearPendingSystemShare(pending.submissionId).catch((cleanupError) => {
        console.warn("[system-share] failed to clear the local pending share", cleanupError);
      });
      redirectTimer.current = window.setTimeout(() => {
        window.location.replace(`/memos/${encodeURIComponent(result.memo.slug)}`);
      }, 1000);
    } catch (nextError) {
      if (nextError instanceof SystemShareHttpError && [401, 403].includes(nextError.status)) {
        showSystemShareError(
          "登录状态已失效，请进入控制台登录后继续。",
          () => {
            window.location.replace("/admin/");
          },
          "登录"
        );
        return;
      }
      const message = nextError instanceof Error ? nextError.message : "发布失败，请重试。";
      setError(message);
      showSystemShareError(message, () => void submitRef.current());
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  submitRef.current = submitCurrent;

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
        <p role="alert">{error}</p>
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
        <span className="nature-kicker">System Share</span>
        <h1 className="nature-title mt-3 text-3xl">登录后继续发布</h1>
        <p className="nature-muted mt-3">分享内容已保存在当前浏览器，登录控制台后可以继续确认。</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a className="nature-button nature-button-primary inline-flex" href="/admin/">
            打开控制台
          </a>
          <button
            className="nature-button nature-button-outline"
            type="button"
            onClick={() => void cancel()}
          >
            取消分享
          </button>
        </div>
      </main>
    );
  }

  const rawShare = originalPending ?? pending;

  return (
    <main
      className="nature-container max-w-4xl px-4 py-6 sm:px-6 sm:py-10"
      data-testid="system-share-page"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <span className="nature-kicker">System Share</span>
          <h1 className="nature-title mt-2 text-3xl sm:text-4xl">确认发布 Memo</h1>
        </div>
      </header>

      <details
        className="nature-panel system-share-original mb-3 overflow-hidden"
        data-testid="system-share-original"
        open={originalOpen}
        onToggle={(event) => setOriginalOpen(event.currentTarget.open)}
      >
        <summary
          className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden"
          data-testid="system-share-original-toggle"
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-semibold">原始分享数据</strong>
              <span className="nature-chip nature-chip-warning text-xs">只读</span>
            </span>
            <span className="nature-muted mt-1 block text-xs">接收快照</span>
          </span>
          <span className="nature-muted shrink-0 text-xs">
            {originalOpen ? "收起" : "展开查看"}
          </span>
        </summary>
        <div className="border-t border-[color:var(--nature-line)] px-4 py-4 sm:px-5 sm:py-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--nature-text-soft)]">
                标题
              </dt>
              <dd className="mt-1 break-words text-sm">{rawShareValue(rawShare.title)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--nature-text-soft)]">
                网址
              </dt>
              <dd className="mt-1 break-all text-sm">{rawShareValue(rawShare.url)}</dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--nature-text-soft)]">
                正文 / 备注
              </dt>
              <dd className="nature-surface-inset mt-1 max-h-40 overflow-auto px-3 py-2">
                <pre className="m-0 whitespace-pre-wrap break-words font-[inherit] text-sm leading-6">
                  {rawShareValue(rawShare.text)}
                </pre>
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--nature-text-soft)]">
                文件
              </dt>
              <dd className="mt-1 text-sm">
                {rawShare.files.length ? (
                  <ul className="space-y-2">
                    {rawShare.files.map((file) => (
                      <li
                        className="flex min-w-0 items-start gap-2"
                        key={`${file.name}-${file.size}-${file.lastModified ?? 0}`}
                      >
                        <Paperclip className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {file.name}
                          <span className="nature-muted ml-2">{formatFileSize(file.size)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="nature-muted">无文件</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </details>

      <form
        className="nature-panel overflow-hidden"
        onSubmit={(event) => {
          event.preventDefault();
          void submitCurrent();
        }}
        data-testid="system-share-memo-editor"
        aria-labelledby="system-share-memo-editor-title"
      >
        <div className="quick-memo-edit-header">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="system-share-memo-editor-title" className="quick-memo-edit-title">
                编辑 Memo
              </h2>
            </div>
          </div>
        </div>

        <div
          className="quick-memo-edit-body grid gap-7 overflow-visible p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_18rem]"
          data-testid="system-share-memo-editor-body"
        >
          <div className="min-w-0">
            <section data-testid="system-share-memo-editor-content">
              <span className="block text-sm font-medium">Memo 内容</span>
              <div
                className="quick-memo-edit-container mt-2"
                data-testid="system-share-memo-editor-surface"
              >
                <MilkdownEditor
                  ref={memoEditorRef}
                  content={text}
                  onChange={setMemoContent}
                  placeholder="写下这条 Memo…"
                  articlePath={`system-share/${pending.submissionId}.md`}
                  contentSource="local"
                  editorId="system-share-memo-editor"
                  className="quick-memo-edit-editor system-share-memo-editor"
                />
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 px-1 text-xs text-[color:var(--nature-text-soft)]">
                <span>{text.length} 字符</span>
                <span>支持 Markdown</span>
              </div>
            </section>
          </div>

          <aside className="space-y-6 border-t border-[color:var(--nature-line)] pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <section>
              <span className="block text-sm font-medium">附件</span>
              <ul className="mt-2 space-y-2" data-testid="system-share-files">
                {pending.files.length ? (
                  pending.files.map((file, index) => (
                    <li
                      className="flex items-start gap-2 text-sm"
                      key={`${file.name}-${file.size}-${file.lastModified ?? 0}`}
                    >
                      <Paperclip className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 break-words">
                        {file.name}
                        <span className="nature-muted ml-2">{formatFileSize(file.size)}</span>
                      </span>
                      <button
                        className="nature-icon-button"
                        type="button"
                        aria-label={`移除 ${file.name}`}
                        onClick={() => removeFile(index)}
                        disabled={submitting || successLocked}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="nature-muted text-sm">无附件</li>
                )}
              </ul>
              <label className="nature-button nature-button-outline mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2">
                <Paperclip aria-hidden="true" />
                添加附件
                <input
                  className="sr-only"
                  type="file"
                  multiple
                  onChange={(event) => void addFiles(event)}
                  disabled={submitting || successLocked}
                />
              </label>
            </section>
          </aside>
        </div>

        <footer className="quick-memo-edit-footer system-share-memo-footer">
          <div className="system-share-memo-footer-row">
            <label className="quick-memo-edit-visibility">
              <span className="quick-memo-edit-switch-hitbox">
                <input
                  className="nature-switch-input peer quick-memo-edit-switch-input"
                  type="checkbox"
                  checked={isPublic}
                  onChange={(event) => {
                    const nextValue = event.target.checked;
                    setIsPublic(nextValue);
                    persistPatch({ isPublic: nextValue });
                  }}
                  disabled={submitting || successLocked}
                  aria-label="公开发布"
                />
                <span
                  className="nature-switch pointer-events-none"
                  data-state={isPublic ? "checked" : "unchecked"}
                  aria-disabled={submitting || successLocked ? "true" : "false"}
                />
              </span>
              <span className="quick-memo-edit-visibility-label">
                {isPublic ? "公开发布" : "私有保存"}
              </span>
            </label>
            <div className="quick-memo-edit-actions">
              <button
                className="nature-button nature-button-ghost quick-memo-edit-action"
                type="button"
                onClick={() => void cancel()}
                disabled={submitting || successLocked}
              >
                取消
              </button>
              <button
                className="nature-button nature-button-primary quick-memo-edit-action"
                type="submit"
                disabled={submitting || successLocked}
                data-testid="system-share-submit"
              >
                {submitting ? "发布中…" : successLocked ? "已发布" : "确认发布"}
              </button>
            </div>
          </div>
          <div className="nature-muted system-share-memo-footer-note mt-2 text-xs">
            默认私有；公开后才会进入公开时间线。
          </div>
        </footer>
      </form>
    </main>
  );
}
