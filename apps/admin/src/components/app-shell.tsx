import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BrainCircuit,
  ClipboardList,
  FilePenLine,
  Files,
  KeyRound,
  LayoutDashboard,
  MessageSquareMore,
  RefreshCcw,
  ScanSearch,
  Shield,
  Tags,
  Waypoints,
} from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/admin-api-client";
import { versionInfo } from "@/lib/version-info";
import { ThemeToggle } from "~/components/theme-toggle";
import { Alert, Badge, Button, Card, CardContent, CardDescription } from "~/components/ui";

type SidebarMode = "nav" | "route";

type AppShellSidebarPanel = {
  label: string;
  description?: string;
  content: ReactNode;
  preferredMode?: SidebarMode;
};

type AppShellSidebarContextValue = {
  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;
  setRouteSidebar: (panel: AppShellSidebarPanel | null) => void;
};

const AppShellSidebarContext = createContext<AppShellSidebarContextValue | null>(null);

const navItems = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { to: "/posts", label: "文章", icon: Files },
  { to: "/comments", label: "评论", icon: MessageSquareMore },
  { to: "/content-sync", label: "内容同步", icon: RefreshCcw },
  { to: "/schedules", label: "计划任务", icon: ClipboardList },
  { to: "/tags", label: "标签分组", icon: Tags },
  { to: "/tag-icons", label: "图标匹配", icon: ScanSearch },
  { to: "/pats", label: "访问令牌", icon: KeyRound },
  { to: "/llm-settings", label: "LLM 设置", icon: BrainCircuit },
] as const;

export function useAppShellSidebar(panel: AppShellSidebarPanel | null) {
  const context = useContext(AppShellSidebarContext);
  const shellSidebarMode = context?.sidebarMode ?? "nav";
  const setShellSidebarMode = context?.setSidebarMode;
  const setRouteSidebar = context?.setRouteSidebar;

  useEffect(() => {
    if (!setRouteSidebar) return;
    setRouteSidebar(panel);
  }, [panel, setRouteSidebar]);

  useEffect(() => {
    if (!setShellSidebarMode || !panel?.preferredMode) return;
    setShellSidebarMode(panel.preferredMode);
  }, [panel?.preferredMode, setShellSidebarMode]);

  useEffect(() => {
    return () => {
      setRouteSidebar?.(null);
      setShellSidebarMode?.("nav");
    };
  }, [setRouteSidebar, setShellSidebarMode]);

  return {
    sidebarMode: shellSidebarMode,
    setSidebarMode: setShellSidebarMode ?? (() => undefined),
  };
}

function ShellHeader() {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-5 lg:px-6">
      <div>
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-lg font-semibold">
          <Shield className="size-5 text-primary" />
          <span>管理后台</span>
        </Link>
        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Blog Console
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <a
          href="/"
          className="rounded-md border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
          aria-label="返回公开站"
          title="返回公开站"
        >
          <Waypoints className="size-4" />
        </a>
      </div>
    </div>
  );
}

function NavigationPanel({ sessionLoading }: { sessionLoading: boolean }) {
  const sessionQuery = useQuery({
    queryKey: ["admin-session"],
    queryFn: adminApi.session,
    staleTime: 30_000,
  });

  return (
    <div className="flex h-full flex-col gap-6 px-4 pb-6 lg:px-4">
      <nav className="grid gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm text-muted-foreground transition hover:border-border hover:bg-accent hover:text-accent-foreground"
              activeOptions={{ exact: item.to === "/dashboard" }}
              activeProps={{
                className:
                  "border-border bg-accent text-accent-foreground shadow-[0_10px_30px_rgba(0,0,0,0.2)]",
              }}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Card className="bg-muted/70 shadow-none">
        <CardContent className="space-y-4 p-4 text-sm">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Current user
            </div>
            <div className="font-medium">
              {sessionQuery.data?.user?.email ?? (sessionLoading ? "加载中..." : "未识别")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={sessionQuery.data?.isAdmin ? "success" : "outline"}>
                {sessionQuery.data?.isAdmin ? "admin" : "viewer"}
              </Badge>
              <Badge tone="outline">{versionInfo.branchName}</Badge>
            </div>
          </div>

          {sessionQuery.data && !sessionQuery.data.isAdmin ? (
            <Alert tone="warning">当前会话没有管理员权限，建议刷新或重新建立会话。</Alert>
          ) : null}

          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Build</div>
            <CardDescription>
              {versionInfo.version} · {versionInfo.commitShortHash}
            </CardDescription>
          </div>

          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <FilePenLine className="size-4" />
            返回公开站
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sessionQuery = useQuery({
    queryKey: ["admin-session"],
    queryFn: adminApi.session,
    staleTime: 30_000,
  });
  const [routeSidebar, setRouteSidebar] = useState<AppShellSidebarPanel | null>(null);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("nav");
  const hasRouteSidebar = Boolean(routeSidebar);

  useEffect(() => {
    if (!hasRouteSidebar) {
      setSidebarMode("nav");
      return;
    }
    if (routeSidebar?.preferredMode) {
      setSidebarMode(routeSidebar.preferredMode);
    }
  }, [hasRouteSidebar, routeSidebar?.preferredMode]);

  const sidebarContext = useMemo<AppShellSidebarContextValue>(
    () => ({
      sidebarMode,
      setSidebarMode,
      setRouteSidebar,
    }),
    [sidebarMode]
  );

  return (
    <AppShellSidebarContext.Provider value={sidebarContext}>
      <div className="min-h-screen bg-background text-foreground lg:h-screen lg:overflow-hidden">
        <div className="mx-auto grid min-h-screen max-w-[1760px] grid-cols-1 lg:h-screen lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-border bg-card/90 backdrop-blur lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
            <ShellHeader />

            {hasRouteSidebar ? (
              <div className="px-4 pb-4 lg:px-4">
                <div className="rounded-2xl border border-border bg-background/70 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={sidebarMode === "nav" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setSidebarMode("nav")}
                    >
                      后台导航
                    </Button>
                    <Button
                      variant={sidebarMode === "route" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setSidebarMode("route")}
                    >
                      {routeSidebar?.label ?? "工作区"}
                    </Button>
                  </div>
                  {sidebarMode === "route" && routeSidebar?.description ? (
                    <div className="px-2 pt-2 text-xs text-muted-foreground">
                      {routeSidebar.description}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto admin-scrollbar">
              {sidebarMode === "route" && routeSidebar ? (
                <div className="h-full px-4 pb-6 lg:px-4">{routeSidebar.content}</div>
              ) : (
                <NavigationPanel sessionLoading={sessionQuery.isLoading} />
              )}
            </div>
          </aside>

          <main className="min-w-0 px-4 py-4 lg:h-screen lg:min-h-0 lg:overflow-y-auto lg:px-6 lg:py-6 xl:px-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 lg:hidden">
              <div>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 text-lg font-semibold"
                >
                  <Shield className="size-5 text-primary" />
                  <span>管理后台</span>
                </Link>
                <div className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {pathname}
                </div>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <ThemeToggle />
                <Button asChild variant="outline" size="sm">
                  <a href="/">返回公开站</a>
                </Button>
              </div>
            </div>
            <div id="admin-view" className="space-y-6 pb-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AppShellSidebarContext.Provider>
  );
}
