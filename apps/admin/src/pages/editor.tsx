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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorChangeMeta } from "@/editor/editor-change";
import {
  AdminApiError,
  type AdminPost,
  adminApi,
  type DataSourceInfo,
  type FileItem,
} from "@/lib/admin-api-client";
import { parseFrontmatterMap } from "@/lib/frontmatter-document";
import { isMemoContentPath } from "@/lib/memo-paths";
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
  type DatabaseDraft,
  deriveDatabaseDraftState,
  deriveFileLabel,
  type EditorTab,
  getArticleIdentity,
  getSelectionRevealPaths,
  getTabArticleIdentity,
  isBlankEditorContent,
  isTreeOperationTargeted,
  mapBatchResultsToTreeSelection,
  normalizeArticlePath,
  remapActiveTabIdForPathChange,
  remapBrowserPathForPathChange,
  remapTabPath,
  resolveActiveTabIdAfterTreeDelete,
  resolveBrowserPathAfterTreeDelete,
  shouldMarkLiveEditorContentDirty,
} from "./editor-logic";

function insertEditorTabAtStart(current: EditorTab[], tab: EditorTab) {
  return [tab, ...current.filter((item) => item.id !== tab.id)];
}

const EMPTY_SOURCES: DataSourceInfo[] = [];
const EMPTY_FILE_ITEMS: FileItem[] = [];

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
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [closeTargetTabId, setCloseTargetTabId] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [didHandleInitialUrl, setDidHandleInitialUrl] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<UniversalEditorRef | null>(null);
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
    showAdminToast("danger", errorBanner, { autoClose: 5600 });
    setErrorBanner(null);
  }, [errorBanner]);

  useEffect(() => {
    if (loadingMessage) {
      if (loadingToastIdRef.current) {
        dismissAdminToast(loadingToastIdRef.current);
      }
      loadingToastIdRef.current = showAdminToast("loading", loadingMessage, {
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

      return insertEditorTabAtStart(preservedTabs, {
        id: nextActiveTabId,
        label: derivedDraft.title || post.slug || post.id,
        kind: "database",
        mode,
        dirty: false,
        database: {
          ...databaseDraft,
          ...derivedDraft,
        },
      });
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
        const label = deriveFileLabel(filePath, fileContent);
        const fileIdentity = getArticleIdentity(source, filePath);
        const tab: EditorTab = {
          id: `file:${source}:${filePath}`,
          label,
          kind: "file",
          mode: "wysiwyg",
          dirty: false,
          temporary:
            pendingFileTabsRef.current.get(targetIdentity)?.temporary ?? requestedTemporary,
          file: {
            source,
            path: filePath,
            content: fileContent,
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
        setErrorBanner(`未找到文件：${getErrorMessage(error)}`);
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
      void openFileTab(selectedSource, item.path, { temporary: true });
    },
    [openFileTab, selectedSource]
  );

  const handleFilePermanentOpen = useCallback(
    (item: FileItem) => {
      if (item.type !== "file") return;
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
        setErrorBanner(getEditorActionErrorMessage(error, "创建失败："));
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
    setEditingTreeItem({
      ...target,
      parentPath: getParentTreePath(target.path),
      value: target.path.split("/").pop() ?? "",
    });
  }, []);

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
      setTreePendingStates([{ path: target.path, operation: "rename" }]);
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
        setNotice("已重命名。");
      } catch (error) {
        setErrorBanner(getErrorMessage(error));
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
        setErrorBanner(getEditorActionErrorMessage(error, "移动失败："));
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
        setErrorBanner(getEditorActionErrorMessage(error, "复制失败："));
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
        setErrorBanner(getEditorActionErrorMessage(error, "删除失败："));
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
                      syncActiveTabFromEditor({ markDirty: activeTab.dirty });
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
                      syncActiveTabFromEditor({ markDirty: activeTab.dirty });
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
                      syncActiveTabFromEditor({ markDirty: activeTab.dirty });
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
                onContentChange={(nextContent: string, meta?: EditorChangeMeta) =>
                  updateActiveTabContent(nextContent, {
                    markDirty: meta?.source !== "programmatic",
                  })
                }
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
