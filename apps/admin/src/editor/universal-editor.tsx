import { Code2, Eye } from "lucide-react";
import { nanoid } from "nanoid";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { MilkdownEditor } from "@/components/memos/MilkdownEditor";
import type { EditorChangeMeta } from "@/editor/editor-change";
import { USER_EDITOR_CHANGE } from "@/editor/editor-change";
import {
  type FrontmatterDiagnostic,
  parseFrontmatterDocument,
  updateDocumentBody,
  updateFrontmatterDocument,
  validateFrontmatterText,
} from "@/lib/frontmatter-document";
import { rewriteApiFilesUrlsToRelative } from "@/lib/persisted-paths";
import { FrontmatterBlock } from "~/editor/frontmatter-block";
import { SourceEditor } from "~/editor/source-editor";

type EditorMode = "wysiwyg" | "source" | "compare";

export type UniversalEditorRef = {
  processInlineImages: (content: string) => Promise<string>;
  getContent: () => string;
  setContent: (content: string) => void;
};

export type UniversalEditorProps = {
  initialContent: string;
  onContentChange?: (content: string, meta?: EditorChangeMeta) => void;
  onFrontmatterDiagnosticsChange?: (diagnostics: FrontmatterDiagnostic[]) => void;
  placeholder?: string;
  attachmentBasePath?: string;
  articlePath?: string;
  contentSource?: "local";
  title?: string;
  className?: string;
  mode?: EditorMode;
  editorId?: string;
  frontmatterSuggestions?: {
    tags?: string[];
    categories?: string[];
  };
  "data-testid"?: string;
};

function getArticleSlug(path: string) {
  if (!path) return "untitled";
  const fileName = path.split("/").pop() || "untitled";
  const stem = fileName.replace(/\.(md|markdown)$/i, "");
  return (
    stem
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "untitled"
  );
}

