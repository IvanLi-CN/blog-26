import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  BrainCircuit,
  ChevronDown,
  ClipboardList,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  FolderUp,
  KeyRound,
  LayoutDashboard,
  RefreshCcw,
  Search,
  Shield,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useMemo,
  useState,
} from "react";
import { expect, userEvent, within } from "storybook/test";
import type { ActivityItem, AdminSession, DashboardStats } from "@/lib/admin-api-client";
import { EditorTabStrip } from "~/editor/editor-tab-strip";
import { DashboardPage } from "~/pages/dashboard";
import { AppShell } from "./app-shell";
import { ThemeProvider } from "./theme-provider";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogTitle,
  EmptyState,
  FieldLabel,
  Input,
  Select,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui";

const meta = {
  title: "Admin/Soft UI System",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Soft UI admin redesign gallery covering primitives, app shell structure, data states, and mobile navigation.",
      },
    },
  },
  decorators: [
    (Story, context) =>
      context.parameters.adminFullscreen ? (
        <Story />
      ) : (
        <div className="min-h-screen bg-background p-6 text-foreground">
          <Story />
        </div>
      ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function SoftPageFrame() {
  const navItems = [
    { label: "仪表盘", icon: LayoutDashboard, active: true },
    { label: "文章", icon: FileText },
    { label: "内容同步", icon: RefreshCcw },
    { label: "计划任务", icon: ClipboardList },
    { label: "访问令牌", icon: KeyRound },
    { label: "LLM 设置", icon: BrainCircuit },
  ];

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col gap-5 rounded-[2rem] bg-card/76 p-4 shadow-xl shadow-shadow-soft ring-1 ring-border/54">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-3xl bg-primary/14 text-primary shadow-lg shadow-primary/12">
          <Shield className="size-5" />
        </span>
        <div>
          <div className="font-semibold">管理后台</div>
          <div className="text-xs text-muted-foreground">内容工作台</div>
        </div>
      </div>
      <div className="grid gap-1.5">
        {navItems.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium ${
              item.active
                ? "bg-card text-foreground shadow-lg shadow-shadow-soft ring-1 ring-border/48"
                : "text-muted-foreground"
            }`}
          >
            <span className="flex size-9 items-center justify-center rounded-2xl bg-input-surface text-primary shadow-inner shadow-shadow-inset">
              <item.icon className="size-4" />
            </span>
            {item.label}
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-3xl bg-muted/42 p-4 text-sm shadow-inner shadow-shadow-inset">
        <div className="font-medium">author@example.com</div>
        <div className="mt-2 flex gap-2">
          <Badge tone="success">admin</Badge>
          <Badge tone="outline">branch</Badge>
        </div>
      </div>
    </div>
  );

  const content = (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="flex flex-col gap-4 rounded-[2rem] bg-card/62 px-6 py-5 shadow-lg shadow-shadow-soft ring-1 ring-border/48 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">管理员仪表盘</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看站点概况、近期活动与后台健康状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline">
            <RefreshCcw className="size-4" />
            刷新
          </Button>
          <Button>新建草稿</Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["文章总数", "128", "已发布 118 · 草稿 10", "primary"],
          ["评论总数", "342", "已批准 320 · 待审 22", "secondary"],
          ["内容源", "1", "local", "success"],
          ["同步任务", "idle", "最近一次 13 分钟前", "warning"],
        ].map(([title, value, description, tone]) => (
          <Card key={title}>
            <CardContent className="space-y-3 p-5">
              <Badge tone={tone as "default"}>{title}</Badge>
              <div className="text-3xl font-semibold">{value}</div>
              <div className="text-sm text-muted-foreground">{description}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>最近活动</CardTitle>
          <CardDescription>文章、评论与同步任务的近期变化。</CardDescription>
        </CardHeader>
        <CardContent>
          <SoftDataTable />
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="grid min-h-[820px] grid-cols-[272px_minmax(0,1fr)] gap-6">
      {sidebar}
      <div className="min-w-0 px-2 py-2">{content}</div>
    </div>
  );
}

const mobileDashboardSession = {
  user: {
    id: "storybook-admin",
    nickname: "Ivan",
    email: "author@example.com",
  },
  isAdmin: true,
} satisfies AdminSession;

const mobileDashboardStats = {
  posts: { total: 17, published: 13, draft: 2 },
  comments: { total: 0, approved: 0, pending: 0 },
  users: { total: 3 },
  activity: { verificationCodes: 0 },
} satisfies DashboardStats;

const mobileDashboardActivity = [
  {
    type: "post",
    id: "activity-mobile-1",
    title: "后台移动端证据更新",
    action: "updated",
    status: "published",
    createdAt: "2026-07-31T05:45:00.000Z",
  },
  {
    type: "comment",
    id: "activity-mobile-2",
    content: "新的评论等待审核",
    action: "created",
    status: "pending",
    createdAt: "2026-07-31T04:30:00.000Z",
  },
] satisfies ActivityItem[];

function MobileDashboardFrame() {
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
      },
    });
    client.setQueryData(["admin-session"], mobileDashboardSession);
    client.setQueryData(["dashboard-stats"], mobileDashboardStats);
    client.setQueryData(["dashboard-activity"], mobileDashboardActivity);
    return client;
  }, []);
  const storyRouter = useMemo(() => {
    const rootRoute = createRootRoute({ component: AppShell });
    const dashboardRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/dashboard",
      component: DashboardPage,
    });
    return createRouter({
      routeTree: rootRoute.addChildren([dashboardRoute]),
      history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={storyRouter} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function SoftDataTable() {
  return (
    <div className="overflow-x-auto admin-scrollbar">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>项目</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>来源</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            ["Soft UI redesign", "running", "admin"],
            ["LLM catalog refresh", "success", "system"],
            ["Comment moderation", "warning", "user"],
          ].map(([name, status, source]) => (
            <TableRow key={name}>
              <TableCell className="font-medium">{name}</TableCell>
              <TableCell>
                <Badge
                  tone={
                    status === "success" ? "success" : status === "warning" ? "warning" : "default"
                  }
                >
                  {status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{source}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline">
                  查看
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PrimitiveGallery() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>内容操作</CardTitle>
          <CardDescription>搜索、筛选、状态切换与常用操作。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div
            className="grid gap-4 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end"
            data-testid="aligned-filter-controls"
          >
            <div className="grid min-w-0 gap-2">
              <FieldLabel className="mb-0">搜索</FieldLabel>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input aria-label="搜索内容" placeholder="标题、slug、正文关键字" />
                <Button>
                  <Search className="size-4" />
                  搜索
                </Button>
              </div>
            </div>
            <div className="grid min-w-0 gap-2">
              <FieldLabel className="mb-0">状态</FieldLabel>
              <Select value="all" onChange={() => undefined} aria-label="状态">
                <option value="all">全部</option>
                <option value="published">已发布</option>
                <option value="draft">草稿</option>
              </Select>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button>主要操作</Button>
              <Button variant="secondary">辅助操作</Button>
              <Button variant="outline">边界操作</Button>
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                删除
              </Button>
            </div>
          </div>
          <div className="space-y-4">
            <Alert tone="success">保存完成，后台状态已经刷新。</Alert>
            <Alert tone="warning">同步任务仍在运行，请等待当前批次结束。</Alert>
            <div className="flex items-center gap-3 rounded-3xl bg-muted/42 p-4 shadow-inner shadow-shadow-inset">
              <Checkbox checked aria-label="选择同步状态" />
              <span className="text-sm">启用软 UI 状态</span>
              <Switch className="ml-auto" checked aria-label="启用软 UI 状态" />
            </div>
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">概览</TabsTrigger>
                <TabsTrigger value="logs">日志</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="mt-3 text-sm text-muted-foreground">
                当前状态稳定，可继续操作。
              </TabsContent>
              <TabsContent value="logs" className="mt-3 text-sm text-muted-foreground">
                没有新的错误日志。
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>内容列表</CardTitle>
            <CardDescription>紧凑展示最近的后台记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <SoftDataTable />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>空状态与加载</CardTitle>
            <CardDescription>保持页面可读，不打断当前操作。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <EmptyState title="暂无活动" description="当前还没有可展示的后台活动记录。" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive
        title="删除访问令牌"
        description="此令牌会立即撤销，依赖它的脚本或服务将无法继续访问。"
        confirmLabel="删除令牌"
        onConfirm={() => undefined}
      />
    </div>
  );
}

function ResizableSidebarHandleFrame() {
  const [width, setWidth] = useState(272);
  const fileTreeItems = Array.from({ length: 16 }, (_, index) => ({
    count: index === 0 ? "2 项" : index % 5 === 0 ? "3 项" : "md",
    id: `content-posts-tree-item-${index}`,
    isActive: index === 2,
    isDirectory: index % 5 === 0,
    name: index % 5 === 0 ? `series-${index}` : `react-hooks-deep-dive-${index}.md`,
  }));
  const commitWidth = (nextWidth: number) => {
    setWidth(Math.min(460, Math.max(232, Math.round(nextWidth))));
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLHRElement>) => {
    const step = event.shiftKey ? 32 : 12;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitWidth(width - step);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      commitWidth(width + step);
    }
    if (event.key === "Home") {
      event.preventDefault();
      commitWidth(232);
    }
    if (event.key === "End") {
      event.preventDefault();
      commitWidth(460);
    }
  };

  return (
    <div
      className="admin-app-shell-grid grid min-h-[520px] w-full grid-cols-1"
      style={{ "--admin-sidebar-width": `${width}px` } as CSSProperties}
    >
      <aside className="hidden min-h-0 p-4 lg:block">
        <div className="admin-sidebar-card relative h-full overflow-hidden rounded-[2rem] bg-card/74 p-4 pr-5 shadow-xl shadow-shadow-soft ring-1 ring-border/54">
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div>
              <div className="text-sm font-semibold">文件浏览器</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                浏览内容源，打开要编辑的文件。
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-y border-border/54 text-sm">
              <div className="shrink-0 border-b border-border/54 py-3">
                <div className="font-medium">文件浏览器</div>
                <div className="text-xs text-muted-foreground">content/posts</div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-4">
                <div className="grid min-w-0 shrink-0 gap-2 pb-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <Button size="sm" variant="outline" aria-label="新建文件">
                      <FilePlus2 className="size-4" />
                    </Button>
                    <Button size="sm" variant="outline" aria-label="新建目录">
                      <FolderPlus className="size-4" />
                    </Button>
                    <Button size="sm" variant="outline" aria-label="上级目录">
                      <FolderUp className="size-4" />
                    </Button>
                    <Button size="sm" variant="outline" aria-label="刷新">
                      <RefreshCcw className="size-4" />
                    </Button>
                  </div>
                  <div className="min-w-0 truncate rounded-2xl bg-muted/32 px-3 py-2 text-xs text-muted-foreground">
                    content/posts
                  </div>
                </div>
                <div className="admin-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                  {fileTreeItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-2xl px-3 py-2 ${
                        item.isActive ? "bg-primary/10 text-primary" : "text-foreground/88"
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {item.isDirectory ? (
                          <>
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                            <Folder className="size-4 shrink-0 text-primary" />
                          </>
                        ) : (
                          <>
                            <span className="block size-4 shrink-0" />
                            <span
                              className={`relative inline-flex size-5 shrink-0 items-center justify-center ${
                                item.isActive ? "text-primary" : "text-muted-foreground"
                              }`}
                            >
                              <FileText className="size-5" />
                              <span className="absolute bottom-[0.1rem] left-1/2 -translate-x-1/2 text-[0.34rem] font-bold uppercase leading-none">
                                md
                              </span>
                            </span>
                          </>
                        )}
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      </span>
                      {item.isDirectory ? (
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                          {item.count}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-auto border-t border-border/54 pt-4 text-sm">
              侧栏宽度：{width}px
            </div>
          </div>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <hr
                  tabIndex={0}
                  className="admin-sidebar-resize-handle"
                  aria-label="调整侧边栏宽度，双击恢复默认宽度"
                  aria-orientation="vertical"
                  aria-valuemin={232}
                  aria-valuemax={460}
                  aria-valuenow={width}
                  aria-valuetext={`${width}px`}
                  onDoubleClick={() => commitWidth(272)}
                  onKeyDown={handleKeyDown}
                />
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                拖动调整侧栏宽度，双击恢复默认
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </aside>
      <div className="min-w-0 p-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>文章编辑器</CardTitle>
            <CardDescription>侧栏宽度变化时，编辑区保持完整可用。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-3xl bg-muted/42 p-5 text-sm text-muted-foreground">
              当前工作区会随侧栏宽度调整。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EditorTabOverflowFrame() {
  const [activeTabId, setActiveTabId] = useState("tab-2");
  const [tabs, setTabs] = useState([
    { id: "tab-1", label: "React Hooks 深度解析", dirty: false },
    { id: "tab-2", label: "电子负载开发笔记", dirty: true, temporary: true },
    { id: "tab-3", label: "使用 CH335F 构建一个支持独立供电的 2A2C USB HUB", dirty: false },
    { id: "tab-4", label: "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新", dirty: false },
    { id: "tab-5", label: "学习笔记：电子负载实现原理", dirty: false },
  ]);

  return (
    <div className="mx-auto max-w-[880px] overflow-hidden rounded-3xl border border-border/58 bg-card/80 shadow-xl shadow-shadow-soft">
      <EditorTabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={setActiveTabId}
        onClose={(tabId) => {
          setTabs((current) => current.filter((tab) => tab.id !== tabId));
          if (activeTabId === tabId) {
            setActiveTabId(tabs.find((tab) => tab.id !== tabId)?.id ?? null);
          }
        }}
      />
      <div className="p-5 text-sm text-muted-foreground">
        {tabs.find((tab) => tab.id === activeTabId)?.label ?? "未选择文件"}
      </div>
    </div>
  );
}

export const Primitives: Story = {
  render: () => <PrimitiveGallery />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const primaryAction = canvas.getByRole("button", { name: "主要操作" });
    const searchField = canvas.getByLabelText("搜索内容");
    const statusField = canvas.getByLabelText("状态");
    const stateCheckbox = canvas.getByLabelText("选择同步状态");
    const overviewTab = canvas.getByRole("tab", { name: "概览" });
    await expect(primaryAction).toHaveClass("admin-button");
    await expect(statusField).toHaveClass("admin-field-control");
    expect(primaryAction.getBoundingClientRect().height).toBe(32);
    expect(statusField.getBoundingClientRect().height).toBe(32);
    expect(
      Math.abs(searchField.getBoundingClientRect().top - statusField.getBoundingClientRect().top)
    ).toBeLessThanOrEqual(1);
    expect(stateCheckbox.getBoundingClientRect().height).toBe(28);
    expect(overviewTab.getBoundingClientRect().height).toBe(28);
    await userEvent.click(canvas.getByRole("button", { name: "删除" }));
    await expect(
      within(document.body).getByRole("dialog", { name: "删除访问令牌" })
    ).toBeInTheDocument();
  },
};

export const DesktopShell: Story = {
  render: () => <SoftPageFrame />,
};

export const ResizableSidebarHandle: Story = {
  render: () => <ResizableSidebarHandleFrame />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const separator = canvas.getByRole("separator", { name: /调整侧边栏宽度/ });
    await expect(separator).toHaveAttribute("aria-valuenow", "272");
    separator.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(separator).toHaveAttribute("aria-valuenow", "284");
    await userEvent.dblClick(separator);
    await expect(separator).toHaveAttribute("aria-valuenow", "272");
  },
};

export const EditorTabOverflow: Story = {
  render: () => <EditorTabOverflowFrame />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const strip = canvas.getByTestId("editor-tab-strip");
    await expect(strip).toBeInTheDocument();
    await expect(strip).toHaveClass(/h-12/);
    await userEvent.hover(canvas.getByRole("tab", { name: /电子负载开发笔记/ }));
    await expect(await canvas.findByRole("tooltip")).toHaveTextContent("电子负载开发笔记，未保存");
    await userEvent.click(canvas.getByRole("button", { name: "展开已打开文件列表" }));
    await expect(await canvas.findByTestId("editor-tab-overflow-list")).toHaveTextContent(
      "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新"
    );
  },
};

export const MobileShell: Story = {
  parameters: {
    adminFullscreen: true,
    viewport: {
      options: {
        adminMobile: {
          name: "Admin mobile 390 × 844",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
      },
    },
  },
  globals: {
    viewport: { value: "adminMobile", isRotated: false },
  },
  render: () => <MobileDashboardFrame />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shellMain = canvas.getByTestId("admin-shell-main");
    const navigationButton = canvas.getByRole("button", { name: "打开导航" });

    await expect(canvas.getByRole("heading", { name: "管理员仪表盘" })).toBeVisible();
    await expect(canvas.getByText("/dashboard")).toBeVisible();
    await expect(navigationButton).toHaveClass("admin-button-icon");
    expect(navigationButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(navigationButton.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(shellMain.scrollWidth).toBeLessThanOrEqual(shellMain.clientWidth);
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);

    await userEvent.click(navigationButton);
    const dialog = await within(document.body).findByRole("dialog", { name: "后台导航" });
    const closeButton = within(dialog).getByRole("button", { name: "关闭" });
    expect(closeButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(closeButton.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(closeButton);
    await expect(dialog).not.toBeInTheDocument();
  },
};

export const DialogState: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle className="px-6 pt-6 text-xl font-semibold">确认批量操作</DialogTitle>
        <div className="px-6 py-4 text-sm text-muted-foreground">
          将对 3 篇文章执行发布。此操作会立即提交到后台。
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6">
          <Button variant="outline">取消</Button>
          <Button>确认执行</Button>
        </div>
      </DialogContent>
    </Dialog>
  ),
};
