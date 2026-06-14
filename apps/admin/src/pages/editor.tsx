import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Code2,
  Columns2,
  Eye,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  FolderUp,
  ImagePlus,
  PenSquare,
  RefreshCcw,
  Save,
  X,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdminApiError,
  type AdminPost,
  adminApi,
  type DataSourceInfo,
  type FileItem,
} from "@/lib/admin-api-client";
import { parseFrontmatterMap, stripFrontmatter } from "@/lib/frontmatter-document";
import { isMemoContentPath } from "@/lib/memo-paths";
import { generateContentUrl } from "@/lib/url-utils";
import { cn } from "@/lib/utils";
import { useAppShellSidebar } from "~/components/app-shell";
import { Alert, Badge, Button, ConfirmDialog, EmptyState, Spinner } from "~/components/ui";
import { UniversalEditor, type UniversalEditorRef } from "~/editor/universal-editor";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

type EditorMode = "wysiwyg" | "source" | "compare";
type TreeItemType = FileItem["type"];

type TreeSelection = {
  source: "local";
  path: string;
  type: TreeItemType;
};

type TreeRenameTarget = TreeSelection & {
  parentPath: string;
  value: string;
};

type DatabaseDraft = {
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  draft: boolean;
  public: boolean;
  source: "local";
  filePath: string;
  isNew?: boolean;
};

type FileDraft = {
  source: "local";
  path: string;
  content: string;
};

type EditorTab = {
  id: string;
  label: string;
  kind: "database" | "file";
  mode: EditorMode;
  dirty: boolean;
  database?: DatabaseDraft;
  file?: FileDraft;
};

const EMPTY_SOURCES: DataSourceInfo[] = [];
const EMPTY_FILE_ITEMS: FileItem[] = [];

function normalizeContentSource(_source?: string | null): "local" {
  return "local";
}

function normalizeArticlePath(path: string | null | undefined, fallbackSlug: string): string {
  const candidate = path?.trim();
  if (candidate) {
    return candidate.replace(/^\/+/, "");
  }
  return `blog/${fallbackSlug || "untitled"}.md`;
}

function toEditorArticlePath(path: string) {
  const normalized = path.replace(/^\/+/, "");
  return normalized ? `/${normalized}` : "/__unknown__.md";
}

function getEditorContext(tab: EditorTab): {
  contentSource: "local";
  articlePath: string;
} {
  if (tab.kind === "file" && tab.file) {
    return {
      contentSource: tab.file.source,
      articlePath: toEditorArticlePath(tab.file.path),
    };
  }

  return {
    contentSource: tab.database?.source ?? "local",
    articlePath: toEditorArticlePath(
      normalizeArticlePath(tab.database?.filePath, tab.database?.slug ?? "untitled")
    ),
  };
}

function buildAttachmentUploadPath(articlePath: string, filename: string) {
  const normalized = articlePath.replace(/^\/+/, "");
  const directory = normalized.includes("/")
    ? normalized.slice(0, normalized.lastIndexOf("/"))
    : "";
  const assetDirectory = directory ? `${directory}/assets` : "assets";
  return `${assetDirectory}/${filename}`;
}

function buildInsertedAttachmentMarkdown(file: File, filename: string) {
  const safeLabel = file.name.replace(/\.[^.]+$/, "") || "attachment";
  const relativePath = `./assets/${filename}`;
  return file.type.startsWith("image/")
    ? `![${safeLabel}](${relativePath})`
    : `[${safeLabel}](${relativePath})`;
}

function deriveFileLabel(path: string, content: string) {
  const frontmatterTitle = parseFrontmatterMap(content).title?.trim() ?? "";
  if (frontmatterTitle) {
    return frontmatterTitle;
  }

  return path.split("/").filter(Boolean).pop() || path || "untitled.md";
}

function deriveTitleFromContent(content: string) {
  const body = stripFrontmatter(content);
  const heading = body.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading) return heading;

  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine) {
    return firstLine.replace(/^#+\s*/, "").slice(0, 80);
  }

  return "Untitled Post";
}

function deriveSlugValue(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `untitled-${Date.now()}`
  );
}

