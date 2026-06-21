import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Code2,
  Columns2,
  Eye,
  FilePlus2,
  ImagePlus,
  PenSquare,
  Save,
} from "lucide-react";
import { nanoid } from "nanoid";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorChangeMeta } from "@/editor/editor-change";
import {
  AdminApiError,
  type AdminPost,
  adminApi,
  type DataSourceInfo,
  type FileItem,
} from "@/lib/admin-api-client";
import {
  autoFixFrontmatterStyle,
  buildFrontmatterSuggestions,
  type FrontmatterDiagnostic,
  parseFrontmatterDocument,
  parseFrontmatterMap,
  splitFrontmatterDiagnosticMessage,
  updateFrontmatterDocument,
  validateFrontmatterText,
} from "@/lib/frontmatter-document";
import { isMemoContentPath } from "@/lib/memo-paths";
import { extractPostDraftFields } from "@/lib/post-body-contract";
import { generateContentUrl } from "@/lib/url-utils";
import { AdminToastViewport, dismissAdminToast, showAdminToast } from "~/components/admin-toast";
import { useAppShellSidebar } from "~/components/app-shell";
import {
  deriveBaseDirectory,
  deriveUniqueTreeName,
  EditorFileBrowser,
  getAncestorTreePaths,
  getParentTreePath,
  isTreePathAncestor,
  isTreePathSelected,
  joinTreePath,
  normalizeTreePath,
  replaceTreePathPrefix,
  type TreeItemType,
  type TreePendingState,
  type TreeRenameTarget,
  type TreeSelection,
  toDirectoryRequestPath,
} from "~/components/editor-file-browser";
import { Badge, Button, ConfirmDialog, EmptyState, Spinner } from "~/components/ui";
import { EditorTabStrip } from "~/editor/editor-tab-strip";
import { UniversalEditor, type UniversalEditorRef } from "~/editor/universal-editor";
import { getErrorMessage, PageHeader } from "~/pages/helpers";
import {
  buildDatabaseAuthoringDocument,
  type DatabaseDraft,
  deriveDatabaseDraftState,
  deriveFileLabel,
  type EditorTab,
  getArticleIdentity,
  getAvailableEditorModes,
  getDefaultFileEditorMode,
  getEditorHeaderCopy,
  getEditorSurfaceKind,
  getSelectionRevealPaths,
  getTabArticleIdentity,
  isBlankEditorContent,
  isPreviewableEditorTab,
  isTextFileDraft,
  isTreeOperationTargeted,
  mapBatchResultsToTreeSelection,
  normalizeArticlePath,
  remapActiveTabIdForPathChange,
  remapBrowserPathForPathChange,
  remapTabPath,
  resolveActiveTabIdAfterTreeDelete,
  resolveBrowserPathAfterTreeDelete,
  shouldMarkLiveEditorContentDirty,
  supportsEditorAttachments,
} from "./editor-logic";

function insertEditorTabAtStart(
  current: EditorTab[],
  tab: EditorTab,
  options?: { replaceIds?: string[] }
) {
  const replaceIds = new Set([tab.id, ...(options?.replaceIds ?? [])]);
  return [tab, ...current.filter((item) => !replaceIds.has(item.id))];
}

const EMPTY_SOURCES: DataSourceInfo[] = [];
const EMPTY_FILE_ITEMS: FileItem[] = [];
const ADMIN_TEXT_FILE_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;

