import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
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
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

export function CommentsPage() {
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  const commentsQuery = useQuery({
    queryKey: ["admin-comments", page, search, status],
    queryFn: () =>
      adminApi.listComments({
        page,
        limit: 20,
        search,
        status,
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
    mutationFn: adminApi.deleteComment,
    onSuccess: (data) => {
      setNotice(data.message);
      queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  async function removeComment(id: string) {
    if (!window.confirm("确认删除这条评论吗？")) return;
    await deleteMutation.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="评论"
        description="在新后台里审核、批准和删除评论，不再依赖旧 Daisy 页面。"
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

      <Card>
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <form className="grid gap-2" onSubmit={submitSearch}>
            <FieldLabel>搜索评论</FieldLabel>
            <div className="flex gap-2">
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="作者、邮箱、内容关键字"
              />
              <Button type="submit">搜索</Button>
            </div>
          </form>
          <div>
            <FieldLabel>状态</FieldLabel>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
            >
              <option value="all">全部</option>
              <option value="approved">已批准</option>
              <option value="pending">待审</option>
              <option value="rejected">已拒绝</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto admin-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell colSpan={5}>
                      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                        <Spinner /> 正在加载评论…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (commentsQuery.data?.comments.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      没有匹配的评论。
                    </TableCell>
                  </TableRow>
                ) : (
                  commentsQuery.data?.comments.map((comment) => (
                    <TableRow key={comment.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{comment.authorName}</div>
                          <div className="text-xs text-muted-foreground">{comment.authorEmail}</div>
                          <div className="text-xs text-muted-foreground">/{comment.postSlug}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xl whitespace-pre-wrap text-sm text-muted-foreground">
                          {comment.content}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            comment.status === "approved"
                              ? "success"
                              : comment.status === "rejected"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {comment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(comment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={updateMutation.isPending}
                            onClick={() =>
                              updateMutation.mutate({
                                id: comment.id,
                                payload: { status: "approved" },
                              })
                            }
                          >
                            批准
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateMutation.isPending}
                            onClick={() =>
                              updateMutation.mutate({
                                id: comment.id,
                                payload: { status: "rejected" },
                              })
                            }
                          >
                            拒绝
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => removeComment(comment.id)}
                          >
                            删除
                          </Button>
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
                onClick={() => setPage((current) => current - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= (commentsQuery.data?.pagination.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
