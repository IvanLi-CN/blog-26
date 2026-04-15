import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldLabel,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui";
import { formatDateTime, getErrorMessage, PageHeader } from "~/pages/helpers";

export function PatsPage() {
  const queryClient = useQueryClient();
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const patsQuery = useQuery({
    queryKey: ["admin-pats", includeRevoked],
    queryFn: () => adminApi.listPersonalAccessTokens(includeRevoked),
  });

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen]);

  const createMutation = useMutation({
    mutationFn: () => adminApi.createPersonalAccessToken(label.trim() || undefined),
    onSuccess: (data) => {
      setIssuedToken(data.token);
      setCreateOpen(false);
      setLabel("");
      setNotice("访问令牌已生成。\n请立刻复制并妥善保管。\n它不会再次完整显示。");
      queryClient.invalidateQueries({ queryKey: ["admin-pats"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: adminApi.revokePersonalAccessToken,
    onSuccess: () => {
      setNotice("访问令牌已删除。");
      queryClient.invalidateQueries({ queryKey: ["admin-pats"] });
    },
  });

  async function handleRevoke(tokenId: string) {
    if (!window.confirm("确认删除访问令牌吗？\n此操作不可撤销。")) return;
    await revokeMutation.mutateAsync(tokenId);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="个人访问令牌"
        description="为当前管理员生成和撤销 PAT。"
        actions={
          <>
            <Button variant="outline" onClick={() => setIncludeRevoked((current) => !current)}>
              {includeRevoked ? "隐藏已撤销" : "显示已撤销"}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>新建访问令牌</Button>
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {patsQuery.error ? <Alert tone="danger">{getErrorMessage(patsQuery.error)}</Alert> : null}
      {createMutation.error ? (
        <Alert tone="danger">{getErrorMessage(createMutation.error)}</Alert>
      ) : null}
      {revokeMutation.error ? (
        <Alert tone="danger">{getErrorMessage(revokeMutation.error)}</Alert>
      ) : null}

      {issuedToken ? (
        <Card>
          <CardHeader>
            <CardTitle>访问令牌已生成</CardTitle>
            <CardDescription>只展示这一次，复制后点下面按钮确认。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input readOnly value={issuedToken} />
            <Button onClick={() => setIssuedToken(null)}>我已妥善保存</Button>
          </CardContent>
        </Card>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>创建新的访问令牌</CardTitle>
              <CardDescription>标签只是为了区分用途，不会影响权限。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <FieldLabel>标签（可选）</FieldLabel>
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="例如：CI、脚本、调试"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  取消
                </Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  生成访问令牌
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>当前令牌</CardTitle>
          <CardDescription>默认只显示未撤销令牌。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto admin-scrollbar">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标签</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>最近使用</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(patsQuery.data ?? []).map((row) => (
                <TableRow key={row.token.id}>
                  <TableCell>{row.token.label || "（未命名）"}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.user.name || row.user.email}</div>
                    <div className="text-xs text-muted-foreground">{row.user.email}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(row.token.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(row.token.lastUsedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {row.token.revokedAt ? (
                        <span className="text-xs text-muted-foreground">已撤销</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevoke(row.token.id)}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