export const UniversalEditor = forwardRef<UniversalEditorRef, UniversalEditorProps>(
  (
    {
      initialContent,
      onContentChange,
      onFrontmatterDiagnosticsChange,
      placeholder = "开始编写...",
      attachmentBasePath = "assets",
      articlePath = "",
      contentSource = "local",
      title,
      className = "",
      mode = "wysiwyg",
      editorId = "default",
      frontmatterSuggestions,
      "data-testid": dataTestId,
    },
    ref
  ) => {
    const [content, setContent] = useState(initialContent);
    const [currentMode, setCurrentMode] = useState<EditorMode>(mode);
    const lastInitialContentRef = useRef(initialContent);
    const latestContentRef = useRef(initialContent);
    const parsedDocument = useMemo(() => parseFrontmatterDocument(content), [content]);
    const frontmatterDiagnostics = useMemo(
      () => validateFrontmatterText(parsedDocument.frontmatterText).diagnostics,
      [parsedDocument.frontmatterText]
    );

    const processInlineImages = useCallback(
      async (markdown: string) => {
        const base64ImageRegex = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;
        let processed = markdown;
        const matches = Array.from(markdown.matchAll(base64ImageRegex));

        for (const match of matches) {
          const [fullMatch, altText, imageType, base64Data] = match;
          try {
            const articleSlug = getArticleSlug(articlePath);
            const filename = `${articleSlug}-${nanoid(8)}.${imageType}`;
            const uploadPath = `${attachmentBasePath}/${filename}`;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const blob = new Blob([new Uint8Array(byteNumbers)], { type: `image/${imageType}` });
            const response = await fetch(`/api/files/${contentSource}/${uploadPath}`, {
              method: "POST",
              headers: { "Content-Type": `image/${imageType}` },
              body: blob,
            });
            if (!response.ok) throw new Error(`上传失败: ${response.status}`);
            processed = processed.replace(fullMatch, `![${altText}](./assets/${filename})`);
          } catch (error) {
            console.error("❌ [AdminUniversalEditor] 处理内联图片失败:", error);
          }
        }

        return processed;
      },
      [articlePath, attachmentBasePath, contentSource]
    );

    useImperativeHandle(
      ref,
      () => ({
        processInlineImages,
        getContent: () => latestContentRef.current,
        setContent: (nextContent: string) => {
          latestContentRef.current = nextContent;
          setContent(nextContent);
        },
      }),
      [processInlineImages]
    );

    const handleContentChange = (
      nextContent: string,
      meta: EditorChangeMeta = USER_EDITOR_CHANGE
    ) => {
      latestContentRef.current = nextContent;
      setContent(nextContent);
      onContentChange?.(nextContent, meta);
    };

    const handleFrontmatterChange = (nextFrontmatterText: string) => {
      handleContentChange(
        updateFrontmatterDocument(latestContentRef.current, nextFrontmatterText),
        USER_EDITOR_CHANGE
      );
    };

    const handleBodyChange = (nextBody: string, meta?: EditorChangeMeta) => {
      handleContentChange(
        updateDocumentBody(latestContentRef.current, nextBody),
        meta ?? USER_EDITOR_CHANGE
      );
    };

    const uploadImage = async (
      file: File
    ): Promise<{ persistedPath: string; runtimeUrl: string }> => {
      const articleSlug = getArticleSlug(articlePath);
      const extension = file.name.split(".").pop() || "jpg";
      const filename = `${articleSlug}-${nanoid(8)}.${extension}`;
      const uploadPath = `${attachmentBasePath}/${filename}`;

      const response = await fetch(`/api/files/${contentSource}/${uploadPath}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status}`);
      }

      const result = await response.json();
      return {
        persistedPath: `./assets/${filename}`,
        runtimeUrl:
          typeof result?.url === "string" && result.url.length > 0
            ? result.url
            : `/api/files/${contentSource}/${uploadPath}`,
      };
    };

    const handleImageUploadForSource = async (file: File) => {
      const { persistedPath } = await uploadImage(file);
      return persistedPath;
    };

    const handleImageUploadForWysiwyg = async (file: File) => {
      const { runtimeUrl } = await uploadImage(file);
      return runtimeUrl;
    };

    const convertApiUrlsToRelativePaths = (markdown: string) => {
      const cleanedArticlePath = articlePath.replace(/^\/+/, "");
      const baseDir = cleanedArticlePath
        ? /\.[A-Za-z0-9]+$/.test(cleanedArticlePath)
          ? cleanedArticlePath
          : `${cleanedArticlePath.replace(/\/+$/, "")}/__unknown__.md`
        : "__unknown__.md";
      return rewriteApiFilesUrlsToRelative(markdown, baseDir).content;
    };

    useEffect(() => {
      if (initialContent !== lastInitialContentRef.current && initialContent !== content) {
        lastInitialContentRef.current = initialContent;
        latestContentRef.current = initialContent;
        setContent(initialContent);
      }
    }, [initialContent, content]);

    useEffect(() => {
      if (mode !== currentMode) {
        setCurrentMode(mode);
      }
    }, [mode, currentMode]);

    useEffect(() => {
      onFrontmatterDiagnosticsChange?.(frontmatterDiagnostics);
    }, [frontmatterDiagnostics, onFrontmatterDiagnosticsChange]);

    return (
      <div className={`flex h-full min-h-0 flex-col ${className}`} data-testid={dataTestId}>
        {title ? (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {currentMode === "wysiwyg" ? (
            <div className="admin-editor-surface admin-scrollbar flex h-full flex-col gap-4 overflow-auto p-4">
              <FrontmatterBlock
                value={parsedDocument.frontmatterText}
                onChange={handleFrontmatterChange}
                diagnostics={frontmatterDiagnostics}
                suggestions={frontmatterSuggestions}
              />
              <MilkdownEditor
                key={`milkdown-editor-${editorId}`}
                content={parsedDocument.body}
                onChange={handleBodyChange}
                frontmatterHandling="body-only"
                placeholder={placeholder}
                className="min-h-0 w-full flex-1 admin-editor-wysiwyg"
                data-testid="content-input"
                editorId={`wysiwyg-${editorId}`}
                articlePath={articlePath}
                contentSource={contentSource}
                onImageUpload={handleImageUploadForWysiwyg}
              />
            </div>
          ) : null}

          {currentMode === "source" ? (
            <SourceEditor
              content={convertApiUrlsToRelativePaths(content)}
              onChange={(nextContent) => handleContentChange(nextContent, USER_EDITOR_CHANGE)}
              placeholder={placeholder}
              className="h-full rounded-none border-0 bg-transparent shadow-none"
              data-testid="content-input"
              onImageUpload={handleImageUploadForSource}
              textareaLabel="Markdown source editor"
              textareaName={`${editorId}-source`}
            />
          ) : null}

          {currentMode === "compare" ? (
            <div className="admin-editor-compare grid h-full min-h-0 overflow-hidden lg:grid-cols-[minmax(25rem,0.96fr)_minmax(0,1fr)]">
              <section className="admin-editor-compare-pane admin-editor-compare-source flex min-h-0 min-w-0 flex-col border-b border-border/58 lg:border-r lg:border-b-0">
                <div className="admin-editor-compare-header">
                  <div className="flex min-w-0 items-center gap-2">
                    <Code2 className="h-4 w-4 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">Markdown</div>
                      <div className="text-xs text-muted-foreground">编辑源文</div>
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <SourceEditor
                    content={convertApiUrlsToRelativePaths(content)}
                    onChange={(nextContent) => handleContentChange(nextContent, USER_EDITOR_CHANGE)}
                    placeholder={placeholder}
                    className="admin-editor-compare-source-editor h-full min-h-0 rounded-none border-0 bg-transparent shadow-none"
                    data-testid="content-input"
                    onImageUpload={handleImageUploadForSource}
                    textareaLabel="Markdown source editor"
                    textareaName={`${editorId}-compare-source`}
                  />
                </div>
              </section>
              <section className="admin-editor-compare-pane admin-editor-compare-preview flex min-h-0 min-w-0 flex-col">
                <div className="admin-editor-compare-header">
                  <div className="flex min-w-0 items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">Preview</div>
                      <div className="text-xs text-muted-foreground">Milkdown 只读排版</div>
                    </div>
                  </div>
                </div>
                <div className="admin-editor-surface admin-editor-compare-preview-surface admin-scrollbar min-h-0 flex-1 overflow-auto p-4">
                  <FrontmatterBlock
                    value={parsedDocument.frontmatterText}
                    readOnly
                    className="mb-4"
                    diagnostics={frontmatterDiagnostics}
                  />
                  <MilkdownEditor
                    key={`milkdown-compare-readonly-${editorId}`}
                    content={parsedDocument.body}
                    onChange={handleBodyChange}
                    frontmatterHandling="body-only"
                    placeholder={placeholder}
                    className="h-full min-h-0 w-full admin-editor-wysiwyg"
                    data-testid="content-preview"
                    editorId={`compare-readonly-${editorId}`}
                    articlePath={articlePath}
                    contentSource={contentSource}
                    onImageUpload={handleImageUploadForWysiwyg}
                    readOnly
                  />
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

UniversalEditor.displayName = "UniversalEditor";
