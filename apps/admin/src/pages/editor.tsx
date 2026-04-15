import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  FilePlus2,
  FileText,
  Folder,
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
  type AdminPost,
  adminApi,
  type DataSourceInfo,
  type FileItem,
} from "@/lib/admin-api-client";
import { isMemoContentPath } from "@/lib/memo-paths";
import { generateContentUrl } from "@/lib/url-utils";
import { cn } from "@/lib/utils";
import { useAppShellSidebar } from "~/components/app-shell";
import { Alert, Badge, Button, EmptyState, Spinner } from "~/components/ui";
import { UniversalEditor, type UniversalEditorRef } from "~/editor/universal-editor";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

type EditorMode = "wysiwyg" | "source" | "preview";

type DatabaseDraft = {
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  draft: boolean;
  public: boolean;
  source: "local" | "webdav";
  filePath: string;
  isNew?: boolean;
};

type FileDraft = {
  source: "local" | "webdav";
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

function normalizeContentSource(source?: string | null): "local" | "webdav" {
  return source?.startsWith("webdav") ? "webdav" : "local";
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
  contentSource: "local" | "webdav";
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

function parseFrontmatterMap(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return {};

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) return acc;
      const key = line.slice(0, separatorIndex).trim();
      const value = line
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key) acc[key] = value;
      return acc;
    }, {});
}

function deriveFileLabel(path: string, content: string) {
  const frontmatterTitle = parseFrontmatterMap(content).title?.trim() ?? "";
  if (frontmatterTitle) {
    return frontmatterTitle;
  }

  return path.split("/").filter(Boolean).pop() || path || "untitled.md";
}

function stripFrontmatter(content: string) {
  return content.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, "");
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
  previewUrl.searchParams.set("admin-preview", "1");
  return `${previewUrl.pathname}${previewUrl.search}`;
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

