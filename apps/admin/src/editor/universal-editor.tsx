import { nanoid } from "nanoid";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { MilkdownEditor } from "@/components/memos/MilkdownEditor";
import { resolveImagePath } from "@/lib/image-utils";
import { rewriteApiFilesUrlsToRelative } from "@/lib/persisted-paths";
import { SourceEditor } from "~/editor/source-editor";

type EditorMode = "wysiwyg" | "source" | "preview";

export type UniversalEditorRef = {
  processInlineImages: (content: string) => Promise<string>;
  getContent: () => string;
};

export type UniversalEditorProps = {
  initialContent: string;
  onContentChange?: (content: string) => void;
  placeholder?: string;
  attachmentBasePath?: string;
  articlePath?: string;
  contentSource?: "webdav" | "local";
  title?: string;
  className?: string;
  mode?: EditorMode;
  editorId?: string;
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
      placeholder = "开始编写...",
      attachmentBasePath = "assets",
      articlePath = "",
      contentSource = "local",
      title,
      className = "",
      mode = "wysiwyg",
      editorId = "default",
      "data-testid": dataTestId,
    },
    ref
  ) => {
    const [content, setContent] = useState(initialContent);
    const [currentMode, setCurrentMode] = useState<EditorMode>(mode);
    const lastInitialContentRef = useRef(initialContent);

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
        getContent: () => content,
      }),
      [content, processInlineImages]
    );

    const handleContentChange = (nextContent: string) => {
      setContent(nextContent);
      onContentChange?.(nextContent);
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

    const extractBodyContent = (markdown: string) => {
      const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
      const matched = markdown.match(frontmatterRegex);
      return matched ? matched[2] : markdown;
    };

    useEffect(() => {
      if (initialContent !== lastInitialContentRef.current && initialContent !== content) {
        lastInitialContentRef.current = initialContent;
        setContent(initialContent);
      }
    }, [initialContent, content]);

    useEffect(() => {
      if (mode !== currentMode) {
        setCurrentMode(mode);
      }
    }, [mode, currentMode]);

    return (
      <div className={`flex h-full min-h-[34rem] flex-col ${className}`} data-testid={dataTestId}>
        {title ? (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/80">
          {currentMode === "wysiwyg" ? (
            <div className="admin-editor-surface admin-scrollbar h-full overflow-auto">
              <MilkdownEditor
                key={`milkdown-editor-${editorId}`}
                content={content}
                onChange={handleContentChange}
                placeholder={placeholder}
                className="h-full min-h-[34rem] w-full admin-editor-wysiwyg"
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
              onChange={handleContentChange}
              placeholder={placeholder}
              className="h-full"
              data-testid="content-input"
              onImageUpload={handleImageUploadForSource}
            />
          ) : null}

          {currentMode === "preview" ? (
            <div className="admin-editor-surface admin-scrollbar h-full overflow-auto p-6">
              {content ? (
                <div className="admin-editor-preview markdown-body max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      img: ({ src, alt }) => {
                        if (typeof src !== "string") return null;
                        const markdownFilePath = articlePath
                          ? articlePath.replace(/^\/+/, "")
                          : undefined;
                        let imagePathForResolution = src;
                        let markdownFilePathForResolution = markdownFilePath;

                        if (src.startsWith("~/assets/")) {
                          imagePathForResolution = src.replace(/^~\//, "");
                          markdownFilePathForResolution = undefined;
                        }

                        const resolved = resolveImagePath(
                          imagePathForResolution,
                          contentSource,
                          markdownFilePathForResolution
                        );
                        const imageSrc = resolved ?? src;

                        return (
                          // biome-ignore lint/performance/noImgElement: Admin SPA preview is framework-neutral and does not use Next runtime.
                          <img
                            src={imageSrc}
                            alt={alt || ""}
                            className="max-w-full rounded-xl border border-border shadow-sm"
                            onError={(event) => {
                              console.warn("图片加载失败:", imageSrc);
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        );
                      },
                    }}
                  >
                    {extractBodyContent(content)}
                  </ReactMarkdown>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">预览内容...</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

UniversalEditor.displayName = "UniversalEditor";
