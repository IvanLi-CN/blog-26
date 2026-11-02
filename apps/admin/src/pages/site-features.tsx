import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminApiError, type AdminSiteFeatureSettings, adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Spinner,
  Switch,
} from "~/components/ui";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

type SiteFeatureEditor = {
  serviceEnabled: boolean;
  launcherEnabled: boolean;
};

function toEditor(payload: AdminSiteFeatureSettings): SiteFeatureEditor {
  return {
    serviceEnabled: payload.settings.assistant.serviceEnabled,
    launcherEnabled: payload.settings.assistant.launcherEnabled,
  };
}

function editorEquals(left: SiteFeatureEditor | null, right: SiteFeatureEditor | null) {
  return (
    left?.serviceEnabled === right?.serviceEnabled &&
    left?.launcherEnabled === right?.launcherEnabled
  );
}

function describeMutationError(error: unknown) {
  if (error instanceof AdminApiError && error.code === "SITE_FEATURE_SETTINGS_CONFLICT") {
    return "配置已被其他窗口更新，请刷新后重试。";
  }
  return getErrorMessage(error);
}

export function SiteFeaturesPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin-site-features"],
    queryFn: adminApi.getSiteFeatureSettings,
  });
  const [editor, setEditor] = useState<SiteFeatureEditor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const savedEditor = useMemo(
    () => (settingsQuery.data ? toEditor(settingsQuery.data) : null),
    [settingsQuery.data]
  );
  const dirty = !editorEquals(editor, savedEditor);

  useEffect(() => {
    if (savedEditor && (!editor || !dirty)) setEditor(savedEditor);
  }, [dirty, editor, savedEditor]);

  const saveMutation = useMutation({
    mutationFn: (next: SiteFeatureEditor) =>
      adminApi.updateSiteFeatureSettings({
        expectedRevision: settingsQuery.data?.revision ?? 0,
        assistant: next,
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(["admin-site-features"], payload);
      setEditor(toEditor(payload));
      setNotice("站点功能配置已保存。");
    },
  });

  if (settingsQuery.error)
    return <Alert tone="danger">{getErrorMessage(settingsQuery.error)}</Alert>;
  if (settingsQuery.isLoading || !editor || !settingsQuery.data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-muted-foreground">
        <Spinner />
        正在加载站点功能配置…
      </div>
    );
  }

  const resolved = settingsQuery.data.resolved.assistant;
  return (
    <div className="space-y-6">
      <PageHeader
        title="站点功能"
        description="控制公开站与 Console 的助手入口，以及服务端助手能力。"
        actions={
          <Button
            onClick={() => saveMutation.mutate(editor)}
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Spinner /> : <Save className="size-4" />}
            {saveMutation.isPending ? "保存中…" : "保存设置"}
          </Button>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {saveMutation.error ? (
        <Alert tone="danger">{describeMutationError(saveMutation.error)}</Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>知识对话</CardTitle>
          <CardDescription>入口设置只影响界面显示；服务设置同时约束公开 API。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="site-feature-assistant-service">启用助手服务</Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                关闭后入口隐藏，助手 API 返回 FEATURE_DISABLED。
              </p>
            </div>
            <Switch
              id="site-feature-assistant-service"
              checked={editor.serviceEnabled}
              onCheckedChange={(serviceEnabled) =>
                setEditor((current) => (current ? { ...current, serviceEnabled } : current))
              }
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="site-feature-assistant-launcher">显示助手入口</Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                控制公开站与 Console 页面右下角入口；直接访问 /chat 不受此项影响。
              </p>
            </div>
            <Switch
              id="site-feature-assistant-launcher"
              checked={editor.launcherEnabled}
              onCheckedChange={(launcherEnabled) =>
                setEditor((current) => (current ? { ...current, launcherEnabled } : current))
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/54 pt-4 text-sm">
            <span className="text-muted-foreground">当前对外入口</span>
            <Badge tone={resolved.publicLauncherEnabled ? "success" : "muted"}>
              {resolved.publicLauncherEnabled ? "已显示" : "已隐藏"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              修订号 {settingsQuery.data.revision}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
