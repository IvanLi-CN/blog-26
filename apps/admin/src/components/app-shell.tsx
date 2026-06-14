import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BrainCircuit,
  ClipboardList,
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
import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { adminApi } from "@/lib/admin-api-client";
import { ThemeToggle } from "~/components/theme-toggle";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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
  setFloatingFooter: (footer: ReactNode | null) => void;
};

const AppShellSidebarContext = createContext<AppShellSidebarContextValue | null>(null);
const SIDEBAR_WIDTH_STORAGE_KEY = "admin-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 272;
const MIN_SIDEBAR_WIDTH = 232;
const MAX_SIDEBAR_WIDTH = 460;

function constrainSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

function readStoredSidebarWidth() {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  const storedValue = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  if (!storedValue) return DEFAULT_SIDEBAR_WIDTH;
  const stored = Number(storedValue);
  return Number.isFinite(stored) ? constrainSidebarWidth(stored) : DEFAULT_SIDEBAR_WIDTH;
}

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

export function useAppShellSidebarFloatingFooter(footer: ReactNode | null) {
  const context = useContext(AppShellSidebarContext);
  const setFloatingFooter = context?.setFloatingFooter;

  useEffect(() => {
    if (!setFloatingFooter) return;
    setFloatingFooter(footer);
    return () => setFloatingFooter(null);
  }, [footer, setFloatingFooter]);
}

