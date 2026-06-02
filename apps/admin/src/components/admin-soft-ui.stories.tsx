import type { Meta, StoryObj } from "@storybook/react-vite";
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
  Menu,
  RefreshCcw,
  Search,
  Shield,
} from "lucide-react";
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
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
    (Story) => (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function SoftPageFrame({ mobile = false }: { mobile?: boolean }) {
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

  if (mobile) {
    return (
      <div className="mx-auto max-w-[390px] overflow-hidden rounded-[2rem] border border-border/54 bg-background shadow-2xl shadow-shadow-strong">
        <div className="flex items-center justify-between border-b border-border/48 bg-background/84 px-4 py-3">
          <Button variant="outline" size="icon">
            <Menu className="size-4" />
          </Button>
          <div className="text-sm font-semibold">管理后台</div>
          <Button variant="outline" size="icon">
            <Shield className="size-4" />
          </Button>
        </div>
        <div className="p-4">{content}</div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[820px] grid-cols-[272px_minmax(0,1fr)] gap-6">
      {sidebar}
      <div className="min-w-0 px-2 py-2">{content}</div>
    </div>
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
          <div className="space-y-3">
            <FieldLabel>搜索</FieldLabel>
            <div className="flex gap-2">
              <Input placeholder="标题、slug、正文关键字" />
              <Button>
                <Search className="size-4" />
                搜索
              </Button>
            </div>
            <Select value="all" onChange={() => undefined} aria-label="状态">
              <option value="all">全部</option>
              <option value="published">已发布</option>
              <option value="draft">草稿</option>
            </Select>
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

export const Primitives: Story = {
  render: () => <PrimitiveGallery />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "删除" }));
    await expect(canvas.getByRole("dialog", { name: "删除访问令牌" })).toBeInTheDocument();
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

export const MobileShell: Story = {
  render: () => <SoftPageFrame mobile />,
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