function parseBooleanFrontmatter(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function deriveExcerptFromContent(content: string) {
  return stripFrontmatter(content)
    .replace(/[#*`_~[\]()!-]/g, "")
    .trim()
    .slice(0, 150);
}

function buildAdminPreviewUrl(path: string) {
  const previewUrl = new URL(path, window.location.origin);
  const pathname = previewUrl.pathname.replace(/\/+$/, "");
  if (pathname.startsWith("/posts/")) {
    const slug = pathname.replace(/^\/posts\//, "");
    return `/admin/preview/posts/${slug}`;
  }
  if (pathname.startsWith("/memos/")) {
    const slug = pathname.replace(/^\/memos\//, "");
    return `/admin/preview/memos/${slug}`;
  }
  return `/admin/preview/posts/${pathname.replace(/^\/+/, "")}`;
}

function normalizeTreePath(path: string | null | undefined) {
  return (path ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function getParentTreePath(path: string | null | undefined) {
  const normalized = normalizeTreePath(path);
  if (!normalized) return "";
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function joinTreePath(parentPath: string, name: string) {
  const parent = normalizeTreePath(parentPath);
  const child = name.replace(/^\/+|\/+$/g, "");
  return parent ? `${parent}/${child}` : child;
}

function replaceTreePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  const normalizedPath = normalizeTreePath(path);
  const normalizedOld = normalizeTreePath(oldPrefix);
  const normalizedNew = normalizeTreePath(newPrefix);
  if (normalizedPath === normalizedOld) return normalizedNew;
  if (normalizedOld && normalizedPath.startsWith(`${normalizedOld}/`)) {
    return `${normalizedNew}${normalizedPath.slice(normalizedOld.length)}`;
  }
  return normalizedPath;
}

function deriveBaseDirectory(selection: TreeSelection | null, fallbackPath: string) {
  if (!selection) return normalizeTreePath(fallbackPath);
  return selection.type === "directory"
    ? normalizeTreePath(selection.path)
    : getParentTreePath(selection.path);
}

function deriveUniqueTreeName(items: FileItem[], preferredName: string) {
  const existingNames = new Set(items.map((item) => item.name));
  if (!existingNames.has(preferredName)) return preferredName;

  const dotIndex = preferredName.lastIndexOf(".");
  const stem = dotIndex > 0 ? preferredName.slice(0, dotIndex) : preferredName;
  const extension = dotIndex > 0 ? preferredName.slice(dotIndex) : "";
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem}-${index}${extension}`;
    if (!existingNames.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${extension}`;
}

function getAncestorTreePaths(path: string | null | undefined) {
  const parentPath = getParentTreePath(path);
  if (!parentPath) return [];

  const segments = parentPath.split("/").filter(Boolean);
  const ancestors: string[] = [];
  let currentPath = "";

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    ancestors.push(currentPath);
  }

  return ancestors;
}

function toDirectoryRequestPath(path: string | null | undefined) {
  const normalized = normalizeTreePath(path);
  return normalized ? `/${normalized}/` : "";
}

function isTreePathSelected(
  path: string | null | undefined,
  activePath: string | null | undefined
) {
  return normalizeTreePath(path) === normalizeTreePath(activePath);
}

function getArticleIdentity(source: "local", articlePath: string | null | undefined) {
  return `${source}:${normalizeTreePath(articlePath)}`;
}

function getTabArticleIdentity(tab: EditorTab) {
  const context = getEditorContext(tab);
  return getArticleIdentity(context.contentSource, context.articlePath);
}

function isTreePathAncestor(
  path: string | null | undefined,
  activePath: string | null | undefined
) {
  const normalizedPath = normalizeTreePath(path);
  const normalizedActivePath = normalizeTreePath(activePath);
  if (!normalizedPath || !normalizedActivePath || normalizedPath === normalizedActivePath) {
    return false;
  }

  return normalizedActivePath.startsWith(`${normalizedPath}/`);
}

function deriveDatabaseDraftState(draft: DatabaseDraft, content: string) {
  const frontmatter = parseFrontmatterMap(content);
  const headingTitle = deriveTitleFromContent(content);
  const title = headingTitle || frontmatter.title?.trim() || draft.title.trim() || "未命名文章";
  const slug = frontmatter.slug?.trim() || draft.slug.trim() || deriveSlugValue(title);
  const excerpt = frontmatter.excerpt?.trim() || draft.excerpt || deriveExcerptFromContent(content);

  return {
    title,
    slug,
    excerpt,
    draft: parseBooleanFrontmatter(frontmatter.draft, draft.draft),
    public: parseBooleanFrontmatter(frontmatter.public, draft.public),
  };
}

function isBlankEditorContent(content: string) {
  return stripFrontmatter(content).trim().length === 0;
}

function getEditorActionErrorMessage(error: unknown, fallback?: string) {
  if (error instanceof AdminApiError) {
    if (error.code === "PRECONDITION_FAILED" && error.message.includes("初始化失败")) {
      return "本地内容目录暂时不可写，请检查内容源配置后重试。";
    }
    return getErrorMessage(error);
  }

  return fallback ? `${fallback}${getErrorMessage(error)}` : getErrorMessage(error);
}

function InlineTreeNameInput({
  value,
  type,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  type: TreeItemType;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      aria-label={type === "directory" ? "目录名称" : "文件名称"}
      className="min-w-0 flex-1 rounded-xl border border-primary/35 bg-background px-2 py-1 text-sm text-foreground outline-none ring-2 ring-primary/18"
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

function getFileTypeLabel(extension?: string) {
  const normalizedExtension = (extension || "file").replace(/^\./, "").trim();
  return (normalizedExtension || "file").slice(0, 3).toUpperCase();
}

function TreeFileTypeIcon({ extension, active }: { extension?: string; active: boolean }) {
  const label = getFileTypeLabel(extension);

  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground",
        active && "text-primary"
      )}
      title={`${label} 文件`}
    >
      <FileText className="size-5" />
      <span className="absolute bottom-[0.1rem] left-1/2 -translate-x-1/2 text-[0.34rem] font-bold uppercase leading-none">
        {label}
      </span>
    </span>
  );
}

function EditorSidebarContent({
  selectedSource,
  browserPath,
  onNavigateUp,
  onRefresh,
  sourcesLoading,
  treeLoading,
  rootItems,
  directoryItemsByPath,
  loadingPaths,
  expandedPaths,
  activeItemPath,
  activeItemType,
  activeItemSource,
  editingItem,
  onEditingValueChange,
  onEditingCommit,
  onEditingCancel,
  onDirectoryExpand,
  onFileOpen,
  onCreateFile,
  onCreateDirectory,
}: {
  selectedSource: "local";
  browserPath: string;
  onNavigateUp: () => void;
  onRefresh: () => void;
  sourcesLoading: boolean;
  treeLoading: boolean;
  rootItems: FileItem[];
  directoryItemsByPath: Record<string, FileItem[]>;
  loadingPaths: string[];
  expandedPaths: string[];
  activeItemPath: string | null;
  activeItemType: TreeItemType | null;
  activeItemSource: "local" | null;
  editingItem: TreeRenameTarget | null;
  onEditingValueChange: (value: string) => void;
  onEditingCommit: () => void;
  onEditingCancel: () => void;
  onDirectoryExpand: (item: FileItem) => void;
  onFileOpen: (item: FileItem) => void;
  onCreateFile: () => void;
  onCreateDirectory: () => void;
}) {
  const expandedPathSet = useMemo(
    () => new Set(expandedPaths.map((path) => normalizeTreePath(path))),
    [expandedPaths]
  );
  const loadingPathSet = useMemo(
    () => new Set(loadingPaths.map((path) => normalizeTreePath(path))),
    [loadingPaths]
  );
  const shouldHighlightActiveSource = activeItemSource === selectedSource;

  const renderTreeNodes = useCallback(
    (items: FileItem[], depth = 0) =>
      items.map((item) => {
        const normalizedPath = normalizeTreePath(item.path);
        const isDirectory = item.type === "directory";
        const isExpanded = isDirectory && expandedPathSet.has(normalizedPath);
        const children = isDirectory
          ? (directoryItemsByPath[normalizedPath] ?? EMPTY_FILE_ITEMS)
          : [];
        const hasLoadedChildren =
          isDirectory && Object.hasOwn(directoryItemsByPath, normalizedPath);
        const directoryCount = hasLoadedChildren ? children.length : (item.count ?? 0);
        const isLoadingBranch = isDirectory && loadingPathSet.has(normalizedPath);
        const isActiveDirectory =
          shouldHighlightActiveSource &&
          activeItemType === "directory" &&
          isDirectory &&
          isTreePathSelected(item.path, activeItemPath);
        const isActiveFile =
          shouldHighlightActiveSource &&
          activeItemType !== "directory" &&
          isTreePathSelected(item.path, activeItemPath);
        const isActiveBranch =
          shouldHighlightActiveSource &&
          isDirectory &&
          isTreePathAncestor(item.path, activeItemPath);
        const isEditing =
          editingItem?.source === selectedSource &&
          editingItem.type === item.type &&
          isTreePathSelected(editingItem.path, item.path);

        return (
          <div key={`${item.type}:${item.path}`} className="min-w-0 space-y-1">
            <div
              className={cn(
                "flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-2xl border border-transparent px-3 py-2 text-left text-sm transition",
                !isEditing && "hover:bg-muted/40 hover:text-foreground",
                (isActiveFile || isActiveDirectory) &&
                  "border-primary/35 bg-primary/10 text-primary shadow-sm",
                !isActiveFile &&
                  !isActiveDirectory &&
                  isActiveBranch &&
                  "border-border/35 bg-muted/40 text-foreground",
                !isActiveFile && !isActiveDirectory && !isActiveBranch && "text-foreground/88"
              )}
              style={{ paddingLeft: `${0.65 + depth * 0.45}rem` }}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-2"
                  tabIndex={isEditing ? -1 : 0}
                  onClick={() => (isDirectory ? onDirectoryExpand(item) : onFileOpen(item))}
                >
                  {isDirectory ? (
                    isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )
                  ) : (
                    <span className="block size-4 shrink-0" />
                  )}
                  {isDirectory ? (
                    <Folder
                      className={cn(
                        "size-4 shrink-0",
                        isActiveDirectory || isActiveBranch ? "text-primary" : "text-primary"
                      )}
                    />
                  ) : (
                    <TreeFileTypeIcon extension={item.extension} active={isActiveFile} />
                  )}
                </button>
                {isEditing && editingItem ? (
                  <InlineTreeNameInput
                    value={editingItem.value}
                    type={editingItem.type}
                    onChange={onEditingValueChange}
                    onCommit={onEditingCommit}
                    onCancel={onEditingCancel}
                  />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => (isDirectory ? onDirectoryExpand(item) : onFileOpen(item))}
                  >
                    {item.name}
                  </button>
                )}
              </span>
              {!isEditing && isDirectory ? (
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap text-xs text-muted-foreground",
                    (isActiveFile || isActiveDirectory) && "text-primary/80"
                  )}
                >
                  {`${directoryCount} 项`}
                </span>
              ) : null}
            </div>

            {isDirectory && isExpanded ? (
              <div className="min-w-0 space-y-1">
                {isLoadingBranch && children.length === 0 ? (
                  <div
                    className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${1.35 + depth * 0.45}rem` }}
                  >
                    <Spinner /> 读取目录…
                  </div>
                ) : null}
                {children.length > 0 ? renderTreeNodes(children, depth + 1) : null}
                {!isLoadingBranch && children.length === 0 ? (
                  <div
                    className="px-3 py-1 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${1.35 + depth * 0.45}rem` }}
                  >
                    当前目录为空。
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      }),
    [
      activeItemPath,
      activeItemType,
      directoryItemsByPath,
      editingItem,
      expandedPathSet,
      loadingPathSet,
      onEditingCancel,
      onEditingCommit,
      onEditingValueChange,
      onDirectoryExpand,
      onFileOpen,
      selectedSource,
      shouldHighlightActiveSource,
    ]
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden border-y border-border/54"
      data-testid="editor-file-browser"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/54 py-3">
        <div>
          <div className="font-medium">文件浏览器</div>
          <div className="text-xs text-muted-foreground">浏览内容源，打开要编辑的文件。</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-4">
        <div className="grid min-w-0 shrink-0 gap-2 pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onCreateFile}
              title="新建文件"
              aria-label="新建文件"
            >
              <FilePlus2 className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCreateDirectory}
              title="新建目录"
              aria-label="新建目录"
            >
              <FolderPlus className="size-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={onNavigateUp} disabled={!browserPath}>
              <FolderUp className="size-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCcw className="size-4" />
            </Button>
          </div>
          <div
            className="min-w-0 truncate rounded-2xl bg-muted/32 px-3 py-2 text-xs text-muted-foreground"
            title={browserPath || "根目录"}
          >
            {browserPath || "根目录"}
          </div>
        </div>

        <div className="admin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
          {sourcesLoading || (treeLoading && rootItems.length === 0) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> 读取文件树…
            </div>
          ) : rootItems.length > 0 ? (
            renderTreeNodes(rootItems)
          ) : (
            <div className="text-sm text-muted-foreground">当前目录为空。</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EditorPage() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<"local">("local");
  const [currentPaths, setCurrentPaths] = useState<Record<"local", string>>({
    local: "",
  });
  const [expandedPaths, setExpandedPaths] = useState<Record<"local", string[]>>({
    local: [],
  });
  const [selectedTreeItem, setSelectedTreeItem] = useState<TreeSelection | null>(null);
  const [editingTreeItem, setEditingTreeItem] = useState<TreeRenameTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [closeTargetTabId, setCloseTargetTabId] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [didHandleInitialUrl, setDidHandleInitialUrl] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<UniversalEditorRef | null>(null);

  const sourcesQuery = useQuery({
    queryKey: ["admin-file-sources"],
    queryFn: adminApi.getFileSources,
  });

  useEffect(() => {
    const firstAvailable = (sourcesQuery.data ?? []).find(
      (item) => item.enabled && item.name === "local"
    );
    if (firstAvailable) {
      setSelectedSource("local");
    }
  }, [sourcesQuery.data]);

  const browserPath = currentPaths[selectedSource];
  const availableSources = sourcesQuery.data ?? EMPTY_SOURCES;
  const selectedSourceEnabled = availableSources.some(
    (item) => item.name === selectedSource && item.enabled
  );
  const requestedDirectoryPaths = useMemo(() => {
    const expanded = expandedPaths[selectedSource] ?? [];
    const focusedPath = normalizeTreePath(browserPath);
    return Array.from(
      new Set(["", focusedPath, ...expanded.map((path) => normalizeTreePath(path))])
    );
  }, [browserPath, expandedPaths, selectedSource]);
  const directoryQueries = useQueries({
    queries: requestedDirectoryPaths.map((path) => ({
      queryKey: ["admin-directory-tree", selectedSource, path],
      queryFn: async () => {
        const response = await adminApi.listDirectory(selectedSource, toDirectoryRequestPath(path));
        return response.items;
      },
      enabled: sourcesQuery.isSuccess && selectedSourceEnabled,
      staleTime: 30_000,
    })),
  });

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );
  const activeEditorContext = useMemo(
    () => (activeTab ? getEditorContext(activeTab) : null),
    [activeTab]
  );
  const activeBrowserPath = useMemo(
    () => (activeEditorContext ? normalizeTreePath(activeEditorContext.articlePath) : null),
    [activeEditorContext]
  );
  const visibleTreeSelection =
    selectedTreeItem?.source === selectedSource ? selectedTreeItem : null;
  const activeBrowserSource =
    visibleTreeSelection?.source ?? activeEditorContext?.contentSource ?? null;
  const activeTreePath = visibleTreeSelection?.path ?? activeBrowserPath;
  const activeTreeType = visibleTreeSelection?.type ?? (activeBrowserPath ? "file" : null);
  const activeContent =
    activeTab?.kind === "database"
      ? (activeTab.database?.content ?? "")
      : (activeTab?.file?.content ?? "");

  const upsertPostTab = useCallback((post: AdminPost) => {
    const tabId = `post:${post.id}`;
    const databaseDraft: DatabaseDraft = {
      postId: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt || "",
      content: post.body,
      draft: post.draft,
      public: post.public,
      source: normalizeContentSource(post.source || post.dataSource),
      filePath: normalizeArticlePath(post.filePath, post.slug),
    };
    const derivedDraft = deriveDatabaseDraftState(databaseDraft, databaseDraft.content);
    const targetIdentity = getArticleIdentity(databaseDraft.source, databaseDraft.filePath);
    let nextActiveTabId = tabId;

    setTabs((current) => {
      const existingByIdentity = current.find(
        (tab) => getTabArticleIdentity(tab) === targetIdentity
      );
      const existingDatabase = current.find((tab) => tab.id === tabId);

      if (existingByIdentity && existingByIdentity.kind !== "database") {
        nextActiveTabId = existingByIdentity.id;
        return current;
      }

      const preservedTabs = current.filter(
        (tab) => tab.id !== tabId && getTabArticleIdentity(tab) !== targetIdentity
      );
      const mode =
        existingDatabase?.mode ??
        (existingByIdentity?.kind === "database" ? existingByIdentity.mode : undefined) ??
        "wysiwyg";

      nextActiveTabId = existingByIdentity?.id ?? tabId;

      return [
        ...preservedTabs,
        {
          id: nextActiveTabId,
          label: derivedDraft.title || post.slug || post.id,
          kind: "database",
          mode,
          dirty: false,
          database: {
            ...databaseDraft,
            ...derivedDraft,
          },
        },
      ];
    });
    setActiveTabId(nextActiveTabId);
  }, []);

  const openPostById = useCallback(
    async (id: string) => {
      setLoadingMessage("正在加载文章...");
      setErrorBanner(null);
      try {
        const post = await adminApi.getPost(id);
        upsertPostTab(post);
      } catch (error) {
        setErrorBanner(`未找到文章：${getErrorMessage(error)}`);
      } finally {
        setLoadingMessage(null);
      }
    },
    [upsertPostTab]
  );

  const openPostBySlug = useCallback(
    async (slug: string) => {
      setLoadingMessage("正在加载文章...");
      setErrorBanner(null);
      try {
        const post = await adminApi.getPostBySlug(slug);
        upsertPostTab(post);
      } catch (error) {
        setErrorBanner(`未找到 slug 为 “${slug}” 的文章：${getErrorMessage(error)}`);
      } finally {
        setLoadingMessage(null);
      }
    },
    [upsertPostTab]
  );

  const openFileTab = useCallback(
    async (source: "local", path: string) => {
      const targetIdentity = getArticleIdentity(source, path);
      const existing = tabs.find((tab) => getTabArticleIdentity(tab) === targetIdentity);
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }

      setLoadingMessage("正在加载文章...");
      setErrorBanner(null);
      try {
        const file = await adminApi.readFile(source, path);
        const filePath = normalizeTreePath(file.path || path);
        const fileContent = typeof file.content === "string" ? file.content : "";
        const label = deriveFileLabel(filePath, fileContent);
        const tab: EditorTab = {
          id: `file:${source}:${filePath}`,
          label,
          kind: "file",
          mode: "wysiwyg",
          dirty: false,
          file: {
            source,
            path: filePath,
            content: fileContent,
          },
        };
        setTabs((current) => [...current, tab]);
        setActiveTabId(tab.id);
      } catch (error) {
        setErrorBanner(`未找到文件：${getErrorMessage(error)}`);
      } finally {
        setLoadingMessage(null);
      }
    },
    [tabs]
  );

  const openFromCompatId = useCallback(
    async (id: string) => {
      if (id.startsWith("/")) {
        await openFileTab("local", id);
        return;
      }
      if (id.includes("/") || id.endsWith(".md")) {
        await openFileTab("local", id);
        return;
      }
      await openPostById(id);
    },
    [openFileTab, openPostById]
  );

  useEffect(() => {
    if (didHandleInitialUrl) return;
    setDidHandleInitialUrl(true);
    const search = new URLSearchParams(window.location.search);
    const slug = search.get("slug");
    const id = search.get("id");
    if (slug) {
      void openPostBySlug(slug);
      return;
    }
    if (id) {
      void openFromCompatId(id);
    }
  }, [didHandleInitialUrl, openFromCompatId, openPostBySlug]);

  useEffect(() => {
    if (!activeTab) {
      window.history.replaceState(null, "", "/admin/posts/editor");
      return;
    }

    const params = new URLSearchParams();
    if (activeTab.kind === "database" && activeTab.database) {
      if (activeTab.database.slug) {
        params.set("slug", activeTab.database.slug);
      } else {
        params.set("id", activeTab.database.postId);
      }
    }
    if (activeTab.kind === "file" && activeTab.file) {
      params.set("id", activeTab.file.path);
    }

    const next = params.toString()
      ? `/admin/posts/editor?${params.toString()}`
      : "/admin/posts/editor";
    window.history.replaceState(null, "", next);
  }, [activeTab]);

  useEffect(() => {
    if (!activeEditorContext) {
      return;
    }

    const availableSourceNames = new Set(
      availableSources
        .filter((item) => item.enabled && item.name === "local")
        .map((item) => item.name as "local")
    );

    const preferredSource = availableSourceNames.has(activeEditorContext.contentSource)
      ? activeEditorContext.contentSource
      : availableSourceNames.has("local")
        ? "local"
        : "local";

    const normalizedArticlePath = normalizeTreePath(activeEditorContext.articlePath);
    const parentPath = getParentTreePath(normalizedArticlePath);
    const ancestors = getAncestorTreePaths(normalizedArticlePath);

    setSelectedSource((current) => (current === preferredSource ? current : preferredSource));
    setCurrentPaths((current) =>
      current[preferredSource] === parentPath
        ? current
        : { ...current, [preferredSource]: parentPath }
    );
    setExpandedPaths((current) => {
      const previous = current[preferredSource] ?? [];
      const next = Array.from(new Set([...previous, ...ancestors]));
      if (
        next.length === previous.length &&
        next.every((value, index) => value === previous[index])
      ) {
        return current;
      }
      return { ...current, [preferredSource]: next };
    });
  }, [activeEditorContext, availableSources]);

  const createEmptyDraft = useCallback(() => {
    const seed = Date.now();
    const slug = "";
    const tabId = `draft:${seed}`;
    const tab: EditorTab = {
      id: tabId,
      label: "未命名文章",
      kind: "database",
      mode: "wysiwyg",
      dirty: true,
      database: {
        postId: tabId,
        slug,
        title: "",
        excerpt: "",
        content: "",
        draft: true,
        public: false,
        source: "local",
        filePath: normalizeArticlePath(undefined, `untitled-${seed}`),
        isNew: true,
      },
    };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tabId);
  }, []);

  const updateActiveTab = useCallback(
    (updater: (tab: EditorTab) => EditorTab) => {
      if (!activeTabId) return;
      setTabs((current) => current.map((tab) => (tab.id === activeTabId ? updater(tab) : tab)));
    },
    [activeTabId]
  );

  const updateActiveTabContent = useCallback(
    (nextContent: string) => {
      updateActiveTab((tab) => {
        if (tab.kind === "database" && tab.database) {
          const derivedDraft = deriveDatabaseDraftState(tab.database, nextContent);
          return {
            ...tab,
            label: derivedDraft.title || "未命名文章",
            dirty: true,
            database: { ...tab.database, ...derivedDraft, content: nextContent },
          };
        }
        if (tab.kind === "file" && tab.file) {
          return {
            ...tab,
            dirty: true,
            file: { ...tab.file, content: nextContent },
          };
        }
        return tab;
      });
    },
    [updateActiveTab]
  );

  const syncActiveTabFromEditor = useCallback(() => {
    if (!activeTab) {
      return null;
    }

    const liveContent = editorRef.current?.getContent();
    if (typeof liveContent !== "string") {
      return null;
    }

    const persistedContent =
      activeTab.kind === "database"
        ? (activeTab.database?.content ?? "")
        : (activeTab.file?.content ?? "");

    if (liveContent !== persistedContent) {
      updateActiveTabContent(liveContent);
    }

    return liveContent;
  }, [activeTab, updateActiveTabContent]);

  useEffect(() => {
    if (!activeTab) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      syncActiveTabFromEditor();
    }, 250);

    return () => window.clearInterval(interval);
  }, [activeTab, syncActiveTabFromEditor]);

  async function handleAttachmentUpload(file: File) {
    if (!activeTab || !activeEditorContext) return;

    const { articlePath, contentSource } = activeEditorContext;
    const extension = file.name.split(".").pop() || "bin";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "attachment";
    const safeBaseName = baseName
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const filename = `${safeBaseName || "attachment"}-${nanoid(8)}.${extension}`;
    const uploadPath = buildAttachmentUploadPath(articlePath, filename);

    setUploadPending(true);
    setErrorBanner(null);

    try {
      const response = await fetch(`/api/files/${contentSource}/${uploadPath}`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`上传失败 (${response.status})`);
      }

      const markdown = buildInsertedAttachmentMarkdown(file, filename);
      const prefix = activeContent && !activeContent.endsWith("\n") ? "\n\n" : "";
      updateActiveTabContent(`${activeContent}${prefix}${markdown}`);
      setNotice(`已插入附件：${file.name}`);
    } catch (error) {
      setErrorBanner(getErrorMessage(error));
    } finally {
      setUploadPending(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  }

  function performCloseTab(tabId: string) {
    const remaining = tabs.filter((item) => item.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(remaining[remaining.length - 1]?.id ?? null);
    }
  }

  function requestCloseTab(tabId: string) {
    const tab = tabs.find((item) => item.id === tabId);
    if (tab?.dirty) {
      setCloseTargetTabId(tabId);
      return;
    }
    performCloseTab(tabId);
  }

  async function saveActiveTab() {
    if (!activeTab) return;
    setSavePending(true);
    setErrorBanner(null);
    try {
      if (activeTab.kind === "database" && activeTab.database) {
        const liveContent = syncActiveTabFromEditor() ?? activeTab.database.content;
        const derivedDraft = deriveDatabaseDraftState(activeTab.database, liveContent);
        if (activeTab.database.isNew && isBlankEditorContent(liveContent)) {
          setErrorBanner("内容不能为空，请先输入正文后再保存。");
          return;
        }
        const payload = {
          title: derivedDraft.title,
          slug: derivedDraft.slug,
          excerpt: derivedDraft.excerpt,
          body: liveContent,
          draft: derivedDraft.draft,
          public: derivedDraft.public,
          type: "post",
        };

        if (activeTab.database.isNew) {
          const created = await adminApi.createPost(payload);
          upsertPostTab(created.post);
          setNotice("已创建新草稿。");
          return;
        }

        await adminApi.updatePost(activeTab.database.postId, payload);
        setTabs((current) =>
          current.map((tab) =>
            tab.id === activeTab.id
              ? {
                  ...tab,
                  label: derivedDraft.title,
                  dirty: false,
                  database: tab.database
                    ? {
                        ...tab.database,
                        ...derivedDraft,
                        content: liveContent,
                      }
                    : tab.database,
                }
              : tab
          )
        );
        setNotice("文章保存成功。");
      }

      if (activeTab.kind === "file" && activeTab.file) {
        const liveContent = syncActiveTabFromEditor() ?? activeTab.file.content;
        await adminApi.writeFile({
          source: activeTab.file.source,
          path: activeTab.file.path,
          content: liveContent,
        });
        setTabs((current) =>
          current.map((tab) => (tab.id === activeTab.id ? { ...tab, dirty: false } : tab))
        );
        setNotice("文件保存成功。");
      }
    } catch (error) {
      setErrorBanner(getEditorActionErrorMessage(error));
    } finally {
      setSavePending(false);
    }
  }

  function openPreviewWindow() {
    if (!activeTab || !activeEditorContext) return;

    try {
      if (activeTab.kind === "database" && activeTab.database) {
        const liveContent = syncActiveTabFromEditor() ?? activeTab.database.content;
        const derivedDraft = deriveDatabaseDraftState(activeTab.database, liveContent);
        const url = generateContentUrl(
          "post",
          {
            slug: derivedDraft.slug,
            title: derivedDraft.title,
            type: "post",
          },
          activeEditorContext.articlePath
        );
        window.open(buildAdminPreviewUrl(url), "_blank", "noopener,noreferrer");
        return;
      }

      if (activeTab.kind === "file" && activeTab.file) {
        if (isMemoContentPath(activeTab.file.path)) {
          window.open(
            buildAdminPreviewUrl(generateContentUrl("memo", activeTab.file.path)),
            "_blank",
            "noopener,noreferrer"
          );
          return;
        }

        const parsedFrontmatter = parseFrontmatterMap(activeTab.file.content);
        const frontmatter = {
          ...parsedFrontmatter,
          title: parsedFrontmatter.title || activeTab.label,
        };
        window.open(
          buildAdminPreviewUrl(generateContentUrl("post", frontmatter, activeTab.file.path)),
          "_blank",
          "noopener,noreferrer"
        );
      }
    } catch (error) {
      console.error("预览失败:", error);
      setErrorBanner(getErrorMessage(error));
    }
  }

  const handleDirectoryExpand = useCallback(
    (item: FileItem) => {
      if (item.type !== "directory") return;
      const normalizedPath = normalizeTreePath(item.path);
      setSelectedTreeItem({ source: selectedSource, path: normalizedPath, type: "directory" });
      setCurrentPaths((current) => ({ ...current, [selectedSource]: normalizedPath }));
      setExpandedPaths((current) => {
        const previous = current[selectedSource] ?? [];
        if (previous.includes(normalizedPath)) {
          return {
            ...current,
            [selectedSource]: previous.filter(
              (path) =>
                !isTreePathSelected(path, normalizedPath) &&
                !isTreePathAncestor(normalizedPath, path)
            ),
          };
        }
        return {
          ...current,
          [selectedSource]: [...previous, normalizedPath],
        };
      });
    },
    [selectedSource]
  );

  const handleFileOpen = useCallback(
    (item: FileItem) => {
      if (item.type !== "file") return;
      setSelectedTreeItem({
        source: selectedSource,
        path: normalizeTreePath(item.path),
        type: "file",
      });
      void openFileTab(selectedSource, item.path);
    },
    [openFileTab, selectedSource]
  );

  const navigateUp = useCallback(() => {
    const current = currentPaths[selectedSource];
    if (!current) return;
    const parts = current.split("/").filter(Boolean);
    parts.pop();
    const next = current.startsWith("/") ? `/${parts.join("/")}` : parts.join("/");
    setCurrentPaths((state) => ({ ...state, [selectedSource]: next === "/" ? "" : next }));
  }, [currentPaths, selectedSource]);

  const refetchDirectory = useCallback(() => {
    const normalizedFocusPath = normalizeTreePath(browserPath);
    const targetQuery = directoryQueries[requestedDirectoryPaths.indexOf(normalizedFocusPath)];
    void targetQuery?.refetch?.();
  }, [browserPath, directoryQueries, requestedDirectoryPaths]);

  const directoryItemsByPath = useMemo(() => {
    return requestedDirectoryPaths.reduce<Record<string, FileItem[]>>((acc, path, index) => {
      const items = directoryQueries[index]?.data ?? EMPTY_FILE_ITEMS;
      acc[path] = [...items].sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "directory" ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
      return acc;
    }, {});
  }, [directoryQueries, requestedDirectoryPaths]);
  const treeLoading = directoryQueries.some((query) => query.isLoading || query.isFetching);
  const loadingPaths = useMemo(
    () =>
      requestedDirectoryPaths.filter((_path, index) => {
        const query = directoryQueries[index];
        return Boolean(query?.isLoading || query?.isFetching);
      }),
    [directoryQueries, requestedDirectoryPaths]
  );
  const rootItems = directoryItemsByPath[""] ?? EMPTY_FILE_ITEMS;

  const refetchTreePath = useCallback(
    async (path: string) => {
      const normalizedPath = normalizeTreePath(path);
      const targetQuery = directoryQueries[requestedDirectoryPaths.indexOf(normalizedPath)];
      await targetQuery?.refetch?.();
    },
    [directoryQueries, requestedDirectoryPaths]
  );

  const createTreeItem = useCallback(
    async (type: TreeItemType) => {
      const baseDirectory = deriveBaseDirectory(
        selectedTreeItem?.source === selectedSource ? selectedTreeItem : null,
        browserPath
      );
      const siblings = directoryItemsByPath[baseDirectory] ?? EMPTY_FILE_ITEMS;
      const defaultName = deriveUniqueTreeName(
        siblings,
        type === "directory" ? "new-folder" : "untitled.md"
      );
      const path = joinTreePath(baseDirectory, defaultName);

      setErrorBanner(null);
      try {
        if (type === "directory") {
          await adminApi.createDirectory({ source: selectedSource, path });
        } else {
          await adminApi.writeFile({ source: selectedSource, path, content: "" });
        }

        setCurrentPaths((current) => ({ ...current, [selectedSource]: baseDirectory }));
        setExpandedPaths((current) => {
          if (!baseDirectory) return current;
          const previous = current[selectedSource] ?? [];
          if (previous.includes(baseDirectory)) return current;
          return { ...current, [selectedSource]: [...previous, baseDirectory] };
        });
        await refetchTreePath(baseDirectory);
        setSelectedTreeItem({ source: selectedSource, path, type });
        setEditingTreeItem({
          source: selectedSource,
          path,
          type,
          parentPath: baseDirectory,
          value: defaultName,
        });
      } catch (error) {
        setErrorBanner(getEditorActionErrorMessage(error, "创建失败："));
      }
    },
    [browserPath, directoryItemsByPath, refetchTreePath, selectedSource, selectedTreeItem]
  );

  const createFileInTree = useCallback(() => {
    void createTreeItem("file");
  }, [createTreeItem]);

  const createDirectoryInTree = useCallback(() => {
    void createTreeItem("directory");
  }, [createTreeItem]);

  const updateEditingTreeItemValue = useCallback((value: string) => {
    setEditingTreeItem((current) => (current ? { ...current, value } : current));
  }, []);

  const cancelTreeRename = useCallback(() => {
    setEditingTreeItem(null);
  }, []);

  const commitTreeRename = useCallback(() => {
    const target = editingTreeItem;
    if (!target) return;

    const newName = target.value.trim();
    setEditingTreeItem(null);

    if (!newName || newName === target.path.split("/").pop()) {
      return;
    }

    void (async () => {
      const newPath = joinTreePath(target.parentPath, newName);
      setErrorBanner(null);
      try {
        await adminApi.renameFile({
          source: target.source,
          oldPath: target.path,
          newName,
        });

        setSelectedTreeItem({ source: target.source, path: newPath, type: target.type });
        setExpandedPaths((current) => {
          const previous = current[target.source] ?? [];
          const next = previous.map((path) => replaceTreePathPrefix(path, target.path, newPath));
          return { ...current, [target.source]: Array.from(new Set(next)) };
        });
        setTabs((current) =>
          current.map((tab) => {
            if (target.type !== "file" || tab.kind !== "file" || !tab.file) return tab;
            if (
              tab.file.source !== target.source ||
              normalizeTreePath(tab.file.path) !== target.path
            ) {
              return tab;
            }
            return {
              ...tab,
              id: `file:${target.source}:${newPath}`,
              label: newName,
              file: { ...tab.file, path: newPath },
            };
          })
        );
        await refetchTreePath(target.parentPath);
      } catch (error) {
        setErrorBanner(getErrorMessage(error));
      }
    })();
  }, [editingTreeItem, refetchTreePath]);

  const editorSidebarPanel = useMemo(
    () => ({
      label: "文件浏览器",
      preferredMode: "route" as const,
      content: (
        <EditorSidebarContent
          selectedSource={selectedSource}
          browserPath={browserPath}
          onNavigateUp={navigateUp}
          onRefresh={refetchDirectory}
          sourcesLoading={sourcesQuery.isLoading}
          treeLoading={treeLoading}
          rootItems={rootItems}
          directoryItemsByPath={directoryItemsByPath}
          loadingPaths={loadingPaths}
          expandedPaths={expandedPaths[selectedSource] ?? []}
          activeItemPath={activeTreePath}
          activeItemType={activeTreeType}
          activeItemSource={activeBrowserSource}
          editingItem={editingTreeItem}
          onEditingValueChange={updateEditingTreeItemValue}
          onEditingCommit={commitTreeRename}
          onEditingCancel={cancelTreeRename}
          onDirectoryExpand={handleDirectoryExpand}
          onFileOpen={handleFileOpen}
          onCreateFile={createFileInTree}
          onCreateDirectory={createDirectoryInTree}
        />
      ),
    }),
    [
      activeBrowserSource,
      activeTreePath,
      activeTreeType,
      browserPath,
      cancelTreeRename,
      commitTreeRename,
      createDirectoryInTree,
      createFileInTree,
      directoryItemsByPath,
      editingTreeItem,
      expandedPaths,
      handleDirectoryExpand,
      handleFileOpen,
      loadingPaths,
      refetchDirectory,
      navigateUp,
      selectedSource,
      sourcesQuery.isLoading,
      treeLoading,
      rootItems,
      updateEditingTreeItemValue,
    ]
  );

  useAppShellSidebar(editorSidebarPanel);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <PageHeader
        title="文章编辑器"
        description="打开文章、切换编辑模式，并在保存前检查预览。"
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/admin/posts">
                <ArrowLeft className="size-4" />
                返回文章列表
              </a>
            </Button>
            <Button variant="outline" onClick={createEmptyDraft} data-testid="editor-create-post">
              <FilePlus2 className="size-4" />
              新建文章
            </Button>
            <Button variant="outline" onClick={openPreviewWindow} disabled={!activeTab}>
              <Eye className="size-4" />
              前台预览
            </Button>
            <Button
              variant="outline"
              onClick={() => uploadInputRef.current?.click()}
              disabled={!activeTab || uploadPending}
              title="上传图片或附件并插入到当前内容"
            >
              {uploadPending ? <Spinner /> : <ImagePlus className="size-4" />}
              插入附件
            </Button>
            <Button
              onClick={saveActiveTab}
              disabled={!activeTab || savePending}
              data-testid="editor-save"
            >
              {savePending ? <Spinner /> : <Save className="size-4" />}
              保存
            </Button>
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {errorBanner ? <Alert tone="danger">{errorBanner}</Alert> : null}
      {loadingMessage ? <Alert>{loadingMessage}</Alert> : null}
      <input
        ref={uploadInputRef}
        id="admin-editor-attachment-upload"
        name="admin-editor-attachment-upload"
        aria-label="上传编辑器附件"
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleAttachmentUpload(file);
          }
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/58 bg-card/80 shadow-xl shadow-shadow-soft">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/58 px-4 py-3">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              data-testid="editor-tab"
              className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                tab.id === activeTabId
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <button
                type="button"
                className="inline-flex items-center gap-2"
                onClick={() => setActiveTabId(tab.id)}
              >
                <span>{tab.label || "未命名文章"}</span>
                {tab.dirty ? <Badge tone="warning">未保存</Badge> : null}
              </button>
              <button
                type="button"
                className="inline-flex rounded p-1 hover:bg-background"
                onClick={() => requestCloseTab(tab.id)}
                aria-label={`关闭 ${tab.label || "未命名文章"}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>

        <section className="min-h-0 flex-1 p-0" data-testid="editor">
          {!activeTab ? (
            <div className="p-4 lg:p-6">
              <EmptyState
                title="选择一个文件开始编辑"
                description="从左侧选择已有内容，或新建一篇文章。"
                action={
                  <Button onClick={createEmptyDraft}>
                    <FilePlus2 className="size-4" />
                    新建文章
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/58 px-4 py-4">
                <div>
                  <div className="text-base font-semibold">{activeTab.label || "未命名文章"}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {activeTab.kind === "database"
                      ? activeTab.database?.slug || "新建文章"
                      : `${activeTab.file?.source}:${activeTab.file?.path}`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/36 p-1 shadow-inner shadow-shadow-inset">
                  <Button
                    size="sm"
                    variant={activeTab.mode === "wysiwyg" ? "default" : "outline"}
                    onClick={() => {
                      syncActiveTabFromEditor();
                      updateActiveTab((tab) => ({ ...tab, mode: "wysiwyg" }));
                    }}
                  >
                    <PenSquare className="size-4" />
                    WYSIWYG
                  </Button>
                  <Button
                    size="sm"
                    variant={activeTab.mode === "source" ? "default" : "outline"}
                    onClick={() => {
                      syncActiveTabFromEditor();
                      updateActiveTab((tab) => ({ ...tab, mode: "source" }));
                    }}
                  >
                    <Code2 className="size-4" />
                    Source
                  </Button>
                  <Button
                    size="sm"
                    variant={activeTab.mode === "compare" ? "default" : "outline"}
                    onClick={() => {
                      syncActiveTabFromEditor();
                      updateActiveTab((tab) => ({ ...tab, mode: "compare" }));
                    }}
                  >
                    <Columns2 className="size-4" />
                    对照
                  </Button>
                  <Badge tone={activeTab.dirty ? "warning" : "muted"}>
                    {activeTab.dirty ? "未保存" : "已保存"}
                  </Badge>
                </div>
              </div>

              <UniversalEditor
                ref={editorRef}
                key={activeTab.id}
                editorId={activeTab.id}
                initialContent={activeContent}
                onContentChange={updateActiveTabContent}
                placeholder="开始写作您的文章..."
                attachmentBasePath={buildAttachmentUploadPath(
                  activeEditorContext?.articlePath ?? "/__unknown__.md",
                  "placeholder.bin"
                ).replace(/\/placeholder\.bin$/, "")}
                articlePath={activeEditorContext?.articlePath ?? "/__unknown__.md"}
                contentSource={activeEditorContext?.contentSource ?? "local"}
                mode={activeTab.mode}
                className="min-h-0 flex-1"
              />
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={closeTargetTabId !== null}
        onOpenChange={(open) => {
          if (!open) setCloseTargetTabId(null);
        }}
        destructive
        title="关闭未保存标签"
        description="此标签包含未保存内容，关闭后这些更改会丢失。"
        confirmLabel="仍然关闭"
        onConfirm={() => {
          if (!closeTargetTabId) return;
          performCloseTab(closeTargetTabId);
        }}
      />
    </div>
  );
}
