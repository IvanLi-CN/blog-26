import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BrainCircuit,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  Menu,
  RefreshCcw,
  Search,
  Shield,
} from "lucide-react";
import { useState } from "react";
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
          <div className="text-xs text-muted-foreground">Blog Console</div>
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
          ["内容源", "3", "local · webdav · database", "success"],
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
          <CardTitle>Controls</CardTitle>
          <CardDescription>
            Buttons, inputs, selects, toggles, tabs, and semantic states.
          </CardDescription>
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
              <Checkbox checked aria-label="选择示例" />
              <span className="text-sm">启用软 UI 状态</span>
              <Switch className="ml-auto" checked aria-label="开关示例" />
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
            <CardTitle>Data table</CardTitle>
            <CardDescription>Dense but soft list treatment.</CardDescription>
          </CardHeader>
          <CardContent>
            <SoftDataTable />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Empty and loading</CardTitle>
            <CardDescription>Reusable non-blocking states.</CardDescription>
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