function getArticleIdentity(source: "local" | "webdav", articlePath: string | null | undefined) {
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

function EditorSidebarContent({
  selectedSource,
  onSelectSource,
  browserPath,
  onNavigateUp,
  onRefresh,
  sources,
  sourcesLoading,
  treeLoading,
  rootItems,
  directoryItemsByPath,
  loadingPaths,
  expandedPaths,
  activeItemPath,
  activeItemSource,
  onDirectoryExpand,
  onFileOpen,
  onCreateDraft,
}: {
  selectedSource: "local" | "webdav";
  onSelectSource: (source: "local" | "webdav") => void;
  browserPath: string;
  onNavigateUp: () => void;
  onRefresh: () => void;
  sources: DataSourceInfo[];
  sourcesLoading: boolean;
  treeLoading: boolean;
  rootItems: FileItem[];
  directoryItemsByPath: Record<string, FileItem[]>;
  loadingPaths: string[];
  expandedPaths: string[];
  activeItemPath: string | null;
  activeItemSource: "local" | "webdav" | null;
  onDirectoryExpand: (item: FileItem) => void;
  onFileOpen: (item: FileItem) => void;
  onCreateDraft: () => void;
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
        const isLoadingBranch = isDirectory && loadingPathSet.has(normalizedPath);
        const isActiveFile =
          shouldHighlightActiveSource && isTreePathSelected(item.path, activeItemPath);
        const isActiveBranch =
          shouldHighlightActiveSource &&
          isDirectory &&
          isTreePathAncestor(item.path, activeItemPath);

        return (
          <div key={`${item.type}:${item.path}`} className="space-y-1">
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2 text-left text-sm transition",
                "hover:bg-muted/40 hover:text-foreground",
                isActiveFile && "border-primary/35 bg-primary/10 text-primary shadow-sm",
                !isActiveFile && isActiveBranch && "border-border/35 bg-muted/40 text-foreground",
                !isActiveFile && !isActiveBranch && "text-foreground/88"
              )}
              style={{ paddingLeft: `${0.75 + depth * 0.85}rem` }}
              onClick={() => (isDirectory ? onDirectoryExpand(item) : onFileOpen(item))}
            >
              <span className="flex min-w-0 items-center gap-2">
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
                      isActiveBranch ? "text-primary" : "text-primary"
                    )}
                  />
                ) : (
                  <FileText
                    className={cn(
                      "size-4 shrink-0",
                      isActiveFile ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                )}
                <span className="truncate">{item.name}</span>
              </span>
              <span
                className={cn("text-xs text-muted-foreground", isActiveFile && "text-primary/80")}
              >
                {isDirectory ? `${item.count ?? 0} 项` : item.extension || "file"}
              </span>
            </button>

            {isDirectory && isExpanded ? (
              <div className="space-y-1">
                {isLoadingBranch && children.length === 0 ? (
                  <div
                    className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${1.75 + depth * 0.85}rem` }}
                  >
                    <Spinner /> 读取目录…
                  </div>
                ) : null}
                {children.length > 0 ? renderTreeNodes(children, depth + 1) : null}
                {!isLoadingBranch && children.length === 0 ? (
                  <div
                    className="px-3 py-1 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${1.75 + depth * 0.85}rem` }}
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
      directoryItemsByPath,
      expandedPathSet,
      loadingPathSet,
      onDirectoryExpand,
      onFileOpen,
      shouldHighlightActiveSource,
    ]
  );

  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="font-medium">文件浏览器</div>
          <div className="text-xs text-muted-foreground">和后台导航共用左侧栏位，可随时切换。</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onCreateDraft} title="新建文章草稿">
          <FilePlus2 className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 overflow-y-auto p-4 admin-scrollbar">
        <div className="flex gap-2">
          {(["local", "webdav"] as const).map((source) => {
            const enabled = sources.some((item) => item.name === source && item.enabled);
            return (
              <Button
                key={source}
                size="sm"
                variant={selectedSource === source ? "default" : "outline"}
                disabled={!enabled}
                onClick={() => onSelectSource(source)}
              >
                {source}
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onNavigateUp} disabled={!browserPath}>
            <FolderUp className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCcw className="size-4" />
          </Button>
          <div className="min-w-0 text-xs text-muted-foreground">
            {browserPath || (selectedSource === "webdav" ? "/" : "根目录")}
          </div>
        </div>

        <div className="space-y-2">
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
  const [selectedSource, setSelectedSource] = useState<"local" | "webdav">("local");
  const [currentPaths, setCurrentPaths] = useState<Record<"local" | "webdav", string>>({
    local: "",
    webdav: "",
  });
  const [expandedPaths, setExpandedPaths] = useState<Record<"local" | "webdav", string[]>>({
    local: [],
    webdav: [],
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
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
      (item) => item.enabled && (item.name === "local" || item.name === "webdav")
    );
    if (firstAvailable) {
      setSelectedSource(firstAvailable.name as "local" | "webdav");
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
  const activeBrowserSource = activeEditorContext?.contentSource ?? null;
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
    async (source: "local" | "webdav", path: string) => {
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
        const label = deriveFileLabel(path, file.content);
        const tab: EditorTab = {
          id: `file:${source}:${path}`,
          label,
          kind: "file",
          mode: "wysiwyg",
          dirty: false,
          file: {
            source,
            path: file.path,
            content: file.content,
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
        await openFileTab("webdav", id);
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
        .filter((item) => item.enabled && (item.name === "local" || item.name === "webdav"))
        .map((item) => item.name as "local" | "webdav")
    );

    const preferredSource = availableSourceNames.has(activeEditorContext.contentSource)
      ? activeEditorContext.contentSource
      : availableSourceNames.has("local")
        ? "local"
        : availableSourceNames.has("webdav")
          ? "webdav"
          : activeEditorContext.contentSource;

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

  function closeTab(tabId: string) {
    const tab = tabs.find((item) => item.id === tabId);
    if (tab?.dirty && !window.confirm("当前标签有未保存内容，仍然关闭吗？")) {
      return;
    }
    const remaining = tabs.filter((item) => item.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      setActiveTabId(remaining[remaining.length - 1]?.id ?? null);
    }
  }

  async function saveActiveTab() {
    if (!activeTab) return;
    setSavePending(true);
    setErrorBanner(null);
    try {
      if (activeTab.kind === "database" && activeTab.database) {
        const liveContent = syncActiveTabFromEditor() ?? activeTab.database.content;
        const derivedDraft = deriveDatabaseDraftState(activeTab.database, liveContent);
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
      setErrorBanner(getErrorMessage(error));
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
      setCurrentPaths((current) => ({ ...current, [selectedSource]: normalizedPath }));
      setExpandedPaths((current) => {
        const previous = current[selectedSource] ?? [];
        if (previous.includes(normalizedPath)) {
          return current;
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

  const sources = availableSources;
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

  const editorSidebarPanel = useMemo(
    () => ({
      label: "文件浏览器",
      description: "文件浏览器与后台导航共用同一列，不再占用编辑器正文宽度。",
      preferredMode: "route" as const,
      content: (
        <EditorSidebarContent
          selectedSource={selectedSource}
          onSelectSource={setSelectedSource}
          browserPath={browserPath}
          onNavigateUp={navigateUp}
          onRefresh={refetchDirectory}
          sources={sources}
          sourcesLoading={sourcesQuery.isLoading}
          treeLoading={treeLoading}
          rootItems={rootItems}
          directoryItemsByPath={directoryItemsByPath}
          loadingPaths={loadingPaths}
          expandedPaths={expandedPaths[selectedSource] ?? []}
          activeItemPath={activeBrowserPath}
          activeItemSource={activeBrowserSource}
          onDirectoryExpand={handleDirectoryExpand}
          onFileOpen={handleFileOpen}
          onCreateDraft={createEmptyDraft}
        />
      ),
    }),
    [
      activeBrowserPath,
      activeBrowserSource,
      browserPath,
      createEmptyDraft,
      directoryItemsByPath,
      expandedPaths,
      handleDirectoryExpand,
      handleFileOpen,
      loadingPaths,
      refetchDirectory,
      navigateUp,
      selectedSource,
      sources,
      sourcesQuery.isLoading,
      treeLoading,
      rootItems,
    ]
  );

  useAppShellSidebar(editorSidebarPanel);

  return (
    <div className="space-y-6">
      <PageHeader
        title="文章编辑器"
        description="接回原始编辑器能力：多标签、WYSIWYG / Source / Preview。"
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/admin/posts">
                <ArrowLeft className="size-4" />
                返回文章列表
              </a>
            </Button>
            <Button variant="outline" onClick={createEmptyDraft}>
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
            <Button onClick={saveActiveTab} disabled={!activeTab || savePending}>
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
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleAttachmentUpload(file);
          }
        }}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              data-testid="editor-tab"
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
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
                onClick={() => closeTab(tab.id)}
                aria-label={`关闭 ${tab.label || "未命名文章"}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>

        <section className="min-h-[720px] p-4 lg:p-6" data-testid="editor">
          {!activeTab ? (
            <EmptyState
              title="选择一个文件开始编辑"
              description="左侧文件树可以打开 local / webdav 文件，也可以直接新建文章开始编写。"
              action={
                <Button onClick={createEmptyDraft}>
                  <FilePlus2 className="size-4" />
                  新建文章
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <div>
                  <div className="text-lg font-semibold">{activeTab.label || "未命名文章"}</div>
                  <div className="text-sm text-muted-foreground">
                    {activeTab.kind === "database"
                      ? activeTab.database?.slug || "新建文章"
                      : `${activeTab.file?.source}:${activeTab.file?.path}`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                    variant={activeTab.mode === "preview" ? "default" : "outline"}
                    onClick={() => {
                      syncActiveTabFromEditor();
                      updateActiveTab((tab) => ({ ...tab, mode: "preview" }));
                    }}
                  >
                    <Eye className="size-4" />
                    Preview
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
                className="min-h-[36rem]"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
