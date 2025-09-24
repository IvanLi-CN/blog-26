"use client";

import { formatDistanceToNow } from "date-fns";
import type { FormEvent } from "react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import { trpc } from "@/lib/trpc";
import { cn, getFormattedDateFromTimestamp } from "@/lib/utils";

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

interface TokenRow {
  id: string;
  label: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

function useModalEscape(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);
}

export function PersonalAccessTokenManager() {
  const utils = trpc.useUtils();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [issuedToken, setIssuedToken] = useState<{ token: string; label?: string | null } | null>(
    null
  );
  const [label, setLabel] = useState("");
  const [tokenPendingDelete, setTokenPendingDelete] = useState<TokenRow | null>(null);
  const labelId = useId();

  const tokensQuery = trpc.admin.personalAccessTokens.list.useQuery(undefined, {
    keepPreviousData: true,
  });

  const tokenRows = useMemo<TokenRow[]>(
    () =>
      (tokensQuery.data ?? []).map((row) => ({
        id: row.token.id,
        label: row.token.label,
        createdAt: row.token.createdAt,
        lastUsedAt: row.token.lastUsedAt,
      })),
    [tokensQuery.data]
  );

  const createMutation = trpc.admin.personalAccessTokens.create.useMutation({
    onSuccess: (data) => {
      setCreateModalOpen(false);
      setIssuedToken({ token: data.token, label: data.record.label });
      setLabel("");
      setFeedback({ type: "success", message: "访问令牌已生成。" });
      utils.admin.personalAccessTokens.list.invalidate();
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "创建访问令牌失败" });
    },
  });

  const revokeMutation = trpc.admin.personalAccessTokens.revoke.useMutation({
    onSuccess: () => {
      setFeedback({ type: "success", message: "访问令牌已删除。" });
      utils.admin.personalAccessTokens.list.invalidate();
      setTokenPendingDelete(null);
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "删除访问令牌失败" });
    },
  });

  const handleOpenCreate = () => {
    setLabel("");
    setCreateModalOpen(true);
    setFeedback(null);
  };

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
  }, []);

  const closeIssuedModal = useCallback(() => {
    setIssuedToken(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setTokenPendingDelete(null);
  }, []);

  const handleCreateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    createMutation.mutate({
      label: label.trim() || undefined,
    });
  };

  const handleConfirmRevoke = () => {
    if (!tokenPendingDelete) {
      return;
    }
    revokeMutation.mutate({ tokenId: tokenPendingDelete.id });
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setFeedback({ type: "success", message: "访问令牌已复制到剪贴板" });
    } catch (error) {
      console.error("Failed to copy token", error);
      setFeedback({ type: "error", message: "复制失败，请手动复制" });
    }
  };

  const renderLastUsed = (timestamp: number | null) => {
    if (!timestamp) {
      return <span className="text-sm text-base-content/50">从未使用</span>;
    }

    const date = new Date(timestamp);
    return (
      <div className="flex flex-col text-sm leading-tight">
        <span className="font-semibold text-base-content">
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
        <span className="text-xs text-base-content/60">
          {getFormattedDateFromTimestamp(timestamp)}
        </span>
      </div>
    );
  };

  const describeLastUsed = (timestamp: number | null) => {
    if (!timestamp) {
      return "从未使用";
    }
    const date = new Date(timestamp);
    const relative = formatDistanceToNow(date, { addSuffix: true });
    return `${getFormattedDateFromTimestamp(timestamp)} · ${relative}`;
  };

  const createModalVisible = createModalOpen;
  const issuedModalVisible = Boolean(issuedToken);
  const deleteModalVisible = Boolean(tokenPendingDelete);

  useModalEscape(createModalVisible, closeCreateModal);
  useModalEscape(issuedModalVisible, closeIssuedModal);
  useModalEscape(deleteModalVisible, closeDeleteModal);

  return (
    <div className="space-y-6">
      <div className="card border border-base-200 bg-base-100 shadow-xl">
        <div className="card-body gap-6 md:flex md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner sm:flex">
              <Icon name="tabler:key" className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h2 className="card-title text-3xl font-semibold">个人访问令牌</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-base-content/70">
                用于为外部系统或脚本授予长期访问权限。令牌生成后仅展示一次，请立即复制并 妥善保管。
              </p>
            </div>
          </div>
          <div className="card-actions justify-start md:justify-end">
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={handleOpenCreate}
              disabled={createMutation.isPending}
            >
              <Icon name="tabler:plus" className="h-5 w-5" />
              新建访问令牌
            </button>
          </div>
        </div>
      </div>

      <div className="card border border-base-200 bg-base-100 shadow-xl">
        <div className="card-body space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="card-title flex items-center gap-2 text-2xl">
                <Icon name="tabler:id-badge2" className="h-6 w-6 text-primary" />
                访问令牌列表
              </h3>
              <p className="text-sm text-base-content/70">
                令牌删除后立即失效，可随时撤销来终止外部访问。
              </p>
            </div>
            {!tokensQuery.isLoading && tokenRows.length > 0 && (
              <span className="badge badge-lg badge-outline font-medium">
                共 {tokenRows.length} 个
              </span>
            )}
          </div>

          {feedback && (
            <div
              className={cn(
                "alert shadow-sm",
                feedback.type === "success" ? "alert-success" : "alert-error"
              )}
            >
              <Icon
                name={feedback.type === "success" ? "tabler:circle-check" : "tabler:alert-triangle"}
                className="h-5 w-5"
              />
              <span>{feedback.message}</span>
            </div>
          )}

          {tokensQuery.isLoading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-base-content/60">
              <span className="loading loading-spinner loading-lg text-primary" />
              <p className="text-sm">正在加载访问令牌...</p>
            </div>
          ) : tokenRows.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-base-300 bg-base-200/50 py-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-base-300/50 text-base-content/60">
                <Icon name="tabler:key-off" className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-semibold text-base-content">尚未创建任何访问令牌</h4>
                <p className="text-sm text-base-content/60">
                  创建访问令牌以允许外部系统安全访问博客 API。
                </p>
              </div>
              {!createMutation.isPending && (
                <button type="button" className="btn btn-primary" onClick={handleOpenCreate}>
                  新建访问令牌
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-base-content/60">
                    <th className="align-middle font-semibold">标签</th>
                    <th className="align-middle font-semibold">创建时间</th>
                    <th className="align-middle font-semibold">最后使用</th>
                    <th className="align-middle text-right font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenRows.map((row) => (
                    <tr key={row.id} className="hover:bg-base-200/60">
                      <td className="align-middle px-4 py-4">
                        {row.label ? (
                          <span className="font-semibold text-base-content">{row.label}</span>
                        ) : (
                          <span className="text-base-content/50">未命名</span>
                        )}
                      </td>
                      <td className="align-middle px-4 py-4 text-sm text-base-content/80">
                        {getFormattedDateFromTimestamp(row.createdAt)}
                      </td>
                      <td className="align-middle px-4 py-4 text-sm text-base-content/80">
                        {renderLastUsed(row.lastUsedAt)}
                      </td>
                      <td className="align-middle px-4 py-4 text-right">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline btn-error gap-1"
                          onClick={() => setTokenPendingDelete(row)}
                          disabled={revokeMutation.isPending}
                        >
                          <Icon name="tabler:trash" className="h-4 w-4" />
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createModalVisible && (
        <div className="modal modal-open">
          <div className="modal-box w-full max-w-lg space-y-4">
            <div>
              <h3 className="font-bold text-lg">创建新的访问令牌</h3>
              <p className="mt-2 text-sm text-base-content/70">
                令牌生成后只会展示一次，请立即复制并妥善保管。
              </p>
            </div>
            <form className="space-y-4" onSubmit={handleCreateSubmit}>
              <label className="form-control w-full" htmlFor={labelId}>
                <div className="label">
                  <span className="label-text">标签（可选）</span>
                  <span className="label-text-alt text-xs text-base-content/50">
                    最多 120 个字符
                  </span>
                </div>
                <input
                  id={labelId}
                  placeholder="例如：CI 部署、外部脚本"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={120}
                  className="input input-bordered w-full"
                />
              </label>
              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeCreateModal}
                  disabled={createMutation.isPending}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-primary gap-2"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <span className="loading loading-spinner loading-xs" />
                  )}
                  生成访问令牌
                </button>
              </div>
            </form>
          </div>
          <button
            type="button"
            className="modal-backdrop"
            aria-label="关闭"
            onClick={closeCreateModal}
          />
        </div>
      )}

      {issuedModalVisible && issuedToken && (
        <div className="modal modal-open">
          <div className="modal-box w-full max-w-lg space-y-5 border border-primary/40">
            <div>
              <h3 className="font-bold text-lg">访问令牌已生成</h3>
              <p className="mt-2 text-sm text-base-content/70">
                请立即复制该令牌并妥善保管，关闭后无法再次查看明文。
              </p>
            </div>
            <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={issuedToken.token}
                  className="input input-bordered w-full font-mono text-sm font-semibold text-primary"
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-primary gap-2"
                  onClick={() => handleCopyToken(issuedToken.token)}
                >
                  <Icon name="tabler:copy" className="h-4 w-4" />
                  复制
                </button>
              </div>
              {issuedToken.label && (
                <p className="mt-3 text-xs text-base-content/60">标签：{issuedToken.label}</p>
              )}
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-primary gap-2" onClick={closeIssuedModal}>
                <Icon name="tabler:shield-check" className="h-4 w-4" />
                我已妥善保存
              </button>
            </div>
          </div>
          <button
            type="button"
            className="modal-backdrop"
            aria-label="关闭"
            onClick={closeIssuedModal}
          />
        </div>
      )}

      {deleteModalVisible && tokenPendingDelete && (
        <div className="modal modal-open">
          <div className="modal-box w-full max-w-md space-y-4 border border-error/40">
            <div>
              <h3 className="font-bold text-lg text-error">确认删除访问令牌</h3>
              <p className="mt-2 text-sm text-base-content/70">
                删除后该令牌将立即失效，相关客户端需重新配置新的令牌。
              </p>
            </div>
            <div className="space-y-3 rounded-xl border border-dashed border-error/40 bg-error/5 p-4 text-sm">
              <div>
                <span className="block text-xs uppercase tracking-wide text-base-content/60">
                  标签
                </span>
                <span className="mt-1 block font-semibold text-base-content">
                  {tokenPendingDelete.label || "未命名"}
                </span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wide text-base-content/60">
                  最近使用
                </span>
                <span className="mt-1 block text-base-content/80">
                  {describeLastUsed(tokenPendingDelete.lastUsedAt)}
                </span>
              </div>
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeDeleteModal}
                disabled={revokeMutation.isPending}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-error gap-2"
                onClick={handleConfirmRevoke}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending && (
                  <span className="loading loading-spinner loading-xs" />
                )}
                确认删除
              </button>
            </div>
          </div>
          <button
            type="button"
            className="modal-backdrop"
            aria-label="关闭"
            onClick={closeDeleteModal}
          />
        </div>
      )}
    </div>
  );
}
