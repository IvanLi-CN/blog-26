"use client";

import { nanoid } from "nanoid";
import Image from "next/image";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { resolveImagePath } from "@/lib/image-utils";
import { rewriteApiFilesUrlsToRelative } from "@/lib/persisted-paths";
import { MilkdownEditor } from "../memos/MilkdownEditor";
import { SourceEditor } from "./SourceEditor";
import "highlight.js/styles/github.css";

// 编辑器模式类型
type EditorMode = "wysiwyg" | "source" | "preview";

// 编辑器实例接口
export interface UniversalEditorRef {
  processInlineImages: (content: string) => Promise<string>;
}

export interface UniversalEditorProps {
  // 内容相关
  initialContent: string;
  onContentChange?: (content: string) => void;
  placeholder?: string;

  // 附件相关
  attachmentBasePath?: string; // 附件上传的基础路径，如 'assets' 或 'Memos/assets'
  articlePath?: string; // 文章路径，用于正确解析相对图片路径
  contentSource?: "webdav" | "local"; // 内容来源，用于确定图片 API 路径

  // UI 配置
  title?: string;
  className?: string;
  mode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;

  // 编辑器标识
  editorId?: string;

  // 测试相关
  "data-testid"?: string;
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
      onModeChange: _onModeChange,
      editorId = "default",
      "data-testid": dataTestId,
    },
    ref
  ) => {
    const [content, setContent] = useState(initialContent);
    const [currentMode, setCurrentMode] = useState<EditorMode>(mode);

    /**
     * 根据文章路径生成文章 slug
     */
    const getArticleSlug = (articlePath: string): string => {
      if (!articlePath) return "untitled";

      // 提取文件名（去掉路径和扩展名）
      const pathParts = articlePath.split("/");
      const fileName = pathParts.pop() || "untitled";
      const fileNameWithoutExt = fileName.replace(/\.(md|markdown)$/i, "");

      // 转换为 slug 格式
      return (
        fileNameWithoutExt
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .substring(0, 50) || // 限制长度，为 nanoid 留空间
        "untitled"
      );
    };

    // 处理内联图片上传 - 完全按照旧项目的方式
    const processInlineImages = async (content: string): Promise<string> => {
      const base64ImageRegex = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;
      let processedContent = content;
      const matches = Array.from(content.matchAll(base64ImageRegex));

      for (const match of matches) {
        const [fullMatch, altText, imageType, base64Data] = match;

        try {
          console.log("🖼️ [UniversalEditor] 处理内联图片:", {
            altText,
            imageType,
            base64Length: base64Data.length,
          });

          // 生成文件名：文章slug + nanoid + 扩展名
          const articleSlug = getArticleSlug(articlePath);
          const uniqueId = nanoid(8); // 8位 nanoid
          const filename = `${articleSlug}-${uniqueId}.${imageType}`;

          // 构建上传路径
          const uploadPath = `${attachmentBasePath}/${filename}`;

          // 将 base64 转换为 Blob
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: `image/${imageType}` });

          // Upload via Files API, but persist a normalized relative link (no /api/files/).
          const response = await fetch(`/api/files/${contentSource}/${uploadPath}`, {
            method: "POST",
            headers: {
              "Content-Type": `image/${imageType}`,
            },
            body: blob,
          });

          if (!response.ok) {
            throw new Error(`上传失败: ${response.status}`);
          }

          const result = await response.json();
          console.log("✅ [UniversalEditor] 内联图片上传成功:", {
            uploadPath,
            result,
          });

          // 替换内联图片为上传后的路径（持久化语义：相对路径）
          const imagePath = `./assets/${filename}`;
          const newImageMarkdown = `![${altText}](${imagePath})`;
          processedContent = processedContent.replace(fullMatch, newImageMarkdown);

          console.log("✅ [UniversalEditor] 内联图片处理成功:", {
            filename,
            imagePath,
            newMarkdown: newImageMarkdown,
          });
        } catch (error) {
          console.error("❌ [UniversalEditor] 内联图片处理失败:", error);
          // 如果上传失败，保留原始的 base64 图片
        }
      }

      return processedContent;
    };

    // 暴露给外部的方法
    useImperativeHandle(ref, () => ({
      processInlineImages,
    }));

    // 处理内容变化
    const handleContentChange = (newContent: string) => {
      setContent(newContent);
      onContentChange?.(newContent);
    };

    // 处理模式切换
    // const handleModeChange = (newMode: EditorMode) => {
    //   setCurrentMode(newMode);
    //   onModeChange?.(newMode);
    // };

    // 处理图片上传
    const uploadImage = async (
      file: File
    ): Promise<{ persistedPath: string; runtimeUrl: string }> => {
      try {
        // 生成唯一文件名：文章slug + nanoid + 原始扩展名
        const articleSlug = getArticleSlug(articlePath);
        const uniqueId = nanoid(8); // 8位 nanoid
        const fileExtension = file.name.split(".").pop() || "jpg";
        const uniqueFileName = `${articleSlug}-${uniqueId}.${fileExtension}`;

        // 构建上传路径
        const uploadPath = `${attachmentBasePath}/${uniqueFileName}`;

        console.log("📤 [UniversalEditor] 开始上传图片:", {
          fileName: file.name,
          size: file.size,
          type: file.type,
          uploadPath,
        });

        // Upload via Files API, but persist a normalized relative link (no /api/files/).
        const response = await fetch(`/api/files/${contentSource}/${uploadPath}`, {
          method: "POST",
          headers: {
            "Content-Type": file.type,
          },
          body: file,
        });

        if (!response.ok) {
          throw new Error(`上传失败: ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ [UniversalEditor] 图片上传成功:", {
          uploadPath,
          result,
        });

        const persistedPath = `./assets/${uniqueFileName}`;
        const runtimeUrl =
          typeof result?.url === "string" && result.url.length > 0
            ? result.url
            : `/api/files/${contentSource}/${uploadPath}`;

        return { persistedPath, runtimeUrl };
      } catch (error) {
        console.error("❌ [UniversalEditor] 图片上传失败:", error);
        throw error;
      }
    };

    // Source editor should insert persisted relative paths.
    const handleImageUploadForSource = async (file: File): Promise<string> => {
      const { persistedPath } = await uploadImage(file);
      return persistedPath;
    };

    // WYSIWYG editor should use runtime URLs so images render immediately,
    // while the persisted output is rewritten back to relative paths.
    const handleImageUploadForWysiwyg = async (file: File): Promise<string> => {
      const { runtimeUrl } = await uploadImage(file);
      return runtimeUrl;
    };

    // 将API URL转换回相对路径（用于源码模式显示）
    const convertApiUrlsToRelativePaths = (content: string): string => {
      // Best-effort conversion for source editing: show persisted relative semantics.
      const cleanedArticlePath =
        typeof articlePath === "string" ? articlePath.replace(/^\/+/, "") : "";
      const baseDir = cleanedArticlePath
        ? /\.[A-Za-z0-9]+$/.test(cleanedArticlePath)
          ? cleanedArticlePath
          : `${cleanedArticlePath.replace(/\/+$/, "")}/__unknown__.md`
        : (() => {
            const cleanBase = (attachmentBasePath || "").replace(/^\/+/, "").replace(/\/+$/, "");
            const parts = cleanBase.split("/").filter(Boolean);
            const parentDir =
              parts.length > 0 && parts[parts.length - 1] === "assets"
                ? parts.slice(0, -1).join("/")
                : cleanBase;
            return parentDir ? `${parentDir}/__unknown__.md` : "__unknown__.md";
          })();

      return rewriteApiFilesUrlsToRelative(content, baseDir).content;
    };

    // 提取正文内容，用于预览模式（移除 frontmatter）
    const extractBodyContent = (content: string): string => {
      // 如果内容以 frontmatter 开头，提取正文部分
      const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
      const frontmatterMatch = content.match(frontmatterRegex);

      if (frontmatterMatch) {
        console.log("👁️ [UniversalEditor] 预览模式移除 frontmatter:", {
          hasFrontmatter: true,
          frontmatterLength: frontmatterMatch[1].length,
          bodyLength: frontmatterMatch[2].length,
        });
        return frontmatterMatch[2]; // 返回正文部分
      }

      // 如果没有 frontmatter，返回原内容
      return content;
    };

    // 同步外部内容变化 - 使用 ref 来避免无限循环
    const lastInitialContentRef = useRef(initialContent);
    useEffect(() => {
      // 只有当外部内容真正不同且不是由内部变化引起时才更新
      if (initialContent !== lastInitialContentRef.current && initialContent !== content) {
        console.log("🔄 [UniversalEditor] 同步外部内容变化:", {
          oldLength: content.length,
          newLength: initialContent.length,
          lengthDiff: initialContent.length - content.length,
        });
        lastInitialContentRef.current = initialContent;
        setContent(initialContent);
      }
    }, [initialContent, content]);

    // 同步外部模式变化
    useEffect(() => {
      if (mode !== currentMode) {
        setCurrentMode(mode);
      }
    }, [mode, currentMode]);

    return (
      <div className={`universal-editor ${className}`} data-testid={dataTestId}>
        {/* 编辑器头部 */}
        {title && (
          <div className="editor-header mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
        )}

        <div className="editor-content h-full">
          {currentMode === "wysiwyg" && (
            <div className="w-full h-full overflow-auto">
              <MilkdownEditor
                key={`milkdown-editor-${editorId}`}
                content={content}
                onChange={handleContentChange}
                placeholder={placeholder}
                className="w-full h-full"
                data-testid="content-input"
                editorId={`wysiwyg-${editorId}`}
                articlePath={articlePath}
                contentSource={contentSource}
                onImageUpload={handleImageUploadForWysiwyg}
              />
            </div>
          )}

          {currentMode === "source" && (
            <div className="w-full h-full overflow-auto">
              <SourceEditor
                content={convertApiUrlsToRelativePaths(content)}
                onChange={handleContentChange}
                placeholder={placeholder}
                className="w-full h-full"
                data-testid="content-input"
                onImageUpload={handleImageUploadForSource}
              />
            </div>
          )}

          {currentMode === "preview" && (
            <div
              className="w-full h-full p-4 bg-base-100 overflow-auto prose prose-lg prose-slate max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:my-4 prose-li:my-2"
              data-testid="content-preview"
            >
              {content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    // 自定义图片组件，处理相对路径
                    img: ({ src, alt }) => {
                      // 确保 src 是字符串类型
                      if (typeof src !== "string") {
                        return null;
                      }

                      const rawSrc = src || "";

                      // 基于文章路径推导用于图片解析的 markdown 文件路径：
                      // - articlePath 形如 "/blog/06-svg-image-test.md"
                      // - markdownFilePath 形如 "blog/06-svg-image-test.md"
                      const markdownFilePath =
                        typeof articlePath === "string" && articlePath.length > 0
                          ? articlePath.replace(/^\/+/, "")
                          : undefined;

                      let imagePathForResolution = rawSrc;
                      let markdownFilePathForResolution = markdownFilePath;

                      // 特殊处理 WebDAV 全局资源前缀 ~/assets/：
                      // 在编辑器中，这些资源位于内容源根目录下的 assets/，
                      // 不应附加文章目录前缀，因此在解析时不传入 markdownFilePath。
                      if (rawSrc.startsWith("~/assets/")) {
                        imagePathForResolution = rawSrc.replace(/^~\//, "");
                        markdownFilePathForResolution = undefined;
                      }

                      // 统一使用 resolveImagePath 解析图片路径：
                      // - 外部 URL、data URL、/api/files/... 会原样返回
                      // - 相对路径会基于 markdownFilePath 与内容源解析为 /api/files/<source>/...
                      const resolved = resolveImagePath(
                        imagePathForResolution,
                        contentSource,
                        markdownFilePathForResolution
                      );

                      const imageSrc = resolved ?? rawSrc;

                      console.log("🖼️ [UniversalEditor] 预览模式解析图片路径:", {
                        original: rawSrc,
                        resolved: imageSrc,
                        articlePath,
                        markdownFilePath,
                        contentSource,
                      });

                      return (
                        <Image
                          src={imageSrc}
                          alt={alt || ""}
                          width={800}
                          height={600}
                          className="max-w-full h-auto rounded-lg shadow-sm"
                          onError={(e) => {
                            console.warn("图片加载失败:", imageSrc);
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      );
                    },
                    // 自定义代码块组件
                    code: ({ className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || "");
                      return match ? (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {extractBodyContent(content)}
                </ReactMarkdown>
              ) : (
                <span className="text-gray-500">预览内容...</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

UniversalEditor.displayName = "UniversalEditor";