function normalizeContentSource(_source?: string | null): "local" {
  return "local";
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

function getEditorActionErrorMessage(error: unknown, fallback?: string) {
  if (error instanceof AdminApiError) {
    if (error.code === "PRECONDITION_FAILED" && error.message.includes("初始化失败")) {
      return "本地内容目录暂时不可写，请检查内容源配置后重试。";
    }
    return getErrorMessage(error);
  }

  return fallback ? `${fallback}${getErrorMessage(error)}` : getErrorMessage(error);
}

function getFileOpenErrorMessage(error: unknown) {
  return getEditorActionErrorMessage(error, "打开文件失败：");
}

function getFileTreeOpenBlockReason(item: FileItem) {
  if (item.type !== "file") {
    return null;
  }
  if (item.contentKind === "unsupported") {
    return `文件类型不受支持：${item.path}`;
  }
  if (
    typeof item.size === "number" &&
    item.size > ADMIN_TEXT_FILE_SIZE_LIMIT_BYTES &&
    item.contentKind &&
    item.contentKind !== "unsupported"
  ) {
    return `文件过大，禁止直接打开：${item.path}（最大支持 2 MiB）`;
  }
  return null;
}

function uniqueTreePendingStates(states: TreePendingState[]) {
  const deduped = new Map<string, TreePendingState>();
  for (const state of states) {
    const path = normalizeTreePath(state.path);
    if (!path) continue;
    deduped.set(`${state.operation}:${path}`, { ...state, path });
  }
  return [...deduped.values()];
}

function getTreePendingStatesForPaste(
  entries: TreeSelection[],
  destinationPath: string,
  operation: "copy" | "move"
) {
  const normalizedDestinationPath = normalizeTreePath(destinationPath);
  return uniqueTreePendingStates([
    ...entries.map((entry) => ({
      path: entry.path,
      operation,
    })),
    ...(normalizedDestinationPath
      ? [
          {
            path: normalizedDestinationPath,
            operation,
          } satisfies TreePendingState,
        ]
      : []),
  ]);
}

function buildTreeRenameTarget(
  source: "local",
  path: string,
  type: TreeItemType,
  value: string,
  errorMessage?: string | null
): TreeRenameTarget {
  return {
    source,
    path,
    type,
    parentPath: getParentTreePath(path),
    value,
    errorMessage: errorMessage ?? null,
  };
}

type EditorErrorToast = {
  message: ReactNode;
  persistent?: boolean;
};

function formatFrontmatterSaveError(diagnostics: FrontmatterDiagnostic[]) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  return (
    <div className="space-y-2">
      <p className="font-medium text-foreground">Frontmatter 里还有错误，修复后才能保存。</p>
      <ul className="space-y-1 text-muted-foreground">
        {errors.map((diagnostic) => (
          <li
            key={`${diagnostic.field ?? "root"}:${diagnostic.message}:${diagnostic.from ?? 0}:${diagnostic.to ?? 0}`}
            className="leading-6"
          >
            <span className="mr-2 text-foreground/72">•</span>
            <FrontmatterSaveErrorMessage message={diagnostic.message} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FrontmatterSaveErrorMessage({ message }: { message: string }) {
  const { summary, detail } = splitFrontmatterDiagnosticMessage(message);

  return (
    <span className="inline-flex min-w-0 flex-col gap-1 align-top">
      <span>{summary}</span>
      {detail ? (
        <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/28 px-2.5 py-2 font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
          {detail}
        </pre>
      ) : null}
    </span>
  );
}

function formatFrontmatterStyleFixNotice(fields: string[]) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-foreground">保存时已自动修复 Frontmatter 样式。</p>
      <ul className="space-y-1 text-muted-foreground">
        {fields.map((field) => (
          <li key={field} className="leading-6">
            <span className="mr-2 text-foreground/72">•</span>
            <span>{field} 列表缩进已整理为标准 YAML 数组样式。</span>
          </li>
        ))}
      </ul>
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
  const [treeSelectionOverride, setTreeSelectionOverride] = useState<TreeSelection[] | null>(null);
  const [editingTreeItem, setEditingTreeItem] = useState<TreeRenameTarget | null>(null);
  const [treePendingStates, setTreePendingStates] = useState<TreePendingState[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<EditorErrorToast | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [closeTargetTabId, setCloseTargetTabId] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [didHandleInitialUrl, setDidHandleInitialUrl] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<UniversalEditorRef | null>(null);
  const frontmatterDiagnosticsRef = useRef<FrontmatterDiagnostic[]>([]);
  const loadingToastIdRef = useRef<ReturnType<typeof showAdminToast> | null>(null);
  const pendingFileTabsRef = useRef<Map<string, { promise: Promise<void>; temporary: boolean }>>(
    new Map()
  );
  const tabsRef = useRef<EditorTab[]>(tabs);
  const queryClient = useQueryClient();

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const sourcesQuery = useQuery({
    queryKey: ["admin-file-sources"],
    queryFn: adminApi.getFileSources,
  });

  const tagsOverviewQuery = useQuery({
    queryKey: ["admin-tags-overview", "frontmatter"],
    queryFn: adminApi.getTagsOverview,
    staleTime: 60_000,
  });

  const categorySuggestionsQuery = useQuery({
    queryKey: ["admin-post-categories", "frontmatter"],
    queryFn: async () => {
      const categories = new Set<string>();
      let page = 1;
      let totalPages = 1;

      do {
        const result = await adminApi.listPosts({
          page,
          limit: 50,
          status: "all",
          sortBy: "updateDate",
          sortOrder: "desc",
        });
        for (const item of result.posts) {
          const value = item.category?.trim();
          if (value) {
            categories.add(value);
          }
        }
        totalPages = result.pagination.totalPages || 1;
        page += 1;
      } while (page <= totalPages);

      return Array.from(categories).sort((left, right) =>
        left.localeCompare(right, "zh-Hans-CN-u-co-pinyin")
      );
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const firstAvailable = (sourcesQuery.data ?? []).find(
      (item) => item.enabled && item.name === "local"
    );
    if (firstAvailable) {
      setSelectedSource("local");
    }
  }, [sourcesQuery.data]);

  useEffect(() => {
    if (!notice) return;
    showAdminToast("success", notice);
    setNotice(null);
  }, [notice]);

  useEffect(() => {
    if (!errorBanner) return;
    showAdminToast("danger", errorBanner.message, {
      autoClose: errorBanner.persistent ? false : 5600,
    });
    setErrorBanner(null);
  }, [errorBanner]);

  useEffect(() => {
    if (loadingMessage) {
      if (loadingToastIdRef.current) {
        dismissAdminToast(loadingToastIdRef.current);
      }
      loadingToastIdRef.current = showAdminToast("progress", loadingMessage, {
        toastId: "admin-editor-loading",
      });
      return;
    }

    if (loadingToastIdRef.current) {
      dismissAdminToast(loadingToastIdRef.current);
      loadingToastIdRef.current = null;
    }
  }, [loadingMessage]);

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
  const activeEditorSurface = getEditorSurfaceKind(activeTab);
  const editorHeaderCopy = getEditorHeaderCopy(activeTab);
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
  const activeEditorModes = getAvailableEditorModes(activeTab);
  const previewEnabled = isPreviewableEditorTab(activeTab);
  const attachmentEnabled = supportsEditorAttachments(activeTab);
  const frontmatterSuggestions = useMemo(
    () =>
      buildFrontmatterSuggestions({
        tags: (tagsOverviewQuery.data?.tagSummaries ?? []).map((item) => item.name),
        categories: categorySuggestionsQuery.data ?? [],
      }),
    [categorySuggestionsQuery.data, tagsOverviewQuery.data?.tagSummaries]
  );

  const upsertPostTab = useCallback((post: AdminPost, options?: { replaceTabId?: string }) => {
    const tabId = `post:${post.id}`;
    const authoringDocument = buildDatabaseAuthoringDocument(
      {
        postId: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt || "",
        content: post.body,
        draft: post.draft,
        public: post.public,
        source: normalizeContentSource(post.source || post.dataSource),
        filePath: normalizeArticlePath(post.filePath, post.slug),
        category: post.category,
        author: post.author,
        image: post.image,
        publishDate: post.publishDate,
        updateDate: post.updateDate,
        tags: post.tags,
      },
      { preferEmbeddedFrontmatter: true }
    );
    const databaseDraft: DatabaseDraft = {
      postId: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt || "",
      content: authoringDocument.content,
      draft: post.draft,
      public: post.public,
      source: normalizeContentSource(post.source || post.dataSource),
      filePath: normalizeArticlePath(post.filePath, post.slug),
      category: post.category,
      author: post.author,
      image: post.image,
      publishDate: post.publishDate,
      updateDate: post.updateDate,
      tags: post.tags,
    };
    const derivedDraft = deriveDatabaseDraftState(databaseDraft, databaseDraft.content);
    const targetIdentity = getArticleIdentity(databaseDraft.source, databaseDraft.filePath);
    let nextActiveTabId = tabId;

    setTabs((current) => {
      const existingByIdentity = current.find(
        (tab) => getTabArticleIdentity(tab) === targetIdentity
      );
      const existingDatabase = current.find((tab) => tab.id === tabId);
      const replacingTab = options?.replaceTabId
        ? current.find((tab) => tab.id === options.replaceTabId)
        : undefined;

      if (existingByIdentity && existingByIdentity.kind !== "database") {
        nextActiveTabId = existingByIdentity.id;
        return current;
      }

      const preservedTabs = current.filter(
        (tab) =>
          tab.id !== tabId &&
          tab.id !== options?.replaceTabId &&
          getTabArticleIdentity(tab) !== targetIdentity
      );
      const mode =
        existingDatabase?.mode ??
        (existingByIdentity?.kind === "database" ? existingByIdentity.mode : undefined) ??
        replacingTab?.mode ??
        "wysiwyg";

      nextActiveTabId = existingByIdentity?.id ?? tabId;

      return insertEditorTabAtStart(
        preservedTabs,
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
        options?.replaceTabId ? { replaceIds: [options.replaceTabId] } : undefined
      );
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
        setErrorBanner({ message: `未找到文章：${getErrorMessage(error)}` });
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
        setErrorBanner({ message: `未找到 slug 为 “${slug}” 的文章：${getErrorMessage(error)}` });
      } finally {
        setLoadingMessage(null);
      }
    },
    [upsertPostTab]
  );

  const openFileTab = useCallback(
    async (source: "local", path: string, options: { temporary?: boolean } = {}) => {
      const targetIdentity = getArticleIdentity(source, path);
      const requestedTemporary = options.temporary ?? false;
      const existing = tabs.find((tab) => getTabArticleIdentity(tab) === targetIdentity);
      if (existing) {
        if (!requestedTemporary && existing.temporary) {
          setTabs((current) =>
            current.map((tab) => (tab.id === existing.id ? { ...tab, temporary: false } : tab))
          );
        }
        setActiveTabId(existing.id);
        return;
      }

      const pending = pendingFileTabsRef.current.get(targetIdentity);
      if (pending) {
        if (!requestedTemporary && pending.temporary) {
          pending.temporary = false;
        }
        await pending.promise;
        return;
      }

      setLoadingMessage("正在加载文章...");
      setErrorBanner(null);
      const request = (async () => {
        const file = await adminApi.readFile(source, path);
        const filePath = normalizeTreePath(file.path || path);
        const fileContent = typeof file.content === "string" ? file.content : "";
        const contentKind = file.contentKind === "text" ? "text" : "markdown";
        const label = deriveFileLabel(filePath, fileContent);
        const fileIdentity = getArticleIdentity(source, filePath);
        const tab: EditorTab = {
          id: `file:${source}:${filePath}`,
          label,
          kind: "file",
          mode: getDefaultFileEditorMode(contentKind),
          dirty: false,
          temporary:
            pendingFileTabsRef.current.get(targetIdentity)?.temporary ?? requestedTemporary,
          file: {
            source,
            path: filePath,
            content: fileContent,
            contentKind,
            size: file.size,
          },
        };
        const latestExistingTab = tabsRef.current.find(
          (item) => getTabArticleIdentity(item) === fileIdentity
        );
        if (latestExistingTab) {
          if (!tab.temporary && latestExistingTab.temporary) {
            setTabs((current) =>
              current.map((item) =>
                item.id === latestExistingTab.id ? { ...item, temporary: false } : item
              )
            );
          }
          setActiveTabId(latestExistingTab.id);
          return;
        }
        setTabs((current) => {
          const preservedTabs = tab.temporary
            ? current.filter((item) => !item.temporary || item.dirty)
            : current;
          return insertEditorTabAtStart(preservedTabs, tab);
        });
        setActiveTabId(tab.id);
      })();
      pendingFileTabsRef.current.set(targetIdentity, {
        promise: request,
        temporary: requestedTemporary,
      });

      try {
        await request;
      } catch (error) {
        setErrorBanner({ message: getFileOpenErrorMessage(error) });
      } finally {
        pendingFileTabsRef.current.delete(targetIdentity);
        setLoadingMessage(null);
      }
    },
    [tabs]
  );

  const openFromCompatId = useCallback(
    async (id: string) => {
      if (id.startsWith("/")) {
        await openFileTab("local", id, { temporary: false });
        return;
      }
      if (id.includes("/") || id.endsWith(".md")) {
        await openFileTab("local", id, { temporary: false });
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

    if (activeTab.dirty) {
      return;
    }

    const params = new URLSearchParams();
    if (activeTab.kind === "database" && activeTab.database) {
      if (activeTab.database.isNew || activeTab.dirty) {
        params.set("id", activeTab.database.postId);
      } else if (activeTab.database.slug) {
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
        tags: [],
      },
    };
    setTabs((current) => insertEditorTabAtStart(current, tab));
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
    (nextContent: string, options: { markDirty?: boolean } = { markDirty: true }) => {
      const markDirty = options.markDirty ?? true;
      updateActiveTab((tab) => {
        if (tab.kind === "database" && tab.database) {
          const derivedDraft = deriveDatabaseDraftState(tab.database, nextContent);
          return {
            ...tab,
            label: derivedDraft.title || "未命名文章",
            dirty: markDirty ? true : tab.dirty,
            temporary: markDirty ? false : tab.temporary,
            database: { ...tab.database, ...derivedDraft, content: nextContent },
          };
        }
        if (tab.kind === "file" && tab.file) {
          const nextLabel = markDirty ? deriveFileLabel(tab.file.path, nextContent) : tab.label;
          return {
            ...tab,
            label: nextLabel,
            dirty: markDirty ? true : tab.dirty,
            temporary: markDirty ? false : tab.temporary,
            file: { ...tab.file, content: nextContent },
          };
        }
        return tab;
      });
    },
    [updateActiveTab]
  );

  const syncActiveTabFromEditor = useCallback(
    (options: { markDirty?: boolean } = {}) => {
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
        updateActiveTabContent(liveContent, {
          markDirty:
            options.markDirty ?? shouldMarkLiveEditorContentDirty(liveContent, persistedContent),
        });
      }

      return liveContent;
    },
    [activeTab, updateActiveTabContent]
  );

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
    if (!supportsEditorAttachments(activeTab)) {
      setErrorBanner({ message: "纯文本文件不支持插入附件，请切换到 Markdown 文件后再试。" });
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      return;
    }

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
      updateActiveTabContent(`${activeContent}${prefix}${markdown}`, { markDirty: true });
      setNotice(`已插入附件：${file.name}`);
    } catch (error) {
      setErrorBanner({ message: getErrorMessage(error) });
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
    const syncedLiveContent =
      syncActiveTabFromEditor({ markDirty: activeTab.dirty }) ??
      (activeTab.kind === "database" ? activeTab.database?.content : activeTab.file?.content) ??
      "";
    const parsedLiveDocument = parseFrontmatterDocument(syncedLiveContent);
    const liveFrontmatterText = parsedLiveDocument.frontmatterText;
    const fixedFrontmatter = autoFixFrontmatterStyle(liveFrontmatterText);
    const liveContent =
      fixedFrontmatter.frontmatterText === liveFrontmatterText
        ? syncedLiveContent
        : updateFrontmatterDocument(syncedLiveContent, fixedFrontmatter.frontmatterText);
    const saveDiagnostics = validateFrontmatterText(fixedFrontmatter.frontmatterText).diagnostics;
    const publishStyleFixNotice = () => {
      if (fixedFrontmatter.fixedFields.length === 0) return;
      showAdminToast("default", formatFrontmatterStyleFixNotice(fixedFrontmatter.fixedFields));
    };
    const syncEditorWithSavedContent = (targetTabId?: string) => {
      if (liveContent === syncedLiveContent) return;
      editorRef.current?.setContent(liveContent);
      if (!targetTabId) {
        updateActiveTabContent(liveContent, { markDirty: false });
        return;
      }
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== targetTabId) return tab;
          if (tab.kind === "database" && tab.database) {
            const derivedDraft = deriveDatabaseDraftState(tab.database, liveContent);
            return {
              ...tab,
              label: derivedDraft.title || tab.label,
              dirty: false,
              database: {
                ...tab.database,
                ...derivedDraft,
                content: liveContent,
              },
            };
          }
          if (tab.kind === "file" && tab.file) {
            return {
              ...tab,
              label: deriveFileLabel(tab.file.path, liveContent),
              dirty: false,
              file: {
                ...tab.file,
                content: liveContent,
              },
            };
          }
          return tab;
        })
      );
    };
    frontmatterDiagnosticsRef.current = saveDiagnostics;
    if (saveDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      setErrorBanner({
        message: formatFrontmatterSaveError(saveDiagnostics),
        persistent: true,
      });
      return;
    }
    setSavePending(true);
    setErrorBanner(null);
    try {
      if (activeTab.kind === "database" && activeTab.database) {
        const extracted = extractPostDraftFields(liveContent, activeTab.database);
        const derivedDraft = deriveDatabaseDraftState(activeTab.database, liveContent);
        if (activeTab.database.isNew && isBlankEditorContent(liveContent)) {
          setErrorBanner({ message: "内容不能为空，请先输入正文后再保存。" });
          return;
        }
        const payload = {
          title: derivedDraft.title,
          slug: derivedDraft.slug,
          excerpt: derivedDraft.excerpt,
          body: extracted.body,
          draft: derivedDraft.draft,
          public: derivedDraft.public,
          category: derivedDraft.category ?? undefined,
          tags: derivedDraft.tags,
          author: derivedDraft.author ?? undefined,
          image: derivedDraft.image ?? undefined,
          publishDate: derivedDraft.publishDate ?? undefined,
          updateDate: derivedDraft.updateDate ?? undefined,
          type: "post",
        };

        if (activeTab.database.isNew) {
          const created = await adminApi.createPost(payload);
          const createdTabId = `post:${created.post.id}`;
          upsertPostTab(created.post, { replaceTabId: activeTab.id });
          syncEditorWithSavedContent(createdTabId);
          setNotice("已创建新草稿。");
          publishStyleFixNotice();
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
        syncEditorWithSavedContent();
        setNotice("文章保存成功。");
        publishStyleFixNotice();
      }

      if (activeTab.kind === "file" && activeTab.file) {
        await adminApi.writeFile({
          source: activeTab.file.source,
          path: activeTab.file.path,
          content: liveContent,
        });
        setTabs((current) =>
          current.map((tab) =>
            tab.id === activeTab.id
              ? {
                  ...tab,
                  dirty: false,
                  file: tab.file
                    ? {
                        ...tab.file,
                        content: liveContent,
                      }
                    : tab.file,
                }
              : tab
          )
        );
        syncEditorWithSavedContent();
        setNotice("文件保存成功。");
        publishStyleFixNotice();
      }
    } catch (error) {
      setErrorBanner({ message: getEditorActionErrorMessage(error) });
    } finally {
      setSavePending(false);
    }
  }

  function openPreviewWindow() {
    if (!activeTab || !activeEditorContext) return;
    if (!isPreviewableEditorTab(activeTab)) {
      setErrorBanner({ message: "纯文本文件不支持前台预览。" });
      return;
    }

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
      setErrorBanner({ message: getErrorMessage(error) });
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
      const blockedReason = getFileTreeOpenBlockReason(item);
      if (blockedReason) {
        setErrorBanner({ message: blockedReason });
        return;
      }
      setSelectedTreeItem({
        source: selectedSource,
        path: normalizeTreePath(item.path),
        type: "file",
      });
      void openFileTab(selectedSource, item.path, { temporary: true });
    },
    [openFileTab, selectedSource]
  );

  const handleFilePermanentOpen = useCallback(
    (item: FileItem) => {
      if (item.type !== "file") return;
      const blockedReason = getFileTreeOpenBlockReason(item);
      if (blockedReason) {
        setErrorBanner({ message: blockedReason });
        return;
      }
      setSelectedTreeItem({
        source: selectedSource,
        path: normalizeTreePath(item.path),
        type: "file",
      });
      void openFileTab(selectedSource, item.path, { temporary: false });
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
    async (type: TreeItemType, parentPath?: string) => {
      const baseDirectory =
        typeof parentPath === "string"
          ? normalizeTreePath(parentPath)
          : deriveBaseDirectory(
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
      setTreePendingStates([{ path, operation: "create" }]);
      try {
        if (type === "directory") {
          await adminApi.createDirectory({ source: selectedSource, path });
          setNotice("目录创建成功。");
        } else {
          await adminApi.writeFile({ source: selectedSource, path, content: "" });
          setNotice("文件创建成功。");
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
        setErrorBanner({ message: getEditorActionErrorMessage(error, "创建失败：") });
      } finally {
        setTreePendingStates([]);
      }
    },
    [browserPath, directoryItemsByPath, refetchTreePath, selectedSource, selectedTreeItem]
  );

  const createFileInTree = useCallback(
    (parentPath?: string) => {
      void createTreeItem("file", parentPath);
    },
    [createTreeItem]
  );

  const createDirectoryInTree = useCallback(
    (parentPath?: string) => {
      void createTreeItem("directory", parentPath);
    },
    [createTreeItem]
  );

  const startTreeRename = useCallback((target: TreeSelection) => {
    setEditingTreeItem(
      buildTreeRenameTarget(
        target.source,
        target.path,
        target.type,
        target.path.split("/").pop() ?? ""
      )
    );
  }, []);

  const updateEditingTreeItemValue = useCallback((value: string) => {
    setEditingTreeItem((current) =>
      current
        ? {
            ...current,
            value,
            errorMessage: current.errorMessage ? null : current.errorMessage,
          }
        : current
    );
  }, []);

  const cancelTreeRename = useCallback(() => {
    setEditingTreeItem(null);
  }, []);

  const commitTreeRename = useCallback(() => {
    const target = editingTreeItem;
    if (!target) return;

    const newName = target.value.trim();

    if (!newName || newName === target.path.split("/").pop()) {
      setEditingTreeItem(null);
      return;
    }

    void (async () => {
      const newPath = joinTreePath(target.parentPath, newName);
      setErrorBanner(null);
      setEditingTreeItem(null);
      setTreePendingStates([{ path: target.path, operation: "rename" }]);
      try {
        const response = await adminApi.renameFile({
          source: target.source,
          oldPath: target.path,
          newName,
        });
        if (!response.success) {
          throw new Error(`目标已存在: ${newPath}`);
        }

        setSelectedTreeItem({ source: target.source, path: newPath, type: target.type });
        setExpandedPaths((current) => {
          const previous = current[target.source] ?? [];
          const next = previous.map((path) => replaceTreePathPrefix(path, target.path, newPath));
          return { ...current, [target.source]: Array.from(new Set(next)) };
        });
        setCurrentPaths((current) => ({
          ...current,
          [target.source]: remapBrowserPathForPathChange(
            current[target.source],
            target.path,
            newPath,
            target.type
          ),
        }));
        setTabs((current) =>
          current.map((tab) => remapTabPath(tab, target.source, target.path, newPath))
        );
        setActiveTabId((current) =>
          remapActiveTabIdForPathChange(current, target.source, target.path, newPath)
        );
        await queryClient.invalidateQueries({
          queryKey: ["admin-directory-tree", target.source],
        });
        setEditingTreeItem(null);
        setNotice("已重命名。");
      } catch (error) {
        const message = getEditorActionErrorMessage(error, "重命名失败：");
        setEditingTreeItem(
          buildTreeRenameTarget(target.source, target.path, target.type, newName, message)
        );
        setErrorBanner({ message, persistent: true });
      } finally {
        setTreePendingStates([]);
      }
    })();
  }, [editingTreeItem, queryClient]);

  const moveTreeEntries = useCallback(
    async (entries: TreeSelection[], destinationPath: string) => {
      setErrorBanner(null);
      setTreePendingStates(getTreePendingStatesForPaste(entries, destinationPath, "move"));
      try {
        const response = await adminApi.moveEntries({
          source: selectedSource,
          paths: entries.map((entry) => entry.path),
          destinationPath,
        });

        const pathPairs = response.moved
          .filter((entry): entry is { path: string; nextPath: string; type: TreeItemType } =>
            Boolean(entry.nextPath)
          )
          .map((entry) => ({ oldPath: entry.path, newPath: entry.nextPath, type: entry.type }));

        if (pathPairs[0]) {
          setSelectedTreeItem({
            source: selectedSource,
            path: pathPairs[0].newPath,
            type: pathPairs[0].type,
          });
        }

        setExpandedPaths((current) => {
          const previous = current[selectedSource] ?? [];
          const next = pathPairs.reduce(
            (paths, pair) =>
              paths.map((path) => replaceTreePathPrefix(path, pair.oldPath, pair.newPath)),
            previous
          );
          return { ...current, [selectedSource]: Array.from(new Set(next)) };
        });
        setCurrentPaths((current) => ({
          ...current,
          [selectedSource]: pathPairs.reduce(
            (path, pair) =>
              remapBrowserPathForPathChange(path, pair.oldPath, pair.newPath, pair.type),
            current[selectedSource]
          ),
        }));
        setTabs((current) =>
          current.map((tab) =>
            pathPairs.reduce(
              (nextTab, pair) => remapTabPath(nextTab, selectedSource, pair.oldPath, pair.newPath),
              tab
            )
          )
        );
        setActiveTabId((current) =>
          pathPairs.reduce(
            (nextId, pair) =>
              remapActiveTabIdForPathChange(nextId, selectedSource, pair.oldPath, pair.newPath),
            current
          )
        );
        await queryClient.invalidateQueries({
          queryKey: ["admin-directory-tree", selectedSource],
        });
        setNotice(`已移动 ${response.moved.length} 项。`);
        const nextSelection = mapBatchResultsToTreeSelection(selectedSource, response.moved);
        setExpandedPaths((current) => ({
          ...current,
          [selectedSource]: Array.from(
            new Set([...(current[selectedSource] ?? []), ...getSelectionRevealPaths(nextSelection)])
          ),
        }));
        setTreeSelectionOverride(nextSelection);
        return nextSelection;
      } catch (error) {
        setErrorBanner({ message: getEditorActionErrorMessage(error, "移动失败：") });
        throw error;
      } finally {
        setTreePendingStates([]);
      }
    },
    [queryClient, selectedSource]
  );

  const copyTreeEntries = useCallback(
    async (entries: TreeSelection[], destinationPath: string) => {
      setErrorBanner(null);
      setTreePendingStates(getTreePendingStatesForPaste(entries, destinationPath, "copy"));
      try {
        const response = await adminApi.copyEntries({
          source: selectedSource,
          paths: entries.map((entry) => entry.path),
          destinationPath,
        });
        await queryClient.invalidateQueries({
          queryKey: ["admin-directory-tree", selectedSource],
        });
        setNotice(`已复制 ${response.copied.length} 项。`);
        const nextSelection = mapBatchResultsToTreeSelection(selectedSource, response.copied);
        setExpandedPaths((current) => ({
          ...current,
          [selectedSource]: Array.from(
            new Set([...(current[selectedSource] ?? []), ...getSelectionRevealPaths(nextSelection)])
          ),
        }));
        setTreeSelectionOverride(nextSelection);
        return nextSelection;
      } catch (error) {
        setErrorBanner({ message: getEditorActionErrorMessage(error, "复制失败：") });
        throw error;
      } finally {
        setTreePendingStates([]);
      }
    },
    [queryClient, selectedSource]
  );

  const deleteTreeEntries = useCallback(
    async (entries: TreeSelection[]) => {
      setErrorBanner(null);
      setTreePendingStates(
        uniqueTreePendingStates(entries.map((entry) => ({ path: entry.path, operation: "delete" })))
      );
      try {
        const response = await adminApi.deleteEntries({
          source: selectedSource,
          entries: entries.map((entry) => ({
            path: entry.path,
            type: entry.type,
          })),
        });

        const deletedEntries = response.deleted.map((entry) => ({
          path: entry.path,
          type: entry.type as TreeItemType,
        }));

        setTabs((current) => {
          const nextTabs = current.filter((tab) => {
            const context = getEditorContext(tab);
            if (context.contentSource !== selectedSource) return true;
            return !deletedEntries.some((entry) =>
              isTreeOperationTargeted(context.articlePath, entry.path, entry.type)
            );
          });
          setActiveTabId((currentActiveId) =>
            resolveActiveTabIdAfterTreeDelete(
              nextTabs,
              currentActiveId,
              selectedSource,
              deletedEntries
            )
          );
          return nextTabs;
        });
        setSelectedTreeItem((current) => {
          if (!current || current.source !== selectedSource) return current;
          return deletedEntries.some((entry) =>
            isTreeOperationTargeted(current.path, entry.path, entry.type)
          )
            ? null
            : current;
        });
        setCurrentPaths((current) => ({
          ...current,
          [selectedSource]: resolveBrowserPathAfterTreeDelete(
            current[selectedSource],
            deletedEntries
          ),
        }));
        await queryClient.invalidateQueries({
          queryKey: ["admin-directory-tree", selectedSource],
        });
        setNotice(`已删除 ${response.deleted.length} 项。`);
      } catch (error) {
        setErrorBanner({ message: getEditorActionErrorMessage(error, "删除失败：") });
        throw error;
      } finally {
        setTreePendingStates([]);
      }
    },
    [queryClient, selectedSource]
  );

  const editorSidebarPanel = useMemo(
    () => ({
      label: "文件浏览器",
      preferredMode: "route" as const,
      content: (
        <EditorFileBrowser
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
          selectionOverride={treeSelectionOverride}
          onSelectionOverrideApplied={() => setTreeSelectionOverride(null)}
          activeItemPath={activeTreePath}
          activeItemType={activeTreeType}
          activeItemSource={activeBrowserSource}
          editingItem={editingTreeItem}
          pendingStates={treePendingStates}
          onEditingValueChange={updateEditingTreeItemValue}
          onEditingCommit={commitTreeRename}
          onEditingCancel={cancelTreeRename}
          onDirectoryExpand={handleDirectoryExpand}
          onFileOpen={handleFileOpen}
          onFilePermanentOpen={handleFilePermanentOpen}
          onCreateFile={createFileInTree}
          onCreateDirectory={createDirectoryInTree}
          onStartRename={startTreeRename}
          onMoveEntries={moveTreeEntries}
          onCopyEntries={copyTreeEntries}
          onDeleteEntries={deleteTreeEntries}
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
      copyTreeEntries,
      createDirectoryInTree,
      createFileInTree,
      deleteTreeEntries,
      directoryItemsByPath,
      editingTreeItem,
      treePendingStates,
      expandedPaths,
      handleDirectoryExpand,
      handleFileOpen,
      handleFilePermanentOpen,
      loadingPaths,
      refetchDirectory,
      navigateUp,
      selectedSource,
      sourcesQuery.isLoading,
      startTreeRename,
      treeLoading,
      moveTreeEntries,
      rootItems,
      treeSelectionOverride,
      updateEditingTreeItemValue,
    ]
  );

  useAppShellSidebar(editorSidebarPanel);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <AdminToastViewport />
      <PageHeader
        title={editorHeaderCopy.title}
        description={editorHeaderCopy.description}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={activeEditorSurface === "text" ? "/admin/posts/editor" : "/admin/posts"}>
                <ArrowLeft className="size-4" />
                {editorHeaderCopy.backLabel}
              </a>
            </Button>
            {activeEditorSurface === "article" ? (
              <Button variant="outline" onClick={createEmptyDraft} data-testid="editor-create-post">
                <FilePlus2 className="size-4" />
                {editorHeaderCopy.newLabel}
              </Button>
            ) : null}
            {activeEditorSurface === "article" ? (
              <Button variant="outline" onClick={openPreviewWindow} disabled={!previewEnabled}>
                <Eye className="size-4" />
                前台预览
              </Button>
            ) : null}
            {activeEditorSurface === "article" ? (
              <Button
                variant="outline"
                onClick={() => uploadInputRef.current?.click()}
                disabled={!attachmentEnabled || uploadPending}
                title="上传图片或附件并插入到当前内容"
              >
                {uploadPending ? <Spinner /> : <ImagePlus className="size-4" />}
                插入附件
              </Button>
            ) : null}
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
        <EditorTabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={setActiveTabId}
          onClose={requestCloseTab}
        />

        <section className="min-h-0 flex-1 p-0" data-testid="editor">
          {!activeTab ? (
            <div className="p-4 lg:p-6">
              <EmptyState
                title={editorHeaderCopy.emptyTitle}
                description={editorHeaderCopy.emptyDescription}
                action={
                  editorHeaderCopy.emptyActionLabel ? (
                    <Button onClick={createEmptyDraft}>
                      <FilePlus2 className="size-4" />
                      {editorHeaderCopy.emptyActionLabel}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/58 px-4 py-4">
                <div>
                  <div className="text-base font-semibold">
                    {activeTab.label || editorHeaderCopy.untitledLabel}
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {activeTab.kind === "database"
                      ? activeTab.database?.slug || editorHeaderCopy.inlineDraftLabel
                      : `${activeTab.file?.source}:${activeTab.file?.path}`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/36 p-1 shadow-inner shadow-shadow-inset">
                  {activeEditorModes.includes("wysiwyg") ? (
                    <Button
                      size="sm"
                      variant={activeTab.mode === "wysiwyg" ? "default" : "outline"}
                      onClick={() => {
                        syncActiveTabFromEditor({ markDirty: activeTab.dirty });
                        updateActiveTab((tab) => ({ ...tab, mode: "wysiwyg" }));
                      }}
                    >
                      <PenSquare className="size-4" />
                      WYSIWYG
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant={activeTab.mode === "source" ? "default" : "outline"}
                    onClick={() => {
                      syncActiveTabFromEditor({ markDirty: activeTab.dirty });
                      updateActiveTab((tab) => ({ ...tab, mode: "source" }));
                    }}
                  >
                    <Code2 className="size-4" />
                    Source
                  </Button>
                  {activeEditorModes.includes("compare") ? (
                    <Button
                      size="sm"
                      variant={activeTab.mode === "compare" ? "default" : "outline"}
                      onClick={() => {
                        syncActiveTabFromEditor({ markDirty: activeTab.dirty });
                        updateActiveTab((tab) => ({ ...tab, mode: "compare" }));
                      }}
                    >
                      <Columns2 className="size-4" />
                      对照
                    </Button>
                  ) : null}
                  {activeTab.kind === "file" && isTextFileDraft(activeTab.file) ? (
                    <Badge tone="outline">纯文本</Badge>
                  ) : null}
                  <Badge
                    tone={activeTab.dirty ? "warning" : "muted"}
                    data-testid="editor-status-badge"
                  >
                    {activeTab.dirty ? "未保存" : "已保存"}
                  </Badge>
                </div>
              </div>

              <UniversalEditor
                ref={editorRef}
                key={activeTab.id}
                editorId={activeTab.id}
                initialContent={activeContent}
                onFrontmatterDiagnosticsChange={(diagnostics) => {
                  frontmatterDiagnosticsRef.current = diagnostics;
                }}
                onContentChange={(nextContent: string, meta?: EditorChangeMeta) =>
                  updateActiveTabContent(nextContent, {
                    markDirty: meta?.source !== "programmatic",
                  })
                }
                placeholder={
                  activeTab.kind === "file" && isTextFileDraft(activeTab.file)
                    ? editorHeaderCopy.placeholder
                    : editorHeaderCopy.placeholder
                }
                attachmentBasePath={buildAttachmentUploadPath(
                  activeEditorContext?.articlePath ?? "/__unknown__.md",
                  "placeholder.bin"
                ).replace(/\/placeholder\.bin$/, "")}
                articlePath={activeEditorContext?.articlePath ?? "/__unknown__.md"}
                contentSource={activeEditorContext?.contentSource ?? "local"}
                contentKind={
                  activeTab.kind === "file" && isTextFileDraft(activeTab.file) ? "text" : "markdown"
                }
                mode={activeTab.mode}
                frontmatterSuggestions={frontmatterSuggestions}
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
