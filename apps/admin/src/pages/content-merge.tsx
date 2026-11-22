import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileMinus2,
  FilePlus2,
  FileText,
  Folder,
  GitMerge,
  Paperclip,
  RefreshCcw,
  Save,
  StickyNote,
  Upload,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adminApi,
  type ContentRepoActionPayload,
  type ContentRepoDiffPayload,
  type ContentRepoSyncItem,
} from "@/lib/admin-api-client";
import { useAppShellSidebar } from "~/components/app-shell";
import { ContentMediaCompare } from "~/components/content-media-compare";
import { ContentMergeEditor } from "~/components/content-merge-editor";
import type { ContentMergeHandle } from "~/components/content-merge-handle";
import { ContentSplitMerge } from "~/components/content-split-merge";
import { ContentThreeWayMerge } from "~/components/content-three-way-merge";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Disclosure,
  EmptyState,
  Separator,
  Spinner,
} from "~/components/ui";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

const STATE_LABEL: Record<ContentRepoSyncItem["state"], string> = {
  synced: "已同步",
  "to-push": "待推送",
  "to-pull": "待拉取",
  "remote-new": "远端新增",
  "remote-deleted": "远端删除",
  "merge-conflict": "需要合并",
};

type FileRow = {
  key: string;
  path: string;
  label: "文章" | "闪念" | "附件";
  item: ContentRepoSyncItem;
  media?: { path: string; missing: boolean };
};

/** One row per file, flattened in directory-tree order. */
function buildFileRows(items: ContentRepoSyncItem[]): FileRow[] {
  const rows = new Map<string, FileRow>();
  for (const item of items) {
    if (rows.has(item.path)) continue;
    rows.set(item.path, {
      key: item.path,
      path: item.path,
      label: item.kind === "memo" ? "闪念" : "文章",
      item,
    });
  }
  for (const item of items) {
    for (const mediaPath of [...item.missingMedia, ...item.changedMedia]) {
      if (rows.has(mediaPath)) continue;
      rows.set(mediaPath, {
        key: mediaPath,
        path: mediaPath,
        label: "附件",
        item,
        media: { path: mediaPath, missing: item.missingMedia.includes(mediaPath) },
      });
    }
  }
  return [...rows.values()].sort((left, right) =>
    left.path.localeCompare(right.path, "en", { numeric: true })
  );
}

function rowNeedsAttention(row: FileRow) {
  if (row.media) return true;
  return row.item.state !== "synced";
}

function useInView<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !enabled || !ref.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [enabled, seen]);
  return { ref, seen };
}

function VirtualList<T>({
  items,
  height,
  rowHeight = 38,
  render,
}: {
  items: T[];
  height: number;
  rowHeight?: number;
  render: (item: T, index: number) => ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 6;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(height / rowHeight) + overscan * 2;
  const slice = items.slice(start, start + visible);
  return (
    <div
      className="overflow-auto"
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${start * rowHeight}px)` }}>
          {slice.map((item, index) => render(item, start + index))}
        </div>
      </div>
    </div>
  );
}

const STATUS_ICON: Record<ContentRepoSyncItem["state"], typeof Check> = {
  synced: Check,
  "to-push": Upload,
  "to-pull": Download,
  "remote-new": FilePlus2,
  "remote-deleted": FileMinus2,
  "merge-conflict": GitMerge,
};

const STATUS_TONE: Record<ContentRepoSyncItem["state"], string> = {
  synced: "text-success",
  "to-push": "text-primary",
  "to-pull": "text-accent-foreground",
  "remote-new": "text-warning",
  "remote-deleted": "text-destructive",
  "merge-conflict": "text-destructive",
};

const STATUS_ORDER: ContentRepoSyncItem["state"][] = [
  "merge-conflict",
  "to-pull",
  "to-push",
  "remote-new",
  "remote-deleted",
  "synced",
];

function StatusChip({
  status,
  count,
  title,
}: {
  status: ContentRepoSyncItem["state"];
  count?: number;
  title?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${STATUS_TONE[status]}`}
      title={title ?? STATE_LABEL[status]}
    >
      <Icon className="size-3" />
      {typeof count === "number" && count > 0 ? <span>{count}</span> : null}
    </span>
  );
}

