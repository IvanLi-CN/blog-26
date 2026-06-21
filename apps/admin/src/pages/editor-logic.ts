import { parseFrontmatterMap, stripFrontmatter } from "@/lib/frontmatter-document";
import { rebasePersistedLocalLinks, rebasePersistedLocalReferences } from "@/lib/persisted-paths";
import {
  buildPostAuthoringDocument,
  extractPostDraftFields,
  type PostContractStructuredFields,
} from "@/lib/post-body-contract";
import {
  getAncestorTreePaths,
  getParentTreePath,
  normalizeTreePath,
  replaceTreePathPrefix,
  type TreeItemType,
  type TreeSelection,
} from "~/components/editor-file-browser";

export type EditorMode = "wysiwyg" | "source" | "compare";
export type FileEditorContentKind = "markdown" | "text";
export type EditorSurfaceKind = "article" | "text";

export type DatabaseDraft = {
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
  category?: string | null;
  author?: string | null;
  image?: string | null;
  publishDate?: number | null;
  updateDate?: number | null;
  tags?: string[] | string | null;
};

export type FileDraft = {
  source: "local";
  path: string;
  content: string;
  contentKind: FileEditorContentKind;
  size?: number;
};

export type EditorTab = {
  id: string;
  label: string;
  kind: "database" | "file";
  mode: EditorMode;
  dirty: boolean;
  temporary?: boolean;
  database?: DatabaseDraft;
  file?: FileDraft;
};

export function isMarkdownFileDraft(file: FileDraft | null | undefined) {
  return file?.contentKind === "markdown";
}

export function isTextFileDraft(file: FileDraft | null | undefined) {
  return file?.contentKind === "text";
}

export function getDefaultFileEditorMode(contentKind: FileEditorContentKind): EditorMode {
  return contentKind === "markdown" ? "wysiwyg" : "source";
}

export function getAvailableEditorModes(tab: EditorTab | null | undefined): EditorMode[] {
  if (tab?.kind === "file" && isTextFileDraft(tab.file)) {
    return ["source"];
  }
  return ["wysiwyg", "source", "compare"];
}

export function isPreviewableEditorTab(tab: EditorTab | null | undefined) {
  if (!tab) return false;
  if (tab.kind === "database") return true;
  return isMarkdownFileDraft(tab.file);
}

export function supportsEditorAttachments(tab: EditorTab | null | undefined) {
  if (!tab) return false;
  if (tab.kind === "database") return true;
  return isMarkdownFileDraft(tab.file);
}

export function getEditorSurfaceKind(tab: EditorTab | null | undefined): EditorSurfaceKind {
  if (!tab) {
    return "article";
  }
  if (tab.kind === "file" && isTextFileDraft(tab.file)) {
    return "text";
  }
  return "article";
}

export function getEditorHeaderCopy(tab: EditorTab | null | undefined) {
  if (getEditorSurfaceKind(tab) === "text") {
    return {
      title: "纯文本编辑器",
      description: "打开纯文本文件，直接编辑并保存到本地内容目录。",
      backLabel: "返回文件浏览器",
      newLabel: "新建文章",
      emptyTitle: "选择一个纯文本文件开始编辑",
      emptyDescription: "从左侧文件树选择一个可编辑的纯文本文件。",
      emptyActionLabel: null,
      placeholder: "开始编辑纯文本文件...",
      untitledLabel: "未命名文本",
      inlineDraftLabel: "纯文本文件",
    };
  }

  return {
    title: "文章编辑器",
    description: "打开文章、切换编辑模式，并在保存前检查预览。",
    backLabel: "返回文章列表",
    newLabel: "新建文章",
    emptyTitle: "选择一个文件开始编辑",
    emptyDescription: "从左侧选择已有内容，或新建一篇文章。",
    emptyActionLabel: "新建文章",
    placeholder: "开始写作您的文章...",
    untitledLabel: "未命名文章",
    inlineDraftLabel: "新建文章",
  };
}

export function shouldMarkLiveEditorContentDirty(
  liveContent: string,
  persistedContent: string,
  options: { preserveCurrentDirtyState?: boolean } = {}
) {
  if (liveContent === persistedContent) {
    return false;
  }

  return !options.preserveCurrentDirtyState;
}

export function normalizeArticlePath(
  path: string | null | undefined,
  fallbackSlug: string
): string {
  const candidate = path?.trim();
  if (candidate) {
    return candidate.replace(/^\/+/, "");
  }
  return `blog/${fallbackSlug || "untitled"}.md`;
}

function getEditorContext(tab: EditorTab): {
  contentSource: "local";
  articlePath: string;
} {
  if (tab.kind === "file" && tab.file) {
    return {
      contentSource: tab.file.source,
      articlePath: tab.file.path,
    };
  }

  return {
    contentSource: tab.database?.source ?? "local",
    articlePath: normalizeArticlePath(tab.database?.filePath, tab.database?.slug ?? "untitled"),
  };
}