function BrandBlock({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        to="/dashboard"
        className="group flex min-w-0 items-center gap-3 rounded-3xl p-2 lg:rounded-[1rem]"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-3xl bg-primary/14 text-primary shadow-lg shadow-primary/12 transition-transform group-hover:-translate-y-0.5 lg:size-10 lg:rounded-[1rem]">
          <Shield className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold leading-tight text-foreground">
            管理后台
          </span>
          <span className="block truncate text-xs text-muted-foreground">内容工作台</span>
        </span>
      </Link>
      {children}
    </div>
  );
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="grid gap-5 lg:gap-4">
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
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/62 hover:text-foreground lg:gap-2.5 lg:rounded-[0.75rem] lg:px-2.5 lg:py-2"
                  activeOptions={{ exact: item.to === "/dashboard" }}
                  activeProps={{
                    className:
                      "bg-card text-foreground shadow-lg shadow-shadow-soft ring-1 ring-border/48",
                  }}
                >
                  <span className="flex size-9 items-center justify-center rounded-2xl bg-input-surface text-primary shadow-inner shadow-shadow-inset lg:size-8 lg:rounded-[0.75rem]">
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

function SessionPanel({
  sessionLoading,
  coveredByFloatingFooter,
}: {
  sessionLoading: boolean;
  coveredByFloatingFooter: boolean;
}) {
  const sessionQuery = useQuery({
    queryKey: ["admin-session"],
    queryFn: adminApi.session,
    staleTime: 30_000,
  });

  return (
    <section
      aria-hidden={coveredByFloatingFooter || undefined}
      className={`border-t border-border/54 pt-3 text-sm${coveredByFloatingFooter ? " hidden" : ""}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-medium">
          {sessionQuery.data?.user?.email ?? (sessionLoading ? "加载中..." : "未识别")}
        </div>
        <Badge tone={sessionQuery.data?.isAdmin ? "success" : "outline"}>
          {sessionQuery.data?.isAdmin ? "admin" : "viewer"}
        </Badge>
      </div>

      {sessionQuery.data && !sessionQuery.data.isAdmin ? (
        <div className="mt-3">
          <Alert tone="warning">当前会话没有管理员权限，建议刷新或重新建立会话。</Alert>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <ThemeToggle />
        <Button asChild variant="outline" size="sm" className="min-w-0 flex-1 justify-start">
          <a href="/">
            <Waypoints className="size-4" />
            公开站
          </a>
        </Button>
      </div>
    </section>
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
    <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-muted/54 p-1 shadow-inner shadow-shadow-inset">
      <TooltipProvider delayDuration={240}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={sidebarMode === "nav" ? "default" : "ghost"}
              size="icon"
              onClick={() => setSidebarMode("nav")}
              aria-label="显示导航"
            >
              <Menu className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            导航
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={sidebarMode === "route" ? "default" : "ghost"}
              size="icon"
              onClick={() => setSidebarMode("route")}
              aria-label={`显示${routeSidebar.label}`}
            >
              <Files className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            {routeSidebar.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function SidebarContent({
  routeSidebar,
  sidebarMode,
  setSidebarMode,
  sessionLoading,
  floatingFooterActive,
  onNavigate,
}: {
  routeSidebar: AppShellSidebarPanel | null;
  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;
  sessionLoading: boolean;
  floatingFooterActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div
      className={`relative flex h-full min-h-0 flex-col gap-5 lg:gap-4${
        floatingFooterActive ? " pb-[var(--admin-sidebar-floating-footer-offset,0px)]" : ""
      }`}
    >
      <BrandBlock>
        <SidebarModeSwitch
          routeSidebar={routeSidebar}
          sidebarMode={sidebarMode}
          setSidebarMode={setSidebarMode}
        />
      </BrandBlock>
      {sidebarMode === "route" && routeSidebar ? (
        <div className="min-h-0 flex-1 overflow-hidden pr-1">
          <div className="h-full min-h-0">{routeSidebar.content}</div>
        </div>
      ) : (
        <div className="admin-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          <NavigationLinks onNavigate={onNavigate} />
        </div>
      )}
      <SessionPanel
        sessionLoading={sessionLoading}
        coveredByFloatingFooter={floatingFooterActive}
      />
    </div>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isEditorWorkspace = pathname === "/posts/editor";
  const sessionQuery = useQuery({
    queryKey: ["admin-session"],
    queryFn: adminApi.session,
    staleTime: 30_000,
  });
  const [routeSidebar, setRouteSidebar] = useState<AppShellSidebarPanel | null>(null);
  const [sidebarFloatingFooter, setSidebarFloatingFooter] = useState<ReactNode | null>(null);
  const [sidebarFloatingFooterElement, setSidebarFloatingFooterElement] =
    useState<HTMLDivElement | null>(null);
  const [sidebarFloatingFooterHeight, setSidebarFloatingFooterHeight] = useState(0);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("nav");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const sidebarWidthRef = useRef(sidebarWidth);
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

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!sidebarFloatingFooterElement) {
      setSidebarFloatingFooterHeight(0);
      return;
    }

    const updateHeight = () => {
      setSidebarFloatingFooterHeight(
        Math.ceil(sidebarFloatingFooterElement.getBoundingClientRect().height)
      );
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(sidebarFloatingFooterElement);

    return () => resizeObserver.disconnect();
  }, [sidebarFloatingFooterElement]);

  useEffect(() => {
    if (!sidebarFloatingFooter) {
      setSidebarFloatingFooterHeight(0);
    }
  }, [sidebarFloatingFooter]);

  const commitSidebarWidth = useCallback((nextWidth: number) => {
    const width = constrainSidebarWidth(nextWidth);
    sidebarWidthRef.current = width;
    setSidebarWidth(width);
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  }, []);

  const handleSidebarResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLHRElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = sidebarWidthRef.current;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        commitSidebarWidth(startWidth + moveEvent.clientX - startX);
      };

      const handlePointerUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [commitSidebarWidth]
  );

  const handleSidebarResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLHRElement>) => {
      const step = event.shiftKey ? 32 : 12;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitSidebarWidth(sidebarWidthRef.current - step);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        commitSidebarWidth(sidebarWidthRef.current + step);
      }
      if (event.key === "Home") {
        event.preventDefault();
        commitSidebarWidth(MIN_SIDEBAR_WIDTH);
      }
      if (event.key === "End") {
        event.preventDefault();
        commitSidebarWidth(MAX_SIDEBAR_WIDTH);
      }
    },
    [commitSidebarWidth]
  );

  const handleSidebarResizeDoubleClick = useCallback(() => {
    commitSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  }, [commitSidebarWidth]);

  const sidebarContext = useMemo<AppShellSidebarContextValue>(
    () => ({
      sidebarMode,
      setSidebarMode,
      setRouteSidebar,
      setFloatingFooter: setSidebarFloatingFooter,
    }),
    [sidebarMode]
  );
  const sidebarFloatingFooterOffsetStyle = useMemo(
    () =>
      sidebarFloatingFooterHeight > 0
        ? ({
            "--admin-sidebar-floating-footer-offset": `${sidebarFloatingFooterHeight + 8}px`,
          } as React.CSSProperties)
        : undefined,
    [sidebarFloatingFooterHeight]
  );

  return (
    <AppShellSidebarContext.Provider value={sidebarContext}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_34%,color-mix(in_oklch,var(--secondary)_10%,transparent))]" />
        <div
          className="admin-app-shell-grid relative mx-auto grid min-h-screen w-full grid-cols-1"
          style={{ "--admin-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
        >
          <aside className="relative sticky top-0 hidden h-screen min-h-0 p-4 lg:block">
            <div
              className="admin-sidebar-card relative h-full overflow-hidden rounded-[2rem] bg-card/74 p-4 pr-5 shadow-xl shadow-shadow-soft ring-1 ring-border/54 backdrop-blur-md"
              data-testid="admin-sidebar-card"
              style={sidebarFloatingFooterOffsetStyle}
            >
              <SidebarContent
                routeSidebar={routeSidebar}
                sidebarMode={sidebarMode}
                setSidebarMode={setSidebarMode}
                sessionLoading={sessionQuery.isLoading}
                floatingFooterActive={Boolean(sidebarFloatingFooter)}
              />
              <TooltipProvider delayDuration={240}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <hr
                      tabIndex={0}
                      className="admin-sidebar-resize-handle"
                      aria-label="调整侧边栏宽度，双击恢复默认宽度"
                      aria-orientation="vertical"
                      aria-valuemin={MIN_SIDEBAR_WIDTH}
                      aria-valuemax={MAX_SIDEBAR_WIDTH}
                      aria-valuenow={sidebarWidth}
                      aria-valuetext={`${sidebarWidth}px`}
                      data-testid="admin-sidebar-resize-handle"
                      onDoubleClick={handleSidebarResizeDoubleClick}
                      onPointerDown={handleSidebarResizePointerDown}
                      onKeyDown={handleSidebarResizeKeyDown}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="right" align="center">
                    拖动调整侧栏宽度，双击恢复默认
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {sidebarFloatingFooter ? (
              <div
                className="pointer-events-none absolute inset-x-4 bottom-4 z-20"
                data-testid="admin-sidebar-floating-footer-host"
              >
                <div ref={setSidebarFloatingFooterElement} className="pointer-events-auto w-full">
                  {sidebarFloatingFooter}
                </div>
              </div>
            ) : null}
          </aside>

          <div className="min-w-0" data-testid="admin-shell-main">
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
                <span className="size-11 sm:size-10" aria-hidden />
              </div>
            </header>

            <main
              className={`px-4 py-5 sm:px-6 lg:px-7 lg:py-6 xl:px-8 ${
                isEditorWorkspace ? "lg:h-screen lg:overflow-hidden" : ""
              }`}
            >
              <div
                className={`mx-auto max-w-[1440px] ${
                  isEditorWorkspace ? "flex h-full min-h-0 flex-col gap-5" : "space-y-5 pb-10"
                }`}
              >
                <div id="admin-view" className={isEditorWorkspace ? "min-h-0 flex-1" : "space-y-6"}>
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
            <div className="h-full min-h-0 p-4" style={sidebarFloatingFooterOffsetStyle}>
              <SidebarContent
                routeSidebar={routeSidebar}
                sidebarMode={sidebarMode}
                setSidebarMode={setSidebarMode}
                sessionLoading={sessionQuery.isLoading}
                floatingFooterActive={Boolean(sidebarFloatingFooter)}
                onNavigate={() => setMobileOpen(false)}
              />
              {sidebarFloatingFooter ? (
                <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20">
                  <div ref={setSidebarFloatingFooterElement} className="pointer-events-auto">
                    {sidebarFloatingFooter}
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShellSidebarContext.Provider>
  );
}
