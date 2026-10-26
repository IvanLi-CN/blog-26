import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MoreHorizontal, Pencil, RefreshCcw, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { type AdminComment, adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuDivider,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FieldLabel,
  Input,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

export function CommentsPage() {
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "approved" | "pending" | "rejected" | "deleted">(
    "all"
  );
  const [targetType, setTargetType] = useState<"all" | "article" | "memo" | "project">("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AdminComment | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [batchAction, setBatchAction] = useState<
    "approve" | "reject" | "pending" | "delete" | "restore" | null
  >(null);

  const commentsQuery = useQuery({
    queryKey: ["admin-comments", page, search, status, targetType],
    queryFn: () =>
      adminApi.listComments({
        page,
        limit: 20,
        search,
        status,
        ...(targetType === "all" ? {} : { targetType }),
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      adminApi.updateComment(id, payload),
    onSuccess: (data) => {
      setNotice(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, expectedRevision }: { id: string; expectedRevision?: number }) =>
      adminApi.deleteComment(id, expectedRevision),
    onSuccess: (data) => {
      setNotice(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const batchMutation = useMutation({
    mutationFn: adminApi.batchUpdateComments,
    onSuccess: (data) => {
      const results = data.results ?? [];
      const success = results.filter((item) => item.result === "success").length;
      const skipped = results.filter((item) => item.result === "skipped").length;
      const failed = results.filter((item) => item.result === "failed").length;
      setNotice(`批量操作已完成：成功 ${success} 条，跳过 ${skipped} 条，失败 ${failed} 条`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSelectedIds([]);
    setSearch(searchDraft.trim());
  }

  const rows = commentsQuery.data?.comments ?? [];

  async function removeComment(id: string) {
    const comment = rows.find((item) => item.id === id);
    await deleteMutation.mutateAsync({ id, expectedRevision: comment?.revision });
  }

  function openEdit(comment: AdminComment) {
    setEditTarget(comment);
    setEditDraft(comment.content);
  }

  async function saveEdit() {
    if (!editTarget || !editDraft.trim()) return;
    await updateMutation.mutateAsync({
      id: editTarget.id,
      payload: { content: editDraft.trim(), expectedRevision: editTarget.revision },
    });
    setEditTarget(null);
    setEditDraft("");
  }

  const allSelected = rows.length > 0 && rows.every((comment) => selectedIds.includes(comment.id));

  function toggleRow(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function applyBatch() {
    if (!batchAction || selectedIds.length === 0) return;
    const expectedRevisions = Object.fromEntries(
      rows
        .filter((comment) => selectedIds.includes(comment.id) && comment.revision)
        .map((comment) => [comment.id, comment.revision as number])
    );
    await batchMutation.mutateAsync({
      ids: selectedIds,
      action: batchAction,
      expectedRevisions,
    });
    setBatchAction(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="评论"
        description="审核、批准、拒绝或删除读者评论。"
        actions={
          <Button
            variant="outline"
            onClick={() => commentsQuery.refetch()}
            disabled={commentsQuery.isFetching}
          >
            {commentsQuery.isFetching ? <Spinner /> : <RefreshCcw className="size-4" />}
            刷新
          </Button>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {commentsQuery.error ? (
        <Alert tone="danger">{getErrorMessage(commentsQuery.error)}</Alert>
      ) : null}
      {updateMutation.error ? (
        <Alert tone="danger">{getErrorMessage(updateMutation.error)}</Alert>
      ) : null}
      {deleteMutation.error ? (
        <Alert tone="danger">{getErrorMessage(deleteMutation.error)}</Alert>
      ) : null}
      {batchMutation.error ? (
        <Alert tone="danger">{getErrorMessage(batchMutation.error)}</Alert>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
          <form className="grid min-w-0 gap-2" onSubmit={submitSearch}>
            <FieldLabel className="mb-0">搜索评论</FieldLabel>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="作者、邮箱、内容关键字"
              />
              <Button type="submit">搜索</Button>
            </div>
          </form>
          <div className="grid min-w-0 gap-2">
            <FieldLabel className="mb-0">状态</FieldLabel>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
                setSelectedIds([]);
              }}
            >
              <option value="all">全部</option>
              <option value="approved">已批准</option>
              <option value="pending">待审</option>
              <option value="rejected">已拒绝</option>
              <option value="deleted">已删除</option>
            </Select>
          </div>
          <div className="grid min-w-0 gap-2">
            <FieldLabel className="mb-0">对象</FieldLabel>
            <Select
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value as typeof targetType);
                setPage(1);
                setSelectedIds([]);
              }}
            >
              <option value="all">全部对象</option>
              <option value="article">文章</option>
              <option value="memo">Memo</option>
              <option value="project">项目</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
            <span className="text-sm text-muted-foreground">已选择 {selectedIds.length} 条</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={!selectedIds.length}
              onClick={() => setBatchAction("approve")}
            >
              批量通过
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedIds.length}
              onClick={() => setBatchAction("reject")}
            >
              批量拒绝
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedIds.length}
              onClick={() => setBatchAction("restore")}
            >
              批量恢复
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => setBatchAction("delete")}
            >
              批量删除
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto admin-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      className="admin-table-checkbox"
                      checked={allSelected}
                      onCheckedChange={(checked) =>
                        setSelectedIds(checked ? rows.map((row) => row.id) : [])
                      }
                      aria-label="选择当前页评论"
                      title="选择当前页评论"
                    />
                  </TableHead>
                  <TableHead>作者</TableHead>
                  <TableHead>内容</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commentsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                        <Spinner /> 正在加载评论…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (commentsQuery.data?.comments.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      没有匹配的评论。
                    </TableCell>
                  </TableRow>
                ) : (
                  commentsQuery.data?.comments.map((comment) => (
                    <TableRow key={comment.id}>
                      <TableCell>
                        <Checkbox
                          className="admin-table-checkbox"
                          checked={selectedIds.includes(comment.id)}
                          onCheckedChange={() => toggleRow(comment.id)}
                          aria-label={`选择评论 ${comment.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            <span>{comment.authorName}</span>
                            {comment.authorRole === "admin" ? (
                              <Badge tone="default">管理员</Badge>
                            ) : null}
                          </div>
                          {comment.authorEmail ? (
                            <div className="text-xs text-muted-foreground">
                              {comment.authorEmail}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">GitHub 读者</div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            /{comment.targetKey || comment.postSlug}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xl whitespace-pre-wrap text-sm text-muted-foreground">
                          {comment.deleted ? "评论已删除（可恢复）" : comment.content}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            comment.deleted
                              ? "danger"
                              : comment.status === "approved"
                                ? "success"
                                : comment.status === "rejected"
                                  ? "danger"
                                  : "warning"
                          }
                        >
                          {comment.deleted ? "deleted" : comment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(comment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <div className="hidden items-center justify-end gap-1 whitespace-nowrap sm:flex">
                            {comment.deleted ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={updateMutation.isPending}
                                onClick={() =>
                                  updateMutation.mutate({
                                    id: comment.id,
                                    payload: {
                                      action: "restore",
                                      expectedRevision: comment.revision,
                                    },
                                  })
                                }
                              >
                                <RotateCcw className="size-4" />
                                {comment.authorRole === "admin" ? "恢复并公开" : "恢复并待审"}
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={updateMutation.isPending}
                                  onClick={() => openEdit(comment)}
                                >
                                  <Pencil className="size-4" />
                                  编辑内容
                                </Button>
                                {comment.status !== "approved" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={updateMutation.isPending}
                                    onClick={() =>
                                      updateMutation.mutate({
                                        id: comment.id,
                                        payload: {
                                          status: "approved",
                                          expectedRevision: comment.revision,
                                        },
                                      })
                                    }
                                  >
                                    <Check className="size-4" />
                                    批准公开
                                  </Button>
                                ) : null}
                                {comment.authorRole !== "admin" && comment.status !== "rejected" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={updateMutation.isPending}
                                    onClick={() =>
                                      updateMutation.mutate({
                                        id: comment.id,
                                        payload: {
                                          status: "rejected",
                                          expectedRevision: comment.revision,
                                        },
                                      })
                                    }
                                  >
                                    <X className="size-4" />
                                    拒绝公开
                                  </Button>
                                ) : null}
                                {comment.authorRole !== "admin" && comment.status !== "pending" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={updateMutation.isPending}
                                    onClick={() =>
                                      updateMutation.mutate({
                                        id: comment.id,
                                        payload: {
                                          status: "pending",
                                          expectedRevision: comment.revision,
                                        },
                                      })
                                    }
                                  >
                                    <RotateCcw className="size-4" />
                                    标记待审
                                  </Button>
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  disabled={deleteMutation.isPending}
                                  onClick={() => setDeleteTarget(comment.id)}
                                >
                                  <Trash2 className="size-4" />
                                  软删除
                                </Button>
                              </>
                            )}
                          </div>
                          <div className="sm:hidden">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`更多评论操作：${comment.authorName}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {comment.deleted ? (
                                  <DropdownMenuItem
                                    disabled={updateMutation.isPending}
                                    onSelect={() =>
                                      updateMutation.mutate({
                                        id: comment.id,
                                        payload: {
                                          action: "restore",
                                          expectedRevision: comment.revision,
                                        },
                                      })
                                    }
                                  >
                                    <RotateCcw className="size-4" />
                                    {comment.authorRole === "admin" ? "恢复并公开" : "恢复并待审"}
                                  </DropdownMenuItem>
                                ) : (
                                  <>
                                    <DropdownMenuItem
                                      disabled={updateMutation.isPending}
                                      onSelect={() => openEdit(comment)}
                                    >
                                      <Pencil className="size-4" />
                                      编辑内容
                                    </DropdownMenuItem>
                                    {comment.status !== "approved" ? (
                                      <DropdownMenuItem
                                        disabled={updateMutation.isPending}
                                        onSelect={() =>
                                          updateMutation.mutate({
                                            id: comment.id,
                                            payload: {
                                              status: "approved",
                                              expectedRevision: comment.revision,
                                            },
                                          })
                                        }
                                      >
                                        <Check className="size-4" />
                                        批准公开
                                      </DropdownMenuItem>
                                    ) : null}
                                    {comment.authorRole !== "admin" &&
                                    comment.status !== "rejected" ? (
                                      <DropdownMenuItem
                                        disabled={updateMutation.isPending}
                                        onSelect={() =>
                                          updateMutation.mutate({
                                            id: comment.id,
                                            payload: {
                                              status: "rejected",
                                              expectedRevision: comment.revision,
                                            },
                                          })
                                        }
                                      >
                                        <X className="size-4" />
                                        拒绝公开
                                      </DropdownMenuItem>
                                    ) : null}
                                    {comment.authorRole !== "admin" &&
                                    comment.status !== "pending" ? (
                                      <DropdownMenuItem
                                        disabled={updateMutation.isPending}
                                        onSelect={() =>
                                          updateMutation.mutate({
                                            id: comment.id,
                                            payload: {
                                              status: "pending",
                                              expectedRevision: comment.revision,
                                            },
                                          })
                                        }
                                      >
                                        <RotateCcw className="size-4" />
                                        标记待审
                                      </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuDivider />
                                    <DropdownMenuItem
                                      className="text-destructive data-[highlighted]:text-destructive"
                                      disabled={deleteMutation.isPending}
                                      onSelect={() => setDeleteTarget(comment.id)}
                                    >
                                      <Trash2 className="size-4" />
                                      软删除
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm text-muted-foreground">
            <span>
              第 {page} / {commentsQuery.data?.pagination.totalPages ?? 1} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => {
                  setSelectedIds([]);
                  setPage((current) => current - 1);
                }}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= (commentsQuery.data?.pagination.totalPages ?? 1)}
                onClick={() => {
                  setSelectedIds([]);
                  setPage((current) => current + 1);
                }}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        destructive
        title="删除评论"
        description="这条评论会被软删除，原文仍可由管理员查看并恢复为待审。"
        confirmLabel="删除评论"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await removeComment(deleteTarget);
        }}
      />
      <ConfirmDialog
        open={batchAction !== null}
        onOpenChange={(open) => {
          if (!open) setBatchAction(null);
        }}
        destructive={batchAction === "delete"}
        title="批量处理评论"
        description={`将对已选择的 ${selectedIds.length} 条评论执行${batchAction === "approve" ? "通过" : batchAction === "reject" ? "拒绝" : batchAction === "restore" ? "恢复" : batchAction === "delete" ? "软删除" : "待审"}操作。`}
        confirmLabel="确认执行"
        onConfirm={applyBatch}
      />
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditDraft("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑评论内容</DialogTitle>
            <DialogDescription>
              管理员可以修正读者评论正文，保存时会校验评论版本，避免覆盖新的审核操作。
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pt-4">
            <Textarea
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              maxLength={1000}
              aria-label="评论正文"
              placeholder="输入评论正文"
            />
            <div className="mt-2 text-right text-xs text-muted-foreground">
              {editDraft.length}/1000
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditTarget(null);
                setEditDraft("");
              }}
            >
              取消
            </Button>
            <Button
              disabled={!editDraft.trim() || updateMutation.isPending}
              onClick={() => void saveEdit()}
            >
              {updateMutation.isPending ? <Spinner /> : null}
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