function FileStatusMarker({ row, conflicts }: { row: FileRow; conflicts: number | null }) {
  if (row.media) return <StatusChip status="merge-conflict" title="二进制文件存在冲突" />;
  if (row.item.state === "merge-conflict")
    return <StatusChip status="merge-conflict" count={conflicts ?? undefined} />;
  if (row.item.state === "synced") return <StatusChip status="synced" title="无冲突" />;
  return <StatusChip status={row.item.state} />;
}

function dirStatusSummary(
  node: TreeNode,
  conflicts: Record<string, number>,
  saved: (row: FileRow) => boolean
) {
  const counts = new Map<ContentRepoSyncItem["state"], number>();
  const walk = (current: TreeNode) => {
    if (current.type === "file" && current.row) {
      const row = current.row;
      if (saved(row)) {
        counts.set("synced", (counts.get("synced") ?? 0) + 1);
        return;
      }
      if (row.media) {
        counts.set("merge-conflict", (counts.get("merge-conflict") ?? 0) + 1);
        return;
      }
      if (row.item.state === "merge-conflict") {
        const count = conflicts[row.path] ?? 1;
        counts.set("merge-conflict", (counts.get("merge-conflict") ?? 0) + count);
        return;
      }
      counts.set(row.item.state, (counts.get(row.item.state) ?? 0) + 1);
      return;
    }
    for (const child of current.children) walk(child);
  };
  walk(node);
  return counts;
}