export function deriveFileLabel(path: string, content: string) {
  const frontmatterTitle = parseFrontmatterMap(content).title?.trim() ?? "";
  if (frontmatterTitle) {
    return frontmatterTitle;
  }

  return path.split("/").filter(Boolean).pop() || path || "untitled.md";
}

function getStructuredDraftFields(draft: DatabaseDraft): PostContractStructuredFields {
  return {
    title: draft.title,
    slug: draft.slug,
    excerpt: draft.excerpt,
    draft: draft.draft,
    public: draft.public,
    category: draft.category,
    author: draft.author,
    image: draft.image,
    publishDate: draft.publishDate,
    updateDate: draft.updateDate,
    tags: draft.tags,
  };
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

function deriveExcerptFromContent(content: string) {
  return stripFrontmatter(content)
    .replace(/[#*`_~[\]()!-]/g, "")
    .trim()
    .slice(0, 150);
}

export function getArticleIdentity(source: "local", articlePath: string | null | undefined) {
  return `${source}:${normalizeTreePath(articlePath)}`;
}

export function getTabArticleIdentity(tab: EditorTab) {
  const context = getEditorContext(tab);
  return getArticleIdentity(context.contentSource, context.articlePath);
}

export function deriveDatabaseDraftState(draft: DatabaseDraft, content: string) {
  const extracted = extractPostDraftFields(content, getStructuredDraftFields(draft));
  const title = extracted.title;
  const slug = extracted.slug || deriveSlugValue(title);
  const excerpt = extracted.excerpt || deriveExcerptFromContent(content);

  return {
    title,
    slug,
    excerpt,
    draft: extracted.draft,
    public: extracted.public,
    category: extracted.category,
    author: extracted.author,
    image: extracted.image,
    publishDate: extracted.publishDate,
    updateDate: extracted.updateDate,
    tags: extracted.tags,
  };
}

export function buildDatabaseAuthoringDocument(
  draft: DatabaseDraft,
  options?: { preferEmbeddedFrontmatter?: boolean }
) {
  return buildPostAuthoringDocument(
    {
      ...getStructuredDraftFields(draft),
      body: draft.content,
    },
    options
  );
}

export function isBlankEditorContent(content: string) {
  return stripFrontmatter(content).trim().length === 0;
}

export function mapBatchResultsToTreeSelection(
  source: "local",
  entries: Array<{ nextPath?: string; type: TreeItemType }>
) {
  return entries
    .filter((entry): entry is { nextPath: string; type: TreeItemType } => Boolean(entry.nextPath))
    .map((entry) => ({
      source,
      path: entry.nextPath,
      type: entry.type,
    }));
}

export function getSelectionRevealPaths(entries: TreeSelection[]) {
  return Array.from(
    new Set(
      entries
        .map((entry) => getParentTreePath(entry.path))
        .filter((path): path is string => Boolean(path))
        .flatMap((path) => getAncestorTreePaths(`${path}/__selection__.md`))
    )
  );
}

function rebaseOpenMarkdownContent(content: string, oldPath: string, newPath: string) {
  if (!/\.(?:md|markdown|mdx)$/i.test(oldPath) && !/\.(?:md|markdown|mdx)$/i.test(newPath)) {
    return content;
  }
  return rebasePersistedLocalLinks(content, oldPath, newPath).content;
}

function rebaseOpenMarkdownReferences(
  content: string,
  markdownPath: string,
  oldPath: string,
  newPath: string
) {
  if (!/\.(?:md|markdown|mdx)$/i.test(markdownPath)) {
    return content;
  }
  return rebasePersistedLocalReferences(content, markdownPath, oldPath, newPath).content;
}

export function remapTabPath(tab: EditorTab, source: "local", oldPath: string, newPath: string) {
  const normalizedOldPath = normalizeTreePath(oldPath);
  const normalizedNewPath = normalizeTreePath(newPath);

  if (tab.kind === "file" && tab.file?.source === source) {
    const currentFilePath = normalizeTreePath(tab.file.path);
    if (
      currentFilePath === normalizedOldPath ||
      currentFilePath.startsWith(`${normalizedOldPath}/`)
    ) {
      const nextFilePath = replaceTreePathPrefix(
        currentFilePath,
        normalizedOldPath,
        normalizedNewPath
      );
      const nextContent = rebaseOpenMarkdownContent(
        tab.file.content,
        currentFilePath,
        nextFilePath
      );
      return {
        ...tab,
        id: `file:${source}:${nextFilePath}`,
        label: deriveFileLabel(nextFilePath, nextContent),
        file: {
          ...tab.file,
          path: nextFilePath,
          content: nextContent,
        },
      };
    }

    const nextContent = rebaseOpenMarkdownReferences(
      tab.file.content,
      currentFilePath,
      normalizedOldPath,
      normalizedNewPath
    );
    if (nextContent !== tab.file.content) {
      return {
        ...tab,
        file: {
          ...tab.file,
          content: nextContent,
        },
      };
    }
  }

  if (tab.kind === "database" && tab.database?.source === source) {
    const currentFilePath = normalizeTreePath(tab.database.filePath);
    if (
      currentFilePath === normalizedOldPath ||
      currentFilePath.startsWith(`${normalizedOldPath}/`)
    ) {
      const nextFilePath = replaceTreePathPrefix(
        currentFilePath,
        normalizedOldPath,
        normalizedNewPath
      );
      const nextContent = rebaseOpenMarkdownContent(
        tab.database.content,
        currentFilePath,
        nextFilePath
      );
      const derivedDraft = deriveDatabaseDraftState(tab.database, nextContent);
      return {
        ...tab,
        id: `post:${nextFilePath}`,
        label: derivedDraft.title || tab.label,
        database: {
          ...tab.database,
          ...derivedDraft,
          postId: nextFilePath,
          filePath: nextFilePath,
          content: nextContent,
        },
      };
    }

    const nextContent = rebaseOpenMarkdownReferences(
      tab.database.content,
      currentFilePath,
      normalizedOldPath,
      normalizedNewPath
    );
    if (nextContent !== tab.database.content) {
      const derivedDraft = deriveDatabaseDraftState(tab.database, nextContent);
      return {
        ...tab,
        label: derivedDraft.title || tab.label,
        database: {
          ...tab.database,
          ...derivedDraft,
          content: nextContent,
        },
      };
    }
  }

  return tab;
}

export function remapActiveTabIdForPathChange(
  activeTabId: string | null,
  source: "local",
  oldPath: string,
  newPath: string
) {
  if (!activeTabId) return activeTabId;
  const normalizedOldPath = normalizeTreePath(oldPath);
  const normalizedNewPath = normalizeTreePath(newPath);
  const filePrefix = `file:${source}:`;
  const databasePrefix = "post:";
  const prefix = activeTabId.startsWith(filePrefix)
    ? filePrefix
    : activeTabId.startsWith(databasePrefix)
      ? databasePrefix
      : null;
  if (!prefix) return activeTabId;

  const currentPath = normalizeTreePath(activeTabId.slice(prefix.length));
  if (currentPath !== normalizedOldPath && !currentPath.startsWith(`${normalizedOldPath}/`)) {
    return activeTabId;
  }

  const nextPath = replaceTreePathPrefix(currentPath, normalizedOldPath, normalizedNewPath);
  return `${prefix}${nextPath}`;
}

export function remapBrowserPathForPathChange(
  browserPath: string,
  oldPath: string,
  newPath: string,
  type: TreeItemType
) {
  const normalizedBrowserPath = normalizeTreePath(browserPath);
  const normalizedOldPath = normalizeTreePath(oldPath);

  if (type !== "directory" || !normalizedOldPath) return normalizedBrowserPath;
  if (
    normalizedBrowserPath !== normalizedOldPath &&
    !normalizedBrowserPath.startsWith(`${normalizedOldPath}/`)
  ) {
    return normalizedBrowserPath;
  }

  return replaceTreePathPrefix(normalizedBrowserPath, normalizedOldPath, newPath);
}

export function resolveActiveTabIdAfterTreeDelete(
  tabs: EditorTab[],
  activeTabId: string | null,
  source: "local",
  deletedEntries: Array<{ path: string; type: TreeItemType }>
) {
  if (!activeTabId) return activeTabId;
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  if (!activeTab) return tabs[tabs.length - 1]?.id ?? null;

  const activeContext = getEditorContext(activeTab);
  if (activeContext.contentSource !== source) return activeTabId;

  const activeDeleted = deletedEntries.some((entry) =>
    isTreeOperationTargeted(activeContext.articlePath, entry.path, entry.type)
  );
  return activeDeleted ? (tabs[tabs.length - 1]?.id ?? null) : activeTabId;
}

export function resolveBrowserPathAfterTreeDelete(
  browserPath: string,
  deletedEntries: Array<{ path: string; type: TreeItemType }>
) {
  const normalizedBrowserPath = normalizeTreePath(browserPath);
  const deletedDirectory = deletedEntries.find(
    (entry) =>
      entry.type === "directory" &&
      isTreeOperationTargeted(normalizedBrowserPath, entry.path, entry.type)
  );

  return deletedDirectory ? getParentTreePath(deletedDirectory.path) : normalizedBrowserPath;
}

export function isTreeOperationTargeted(
  entryPath: string,
  targetPath: string,
  targetType: TreeItemType
) {
  const normalizedEntryPath = normalizeTreePath(entryPath);
  const normalizedTargetPath = normalizeTreePath(targetPath);
  if (!normalizedTargetPath) return false;
  if (normalizedEntryPath === normalizedTargetPath) return true;
  return targetType === "directory" && normalizedEntryPath.startsWith(`${normalizedTargetPath}/`);
}
