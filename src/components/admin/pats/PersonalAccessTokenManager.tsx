"use client";

import { formatDistanceToNow } from "date-fns";
import type { FormEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn, getFormattedDateFromTimestamp } from "@/lib/utils";

interface FeedbackState {
  type: "success" | "error";
  message: string;
}

type TokenRow = {
  token: {
    id: string;
    userId: string;
    label: string | null;
    createdAt: number;
    updatedAt: number;
    revokedAt: number | null;
    lastUsedAt: number | null;
  };
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: number;
  };
};

export function PersonalAccessTokenManager() {
  const utils = trpc.useUtils();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [issuedToken, setIssuedToken] = useState<{ token: string; label?: string | null } | null>(
    null
  );
  const [label, setLabel] = useState("");
  const labelId = useId();

  const tokensQuery = trpc.admin.personalAccessTokens.list.useQuery(undefined, {
    keepPreviousData: true,
  });

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
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "删除访问令牌失败" });
    },
  });

  const tokenRows: TokenRow[] = tokensQuery.data ?? [];

  const handleOpenCreate = () => {
    setLabel("");
    setCreateModalOpen(true);
    setFeedback(null);
  };

  const handleCreateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    createMutation.mutate({
      label: label.trim() || undefined,
    });
  };

  const handleRevoke = (tokenId: string) => {
    const confirmed = window.confirm("确认删除该访问令牌？此操作不可撤销。");
    if (!confirmed) {
      return;
    }
    revokeMutation.mutate({ tokenId });
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

  const renderLastUsed = (timestamp: number | null): ReactNode => {
    if (!timestamp) {
      return <span className="text-base-content/50">从未使用</span>;
    }
    const date = new Date(timestamp);
    return (
      <div className="flex flex-col gap-1 leading-tight">
        <span className="font-medium text-base-content">
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
        <span className="text-xs text-base-content/50">
          {getFormattedDateFromTimestamp(timestamp)}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner sm:flex">
              <Icon name="tabler:key" className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-semibold tracking-tight">个人访问令牌</CardTitle>
              <CardDescription className="max-w-2xl text-base leading-relaxed">
                用于为外部系统或脚本授予长期访问权限。令牌生成后仅展示一次，请立即复制并妥善保管。
              </CardDescription>
            </div>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2">
            <Icon name="tabler:plus" className="h-4 w-4" />
            新建访问令牌
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Icon name="tabler:id-badge2" className="h-5 w-5 text-primary" />
              访问令牌列表
            </CardTitle>
            <CardDescription>令牌删除后立即失效，可随时撤销来终止外部访问。</CardDescription>
          </div>
          {!tokensQuery.isLoading && tokenRows.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">
              共 {tokenRows.length} 个
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm shadow-sm",
                feedback.type === "success"
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-error/40 bg-error/10 text-error"
              )}
            >
              <Icon
                name={feedback.type === "success" ? "tabler:circle-check" : "tabler:alert-triangle"}
                className="h-4 w-4"
              />
              <span>{feedback.message}</span>
            </div>
          )}

          {tokensQuery.isLoading ? (
            <div className="flex flex-col items-center gap-3 py-14 text-base-content/60">
              <span className="loading loading-spinner loading-md" />
              <p className="text-sm">正在加载访问令牌...</p>
            </div>
          ) : tokenRows.length === 0 ? (
            <EmptyState
              icon="tabler:key-off"
              title="尚未创建任何访问令牌"
              description="创建访问令牌以允许外部系统安全访问博客 API。"
              tone="neutral"
              variant="card"
              action={
                createMutation.isPending
                  ? undefined
                  : {
                      label: "新建访问令牌",
                      onClick: handleOpenCreate,
                    }
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-base-300/60">
              <table className="min-w-full divide-y divide-base-300 text-sm">
                <thead className="bg-base-200/60 text-xs uppercase tracking-wide text-base-content/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">标签</th>
                    <th className="px-4 py-3 text-left font-medium">用户</th>
                    <th className="px-4 py-3 text-left font-medium">创建时间</th>
                    <th className="px-4 py-3 text-left font-medium">最后使用</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200 bg-base-100/50">
                  {tokenRows.map((row) => (
                    <tr key={row.token.id} className="transition-colors hover:bg-base-200/60">
                      <td className="px-4 py-5 align-middle">
                        {row.token.label ? (
                          <span className="font-medium text-base-content">{row.token.label}</span>
                        ) : (
                          <span className="text-base-content/50">未命名</span>
                        )}
                      </td>
                      <td className="px-4 py-5 align-middle">
                        <div className="flex flex-col gap-1 text-sm leading-tight">
                          <span className="font-medium text-base-content">
                            {row.user.name || row.user.email}
                          </span>
                          <span className="text-xs text-base-content/60">{row.user.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-5 align-middle text-sm text-base-content/80">
                        {getFormattedDateFromTimestamp(row.token.createdAt)}
                      </td>
                      <td className="px-4 py-5 align-middle text-sm text-base-content/80">
                        {renderLastUsed(row.token.lastUsedAt)}
                      </td>
                      <td className="px-4 py-5 text-right align-middle">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevoke(row.token.id)}
                          disabled={revokeMutation.isPending}
                          className="gap-1"
                        >
                          <Icon name="tabler:trash" className="h-4 w-4" />
                          删除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg border border-base-300 bg-base-100/95">
          <DialogHeader>
            <DialogTitle>创建新的访问令牌</DialogTitle>
            <p className="text-sm text-base-content/60">
              令牌生成后只会展示一次，请立即复制并妥善保管。
            </p>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateSubmit}>
            <div className="space-y-2">
              <Label htmlFor={labelId}>标签（可选）</Label>
              <Input
                id={labelId}
                placeholder="例如：CI 部署、外部脚本"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={120}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateModalOpen(false)}
                disabled={createMutation.isPending}
              >
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-1">
                {createMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Icon name="tabler:sparkles" className="h-4 w-4" />
                    生成访问令牌
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(issuedToken)} onOpenChange={(open) => !open && setIssuedToken(null)}>
        <DialogContent className="max-w-lg border border-primary/40 bg-base-100/95">
          <DialogHeader>
            <DialogTitle>访问令牌已生成</DialogTitle>
            <p className="text-sm text-base-content/60">
              请立即复制该令牌并妥善保管，关闭后无法再次查看明文。
            </p>
          </DialogHeader>
          {issuedToken && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <code className="break-all font-mono text-sm font-semibold text-primary">
                    {issuedToken.token}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => handleCopyToken(issuedToken.token)}
                  >
                    <Icon name="tabler:copy" className="h-4 w-4" />
                    复制
                  </Button>
                </div>
                {issuedToken.label && (
                  <p className="mt-2 text-xs text-base-content/60">标签：{issuedToken.label}</p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setIssuedToken(null)} className="gap-1">
                  <Icon name="tabler:shield-check" className="h-4 w-4" />
                  我已妥善保存
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
