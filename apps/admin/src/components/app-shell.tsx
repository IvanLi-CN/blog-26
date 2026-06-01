import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BrainCircuit,
  ClipboardList,
  FilePenLine,
  Files,
  KeyRound,
  LayoutDashboard,
  Menu,
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
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  Dialog,
  DialogContent,
  DialogTitle,
  Separator,
} from "~/components/ui";

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

const navSections = [
  {
    label: "内容",
    items: [
      { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
      { to: "/posts", label: "文章", icon: Files },
      { to: "/comments", label: "评论", icon: MessageSquareMore },
      { to: "/content-sync", label: "内容同步", icon: RefreshCcw },
    ],
  },
  {
    label: "运营",
    items: [
      { to: "/schedules", label: "计划任务", icon: ClipboardList },
      { to: "/tags", label: "标签分组", icon: Tags },
      { to: "/tag-icons", label: "图标匹配", icon: ScanSearch },
    ],
  },
  {
    label: "系统",
    items: [
      { to: "/pats", label: "访问令牌", icon: KeyRound },
      { to: "/llm-settings", label: "LLM 设置", icon: BrainCircuit },
    ],
  },
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

function BrandBlock() {
  return (
    <Link to="/dashboard" className="group flex items-center gap-3 rounded-3xl p-2">
      <span className="flex size-12 items-center justify-center rounded-3xl bg-primary/14 text-primary shadow-lg shadow-primary/12 transition-transform group-hover:-translate-y-0.5">
        <Shield className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-tight text-foreground">
          管理后台
        </span>
        <span className="block text-xs text-muted-foreground">Blog Console</span>
      </span>
    </Link>
  );
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="grid gap-5">
      {navSections.map((section) => (
        <div key={section.label} className="space-y-2">
          <div className="px-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {section.label}
          </div>
          <div className="grid gap-1.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/62 hover:text-foreground"
                  activeOptions={{ exact: item.to === "/dashboard" }}
                  activeProps={{
                    className:
                      "bg-card text-foreground shadow-lg shadow-shadow-soft ring-1 ring-border/48",
                  }}
                >
                  <span className="flex size-9 items-center justify-center rounded-2xl bg-input-surface text-primary shadow-inner shadow-shadow-inset">
                    <Icon className="size-4" />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SessionPanel({ sessionLoading }: { sessionLoading: boolean }) {
  const sessionQuery = useQuery({
    queryKey: ["admin-session"],
    queryFn: adminApi.session,
    staleTime: 30_000,
  });

  return (
    <Card className="border-0 bg-card/68 shadow-lg shadow-shadow-soft">
      <CardContent className="space-y-4 p-4 text-sm">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Current user
          </div>
          <div className="truncate font-medium">
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

        <Separator />

        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Build
          </div>
          <CardDescription>
            {versionInfo.version} · {versionInfo.commitShortHash}
          </CardDescription>
        </div>

        <a href="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <FilePenLine className="size-4" />
          返回公开站
        </a>
      </CardContent>
    </Card>
  );
}

function SidebarModeSwitch({
  routeSidebar,
  sidebarMode,
  setSidebarMode,
}: {
  routeSidebar: AppShellSidebarPanel | null;
  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;
}) {
  if (!routeSidebar) return null;

  return (
    <div className="rounded-3xl bg-muted/58 p-1.5 shadow-inner shadow-shadow-inset">
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant={sidebarMode === "nav" ? "default" : "ghost"}
          size="sm"
          onClick={() => setSidebarMode("nav")}
        >
          导航
        </Button>
        <Button
          variant={sidebarMode === "route" ? "default" : "ghost"}
          size="sm"
          onClick={() => setSidebarMode("route")}
        >
          {routeSidebar.label}
        </Button>
      </div>
      {sidebarMode === "route" && routeSidebar.description ? (
        <div className="px-3 py-2 text-xs leading-5 text-muted-foreground">
          {routeSidebar.description}
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  routeSidebar,
  sidebarMode,
  setSidebarMode,
  sessionLoading,
  onNavigate,
}: {
  routeSidebar: AppShellSidebarPanel | null;
  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;
  sessionLoading: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <BrandBlock />
      <SidebarModeSwitch
        routeSidebar={routeSidebar}
        sidebarMode={sidebarMode}
        setSidebarMode={setSidebarMode}
      />
      <div className="admin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        {sidebarMode === "route" && routeSidebar ? (
          <div className="h-full">{routeSidebar.content}</div>
        ) : (
          <NavigationLinks onNavigate={onNavigate} />
        )}
      </div>
      <SessionPanel sessionLoading={sessionLoading} />
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
  const [mobileOpen, setMobileOpen] = useState(false);
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
      <div className="min-h-screen bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_34%,color-mix(in_oklch,var(--secondary)_10%,transparent))]" />
        <div className="relative mx-auto grid min-h-screen w-full grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)]">
          <aside className="sticky top-0 hidden h-screen min-h-0 p-4 lg:block">
            <div className="h-full rounded-[2rem] bg-card/74 p-4 shadow-xl shadow-shadow-soft ring-1 ring-border/54 backdrop-blur-md">
              <SidebarContent
                routeSidebar={routeSidebar}
                sidebarMode={sidebarMode}
                setSidebarMode={setSidebarMode}
                sessionLoading={sessionQuery.isLoading}
              />
            </div>
          </aside>

          <div className="min-w-0">
            <header className="sticky top-0 z-30 border-b border-border/48 bg-background/84 px-4 py-3 backdrop-blur-md lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" size="icon" onClick={() => setMobileOpen(true)}>
                  <Menu className="size-4" />
                  <span className="sr-only">打开导航</span>
                </Button>
                <div className="min-w-0 text-center">
                  <div className="truncate text-sm font-semibold">管理后台</div>
                  <div className="truncate text-xs text-muted-foreground">{pathname}</div>
                </div>
                <ThemeToggle />
              </div>
            </header>

            <main className="px-4 py-5 sm:px-6 lg:px-7 lg:py-7 xl:px-9">
              <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
                <div className="hidden items-center justify-between gap-4 lg:flex">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Workspace
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">{pathname}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Button asChild variant="outline" size="sm">
                      <a href="/">
                        <Waypoints className="size-4" />
                        公开站
                      </a>
                    </Button>
                  </div>
                </div>
                <div id="admin-view" className="space-y-6">
                  <Outlet />
                </div>
              </div>
            </main>
          </div>
        </div>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogContent
            className="left-4 top-4 h-[calc(100vh-2rem)] w-[min(calc(100vw-2rem),24rem)] translate-x-0 translate-y-0"
            showClose
          >
            <DialogTitle className="sr-only">后台导航</DialogTitle>
            <div className="h-full min-h-0 p-4">
              <SidebarContent
                routeSidebar={routeSidebar}
                sidebarMode={sidebarMode}
                setSidebarMode={setSidebarMode}
                sessionLoading={sessionQuery.isLoading}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShellSidebarContext.Provider>
  );
}
