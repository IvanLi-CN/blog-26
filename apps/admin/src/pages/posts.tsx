import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
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

export function PostsPage() {
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const postsQuery = useQuery({
    queryKey: ["admin-posts", page, search, status],
    queryFn: () =>
      adminApi.listPosts({
        page,
        limit: 12,
        search,
        status,
        sortBy: "publishDate",
        sortOrder: "desc",
      }),
  });

  const batchMutation = useMutation({
    mutationFn: adminApi.batchUpdatePosts,
    onSuccess: (data) => {
      setNotice(data.message);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const vectorizeMutation = useMutation({
    mutationFn: adminApi.vectorizePostBySlug,
    onSuccess: () => {
      setNotice("已触发文章向量化。");
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
    },
  });

  const rows = postsQuery.data?.posts ?? [];
  const allSelected = rows.length > 0 && rows.every((post) => selectedIds.includes(post.id));
  const totalPages = postsQuery.data?.pagination.totalPages ?? 1;

  const selectedCountText = useMemo(() => `${selectedIds.length} 篇`, [selectedIds.length]);

  function toggleRow(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSelectedIds([]);
    setSearch(searchDraft.trim());
  }

  async function applyBatch(action: "publish" | "unpublish" | "delete") {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(`确认对 ${selectedIds.length} 篇文章执行 ${action} 吗？`);
    if (!confirmed) return;
    await batchMutation.mutateAsync({ ids: selectedIds, action });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="文章"
        description="新的后台文章列表直接消费 admin HTTP contract。"
        actions={
          <>
            <Button asChild>
              <a href="/admin/posts/editor">
                <Plus className="size-4" />
                新建草稿
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => postsQuery.refetch()}
              disabled={postsQuery.isFetching}
            >
              {postsQuery.isFetching ? <Spinner /> : <RefreshCcw className="size-4" />}
              刷新
            </Button>
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {postsQuery.error ? <Alert tone="danger">{getErrorMessage(postsQuery.error)}</Alert> : null}
      {batchMutation.error ? (
        <Alert tone="danger">{getErrorMessage(batchMutation.error)}</Alert>
      ) : null}
      {vectorizeMutation.error ? (
        <Alert tone="danger">{getErrorMessage(vectorizeMutation.error)}</Alert>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px_140px]">
          <form className="grid gap-2" onSubmit={applySearch}>
            <FieldLabel>搜索文章</FieldLabel>
            <div className="flex gap-2">
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="标题、slug、正文关键字"
              />
              <Button type="submit">搜索</Button>
            </div>
          </form>
          <div>
            <FieldLabel>状态</FieldLabel>
            <Select
              value={status}
              onChange={(event) => {
                setSelectedIds([]);
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
            >
              <option value="all">全部</option>
              <option value="published">已发布</option>
              <option value="draft">草稿</option>
            </Select>
          </div>
          <div className="space-y-2">
            <FieldLabel>批量操作</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!selectedIds.length || batchMutation.isPending}
                onClick={() => applyBatch("publish")}
              >
                发布
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedIds.length || batchMutation.isPending}
                onClick={() => applyBatch("unpublish")}
              >
                撤回
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!selectedIds.length || batchMutation.isPending}
                onClick={() => applyBatch("delete")}
              >
                删除
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 text-sm text-muted-foreground">
            <span>当前结果：{postsQuery.data?.pagination.total ?? 0} 篇</span>
            <span>已选中：{selectedCountText}</span>
          </div>
          <div className="overflow-x-auto admin-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelectedIds(allSelected ? [] : rows.map((post) => post.id))
                      }
                    />
                  </TableHead>
                  <TableHead>文章</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                        <Spinner /> 正在加载文章列表…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      没有匹配的文章。
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((post) => {
                    const statusText = post.draft ? "草稿" : post.public ? "公开" : "私有";
                    const statusTone = post.draft ? "warning" : post.public ? "success" : "muted";
                    return (
                      <TableRow key={post.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(post.id)}
                            onChange={() => toggleRow(post.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{post.title || "（无标题）"}</div>
                            <div className="text-xs text-muted-foreground">/{post.slug}</div>
                            <div className="line-clamp-2 text-sm text-muted-foreground">
                              {post.excerpt || post.body.slice(0, 120) || "暂无摘要"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge tone={statusTone} data-testid="post-status-badge">
                              {statusText}
                            </Badge>
                            {post.vectorizationStatus ? (
                              <Badge tone="outline">{post.vectorizationStatus}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {post.source || post.dataSource || "database"}
                          </div>
                          {post.filePath ? (
                            <div className="text-xs text-muted-foreground">{post.filePath}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(post.updateDate || post.publishDate)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button asChild size="sm" variant="outline">
                              <a href={`/admin/posts/editor?slug=${encodeURIComponent(post.slug)}`}>
                                编辑
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={vectorizeMutation.isPending}
                              onClick={() => vectorizeMutation.mutate(post.slug)}
                              title="重新向量化"
                            >
                              <Sparkles className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-4">
            <div className="text-sm text-muted-foreground">
              第 {page} / {totalPages} 页
            </div>
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
                disabled={page >= totalPages}
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
    </div>
  );
}