function FileCard({
  row,
  mode,
  onModeChange,
  onCount,
  onSave,
  onAdopt,
  onMerge,
  onPush,
  onPull,
  onAccept,
  onRemove,
  busy,
}: {
  row: FileRow;
  mode: "inline" | "split" | "three";
  onModeChange: (mode: "inline" | "split" | "three") => void;
  onCount: (path: string, count: number) => void;
  onSave: (path: string, text: string) => void;
  onAdopt: (path: string, media: string) => void;
  onMerge: (path: string) => void;
  onPush: (path: string) => void;
  onPull: (path: string) => void;
  onAccept: (path: string) => void;
  onRemove: (path: string) => void;
  busy: boolean;
}) {
  const { ref, seen } = useInView<HTMLDivElement>(true);
  const handle = useRef<ContentMergeHandle | null>(null);

  const diff = useQuery({
    queryKey: ["content-repo", "diff", row.path],
    queryFn: () => adminApi.getContentRepoDiff(row.path),
    enabled: seen && !row.media,
  });
  const media = useQuery({
    queryKey: ["content-repo", "media", row.item.path, row.media?.path],
    queryFn: () => adminApi.getContentRepoMedia(row.item.path),
    enabled: seen && Boolean(row.media),
  });

  useEffect(() => {
    if (!diff.data || diff.data.status !== "ready") return;
    const conflicts = (diff.data.conflictingFields?.length ?? 0) + (diff.data.bodyConflicts ?? 0);
    onCount(row.path, conflicts);
  }, [diff.data, onCount, row.path]);

  const mediaItems = (media.data?.items ?? []).filter((item) => item.path === row.media?.path);

  return (
    <div ref={ref}>
      <Card data-testid={`file-card-${row.path}`}>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 text-muted-foreground" />
              {row.path}
            </CardTitle>
            <CardDescription>
              {row.media
                ? `附件文件 · 所属 ${row.item.path} · ${row.media.missing ? "本地缺失" : "两侧不同"}`
                : `${STATE_LABEL[row.item.state]} · 基线 ${row.item.baselineHash?.slice(0, 8) ?? "-"} · 远端 ${row.item.remoteSha?.slice(0, 8) ?? "-"}`}
            </CardDescription>
          </div>
          {!row.media ? (
            <Button
              size="lg"
              onClick={() => {
                const text = handle.current?.getText();
                if (text !== undefined) onSave(row.path, text);
              }}
              disabled={!diff.data || diff.data.status !== "ready"}
            >
              <Save />
              保存到内容库
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {row.media ? (
            media.isLoading ? (
              <Spinner />
            ) : mediaItems.length ? (
              <ContentMediaCompare
                items={mediaItems}
                busy={busy}
                onAdopt={(mediaPath) => onAdopt(row.item.path, mediaPath)}
              />
            ) : (
              <EmptyState title="附件暂不可预览" description="远端没有提供这个文件的可读版本。" />
            )
          ) : diff.isLoading ? (
            <Spinner />
          ) : (
            <ContentRepoDiffView
              diff={diff.data}
              mode={mode}
              onModeChange={onModeChange}
              onReady={(next) => {
                handle.current = next;
              }}
            />
          )}
          <Separator />
          <div className="flex flex-wrap gap-2">
            {!row.media && row.item.state === "merge-conflict" ? (
              <Button onClick={() => onMerge(row.path)}>尝试自动合并</Button>
            ) : null}
            {!row.media && row.item.state === "to-pull" ? (
              <Button onClick={() => onPull(row.path)}>拉取到内容库</Button>
            ) : null}
            {!row.media && row.item.state === "to-push" ? (
              <Button onClick={() => onPush(row.path)}>推送到仓库</Button>
            ) : null}
            {!row.media && row.item.state === "remote-new" ? (
              <Button onClick={() => onAccept(row.path)}>接受远端新增</Button>
            ) : null}
            {!row.media && row.item.state === "remote-deleted" ? (
              <Button variant="destructive" onClick={() => onRemove(row.path)}>
                确认远端删除
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TextPane({ title, text }: { title: string; text: string | null | undefined }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <pre className="max-h-80 overflow-auto rounded-2xl bg-muted/46 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
        {text ?? "（无内容）"}
      </pre>
    </div>
  );
}

export function ContentRepoDiffView({
  diff,
  onReady,
  mode,
  onModeChange,
}: {
  diff: ContentRepoDiffPayload | undefined;
  onReady?: (handle: ContentMergeHandle) => void;
  mode: "inline" | "split" | "three";
  onModeChange: (mode: "inline" | "split" | "three") => void;
}) {
  if (!diff) return null;
  if (diff.status !== "ready")
    return <Alert tone="warning">{diff.message ?? "差异暂不可用"}</Alert>;
  const modeSwitcher = (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {(
        [
          ["inline", "行内"],
          ["split", "双栏"],
          ["three", "三路"],
        ] as const
      ).map(([value, label]) => (
        <Button
          key={value}
          size="sm"
          variant={mode === value ? "default" : "outline"}
          aria-pressed={mode === value}
          onClick={() => onModeChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
  return (
    <div className="space-y-3" data-testid="content-repo-diff">
      {mode === "inline" ? (
        <ContentMergeEditor
          localText={diff.localText ?? ""}
          remoteText={diff.remoteText ?? ""}
          onReady={onReady}
          trailing={modeSwitcher}
        />
      ) : mode === "split" ? (
        <ContentSplitMerge
          localText={diff.localText ?? ""}
          remoteText={diff.remoteText ?? ""}
          onReady={onReady}
          trailing={modeSwitcher}
        />
      ) : (
        <ContentThreeWayMerge
          regions={diff.regions ?? []}
          localText={diff.localText ?? ""}
          remoteText={diff.remoteText ?? ""}
          onReady={onReady}
          trailing={modeSwitcher}
        />
      )}
      <Disclosure summary="基线（共同祖先）">
        <div className="mt-2">
          <TextPane title="基线" text={diff.baseText} />
        </div>
      </Disclosure>
      {diff.mergedText ? <TextPane title="合并预览" text={diff.mergedText} /> : null}
    </div>
  );
}

function actionSummary(result: ContentRepoActionPayload) {
  const parts = [result.status];
  if (result.merged?.length) parts.push(`已合并 ${result.merged.length}`);
  if (result.paths?.length) parts.push(`已处理 ${result.paths.length}`);
  if (result.conflicts?.length) parts.push(`冲突 ${result.conflicts.length}`);
  if (result.message) parts.push(result.message);
  return parts.join(" · ");
}

type TreeNode = {
  type: "dir" | "file";
  name: string;
  path: string;
  children: TreeNode[];
  row?: FileRow;
};

/** Build the directory tree from file rows, in tree order. */
function buildTree(rows: FileRow[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const index = new Map<string, TreeNode>();
  for (const row of rows) {
    const segments = row.path.split("/");
    let children = roots;
    let prefix = "";
    segments.forEach((segment, position) => {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      const last = position === segments.length - 1;
      let node = index.get(prefix);
      if (!node) {
        node = {
          type: last ? "file" : "dir",
          name: segment,
          path: prefix,
          children: [],
          row: last ? row : undefined,
        };
        index.set(prefix, node);
        children.push(node);
      } else if (last) {
        node.type = "file";
        node.row = row;
      }
      children = node.children;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((left, right) =>
      left.type === right.type
        ? left.name.localeCompare(right.name, "en", { numeric: true })
        : left.type === "dir"
          ? -1
          : 1
    );
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

function collectDirPaths(nodes: TreeNode[], out: string[] = []) {
  for (const node of nodes) {
    if (node.type === "dir") {
      out.push(node.path);
      collectDirPaths(node.children, out);
    }
  }
  return out;
}

type FlatNode = { node: TreeNode; depth: number };

function flattenTree(nodes: TreeNode[], expanded: Set<string>, depth = 0, out: FlatNode[] = []) {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.type === "dir" && expanded.has(node.path))
      flattenTree(node.children, expanded, depth + 1, out);
  }
  return out;
}

function DirRow({
  node,
  depth,
  open,
  onToggle,
  statuses,
}: {
  node: TreeNode;
  depth: number;
  open: boolean;
  onToggle: () => void;
  statuses: Map<ContentRepoSyncItem["state"], number>;
}) {
  return (
    <Button
      variant="row"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 rounded-none px-2 text-left text-xs font-medium hover:bg-muted/50"
      style={{ height: 36, paddingLeft: 6 + depth * 12 }}
      title={node.path}
      aria-expanded={open}
    >
      {open ? (
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{node.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1 pr-2">
        {STATUS_ORDER.map((status) =>
          (statuses.get(status) ?? 0) > 0 ? (
            <StatusChip key={status} status={status} count={statuses.get(status)} />
          ) : null
        )}
      </span>
    </Button>
  );
}

function FileTreeRow({
  row,
  depth,
  conflicts,
  saved,
  onSelect,
}: {
  row: FileRow;
  depth: number;
  conflicts: number | null;
  saved: boolean;
  onSelect: () => void;
}) {
  const name = row.path.split("/").pop() ?? row.path;
  const Icon = row.media ? Paperclip : row.item.kind === "memo" ? StickyNote : FileText;
  return (
    <Button
      variant="row"
      onClick={onSelect}
      className="flex w-full items-center gap-1.5 rounded-none px-2 text-left text-xs hover:bg-muted/50"
      style={{ height: 36, paddingLeft: 6 + depth * 12 + 18 }}
      title={row.path}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-foreground">{name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1 pr-2">
        {saved ? (
          <span title="已保存到内容库" className="text-success">
            <Check className="size-4" />
          </span>
        ) : (
          <FileStatusMarker row={row} conflicts={conflicts} />
        )}
      </span>
    </Button>
  );
}

interface SavedMark {
  contentHash: string;
  remoteSha: string | null;
}

export function ContentMergePage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"inline" | "split" | "three">("inline");
  const [conflicts, setConflicts] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<Record<string, SavedMark>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [snapshot, setSnapshot] = useState<ContentRepoSyncItem[] | null>(null);

  const status = useQuery({
    queryKey: ["content-repo", "status"],
    queryFn: adminApi.getContentRepoStatus,
  });
  const check = useQuery({
    queryKey: ["content-repo", "check"],
    queryFn: adminApi.checkContentRepo,
  });

  useEffect(() => {
    if (!snapshot && check.data?.items) setSnapshot(check.data.items);
  }, [check.data, snapshot]);

  const liveItems = useMemo(
    () => new Map((check.data?.items ?? []).map((item) => [item.path, item])),
    [check.data]
  );
  const rows = useMemo(() => {
    const base = buildFileRows(snapshot ?? []);
    return base.map((row) => {
      const live = liveItems.get(row.item.path);
      if (!live) return row;
      return { ...row, item: { ...row.item, state: live.state } };
    });
  }, [snapshot, liveItems]);
  const actionable = rows.filter(rowNeedsAttention);
  const tree = useMemo(() => buildTree(rows), [rows]);
  const flatTree = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  useEffect(() => {
    const dirs = collectDirPaths(tree);
    if (!dirs.length) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const dir of dirs) next.add(dir);
      return next;
    });
  }, [tree]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["content-repo"] });
  };
  const onSuccess = async (result: ContentRepoActionPayload) => {
    setNotice(actionSummary(result));
    await refresh();
  };
  const onError = (error: unknown) => setNotice(getErrorMessage(error));

  const adoptMedia = useMutation({
    mutationFn: (input: { path: string; media: string }) => adminApi.adoptRemoteMedia(input),
    onSuccess: async (result) => {
      setNotice(
        result.status === "saved"
          ? `已采用远端附件：${result.mediaPath ?? ""}`
          : (result.message ?? result.status)
      );
      await refresh();
    },
    onError,
  });
  const resolve = useMutation({
    mutationFn: (input: { path: string; text: string; remoteSha: string | null }) =>
      adminApi.resolveContentRepo({ path: input.path, text: input.text }),
    onSuccess: async (result, input) => {
      setNotice(
        result.status === "saved"
          ? `已保存到内容库：${result.path}`
          : (result.message ?? result.status)
      );
      if (result.status === "saved" && result.contentHash) {
        setSaved((current) => ({
          ...current,
          [input.path]: { contentHash: result.contentHash as string, remoteSha: input.remoteSha },
        }));
      }
      await refresh();
    },
    onError,
  });
  const merge = useMutation({
    mutationFn: (input: { ids?: string[] }) => adminApi.mergeContentRepo(input),
    onSuccess,
    onError,
  });
  const push = useMutation({
    mutationFn: (input: { ids?: string[] }) => adminApi.pushContentRepo(input),
    onSuccess,
    onError,
  });
  const pull = useMutation({
    mutationFn: (input: { ids?: string[] }) => adminApi.pullContentRepo(input),
    onSuccess,
    onError,
  });
  const accept = useMutation({
    mutationFn: (input: { paths?: string[] }) => adminApi.acceptRemoteContent(input),
    onSuccess,
    onError,
  });
  const remove = useMutation({
    mutationFn: (input: { paths?: string[] }) => adminApi.removeRemoteDeletedContent(input),
    onSuccess,
    onError,
  });

  const isSavedRow = useCallback(
    (row: FileRow) =>
      Boolean(
        saved[row.path] &&
          saved[row.path].contentHash ===
            (liveItems.get(row.item.path)?.localHash ?? row.item.localHash) &&
          saved[row.path].remoteSha === row.item.remoteSha
      ),
    [liveItems, saved]
  );

  const onCount = (path: string, count: number) =>
    setConflicts((current) => (current[path] === count ? current : { ...current, [path]: count }));

  const resync = useCallback(async () => {
    const result = await check.refetch();
    const items = result.data?.items;
    if (items) {
      setSnapshot(items);
      const byPath = new Map(items.map((item) => [item.path, item]));
      setSaved((current) => {
        const next: Record<string, SavedMark> = {};
        for (const [path, mark] of Object.entries(current)) {
          const item = byPath.get(path);
          if (!item) continue;
          if (item.remoteSha !== mark.remoteSha) continue;
          if (item.localHash && item.localHash !== mark.contentHash) continue;
          next[path] = mark;
        }
        return next;
      });
    }
    await status.refetch();
    await queryClient.invalidateQueries({ queryKey: ["content-repo", "diff"] });
  }, [check, queryClient, status]);

  const sidebarPanel = useMemo(
    () => ({
      label: "内容仓库",
      description: `${status.data?.repository ?? "-"} · ${status.data?.ref ?? "-"}`,
      preferredMode: "route" as const,
      content: (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <span className="text-xs text-muted-foreground">待处理 {actionable.length}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void resync()}
              disabled={check.isFetching}
            >
              {check.isFetching ? <Spinner /> : <RefreshCcw />}
              重新同步
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {check.isLoading ? (
              <Spinner />
            ) : rows.length === 0 ? (
              <EmptyState title="没有内容" description="内容库为空，或尚未建立基线。" />
            ) : (
              <VirtualList
                items={flatTree}
                height={Math.min(flatTree.length * 36 + 4, 620)}
                rowHeight={36}
                render={({ node, depth }) => {
                  if (node.type === "dir" && !node.row) {
                    return (
                      <DirRow
                        node={node}
                        depth={depth}
                        open={expanded.has(node.path)}
                        statuses={dirStatusSummary(node, conflicts, isSavedRow)}
                        onToggle={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(node.path)) next.delete(node.path);
                            else next.add(node.path);
                            return next;
                          })
                        }
                      />
                    );
                  }
                  const row = node.row;
                  if (!row) return null;
                  return (
                    <FileTreeRow
                      row={row}
                      depth={depth}
                      conflicts={conflicts[row.path] ?? null}
                      saved={Boolean(
                        saved[row.path] &&
                          saved[row.path].contentHash ===
                            (liveItems.get(row.item.path)?.localHash ?? row.item.localHash) &&
                          saved[row.path].remoteSha === row.item.remoteSha
                      )}
                      onSelect={() =>
                        document
                          .querySelector(`[data-testid="file-card-${CSS.escape(row.path)}"]`)
                          ?.scrollIntoView({ block: "start", behavior: "smooth" })
                      }
                    />
                  );
                }}
              />
            )}
          </div>
        </div>
      ),
    }),
    [
      actionable.length,
      check.isFetching,
      check.isLoading,
      conflicts,
      expanded,
      flatTree,
      liveItems,
      isSavedRow,
      resync,
      rows,
      saved,
      status.data,
    ]
  );
  useAppShellSidebar(sidebarPanel);

  return (
    <div className="space-y-6">
      <PageHeader
        title="内容差异与合并"
        description="按文件处理本地内容库与内容仓库的差异；保存到内容库后才算解决冲突。"
      />

      {notice ? <Alert tone="default">{notice}</Alert> : null}
      {check.data?.status === "unconfigured" ? (
        <Alert tone="warning">内容仓库未配置：缺少 CONTENT_REPO_TOKEN，编辑与阅读不受影响。</Alert>
      ) : null}
      {check.data?.status === "failed" ? (
        <Alert tone="danger">{check.data.message ?? "检查内容仓库失败"}</Alert>
      ) : null}

      <div className="space-y-4">
        {actionable.length === 0 ? (
          <EmptyState title="没有待处理文件" description="本地内容库与内容仓库一致。" />
        ) : (
          actionable.map((row) => (
            <FileCard
              key={`${row.path}|${row.item.remoteSha ?? "-"}|${row.item.localHash ?? "-"}`}
              row={row}
              mode={mode}
              onModeChange={setMode}
              onCount={onCount}
              onSave={(path, text) => resolve.mutate({ path, text, remoteSha: row.item.remoteSha })}
              onAdopt={(path, media) => adoptMedia.mutate({ path, media })}
              onMerge={(path) => merge.mutate({ ids: [path] })}
              onPush={(path) => push.mutate({ ids: [path] })}
              onPull={(path) => pull.mutate({ ids: [path] })}
              onAccept={(path) => accept.mutate({ paths: [path] })}
              onRemove={(path) => remove.mutate({ paths: [path] })}
              busy={adoptMedia.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}
