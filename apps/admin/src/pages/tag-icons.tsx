import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldLabel,
  Input,
} from "~/components/ui";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

export function TagIconsPage() {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ["admin-tag-icons-overview"],
    queryFn: adminApi.getTagIconsOverview,
  });
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});
  const [categoryDraft, setCategoryDraft] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!overviewQuery.data) return;
    const nextTags: Record<string, string> = {};
    for (const [key, value] of Object.entries(overviewQuery.data.iconsMap))
      nextTags[key] = value ?? "";
    const nextCategories: Record<string, string> = {};
    for (const [key, value] of Object.entries(overviewQuery.data.categoryIcons)) {
      nextCategories[key] = value ?? "";
    }
    setTagDraft(nextTags);
    setCategoryDraft(nextCategories);
  }, [overviewQuery.data]);

  const suggestMutation = useMutation({
    mutationFn: adminApi.suggestTagIcon,
    onSuccess: (data, variables) => {
      const suggestion = typeof data.icon === "string" ? data.icon : "";
      if (variables.type === "tag" && variables.name) {
        setTagDraft((current) => ({ ...current, [variables.name as string]: suggestion }));
      }
      if (variables.type === "category" && variables.key) {
        setCategoryDraft((current) => ({ ...current, [variables.key as string]: suggestion }));
      }
      setNotice(
        suggestion
          ? `已填入建议图标：${suggestion}`
          : `未得到可用图标建议：${String(data.reason ?? "unknown")}`
      );
    },
  });

  const assignMutation = useMutation({
    mutationFn: adminApi.assignTagIcon,
    onSuccess: () => {
      setNotice("图标映射已保存。\n若公开站有缓存，记得后续刷新。");
      queryClient.invalidateQueries({ queryKey: ["admin-tag-icons-overview"] });
    },
  });

  const categories = useMemo(() => {
    const groupedKeys = new Set((overviewQuery.data?.groups ?? []).map((group) => group.key));
    return Array.from(
      new Set([...groupedKeys, ...Object.keys(overviewQuery.data?.categoryIcons ?? {})])
    );
  }, [overviewQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader title="图标匹配" description="给标签和分类分配最终 Iconify ID。" />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {overviewQuery.error ? (
        <Alert tone="danger">{getErrorMessage(overviewQuery.error)}</Alert>
      ) : null}
      {suggestMutation.error ? (
        <Alert tone="danger">{getErrorMessage(suggestMutation.error)}</Alert>
      ) : null}
      {assignMutation.error ? (
        <Alert tone="danger">{getErrorMessage(assignMutation.error)}</Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>分类图标</CardTitle>
          <CardDescription>优先处理分组 key，对公开站视觉最稳定。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {categories.map((key) => (
            <div key={key} className="rounded-xl border border-border bg-muted/50 p-4">
              <FieldLabel>{key}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  value={categoryDraft[key] ?? ""}
                  onChange={(event) =>
                    setCategoryDraft((current) => ({ ...current, [key]: event.target.value }))
                  }
                  placeholder="例如 simple-icons:astro"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => suggestMutation.mutate({ type: "category", key, title: key })}
                >
                  建议
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    assignMutation.mutate({
                      type: "category",
                      key,
                      icon: categoryDraft[key] ?? "",
                    })
                  }
                >
                  保存
                </Button>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                当前值：<code>{categoryDraft[key] || "（未设置）"}</code>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {(overviewQuery.data?.groups ?? []).map((group) => (
        <Card key={group.key}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.tags.length} 个标签</CardDescription>
              </div>
              <Badge tone="outline">{group.key}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.tags.map((tag) => (
              <div key={tag.name} className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-medium">{tag.name}</div>
                  <Badge tone="muted">{tag.count}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-[240px] flex-1"
                    value={tagDraft[tag.name] ?? ""}
                    onChange={(event) =>
                      setTagDraft((current) => ({ ...current, [tag.name]: event.target.value }))
                    }
                    placeholder="例如 simple-icons:typescript"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => suggestMutation.mutate({ type: "tag", name: tag.name })}
                  >
                    建议
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      assignMutation.mutate({
                        type: "tag",
                        name: tag.name,
                        icon: tagDraft[tag.name] ?? "",
                      })
                    }
                  >
                    保存
                  </Button>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  当前值：<code>{tagDraft[tag.name] || "（未设置）"}</code>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
