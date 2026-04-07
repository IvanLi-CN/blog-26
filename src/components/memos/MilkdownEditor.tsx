"use client";

/**
 * Milkdown 编辑器组件
 *
 * 完全按照旧项目的方式实现，使用 @milkdown/crepe
 */

import { editorViewCtx, parserCtx } from "@milkdown/core";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { Slice } from "@milkdown/prose/model";
import { TextSelection } from "@milkdown/prose/state";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { processInlineImagesCompat } from "@/lib/image-processing";
import { rewriteApiFilesUrlsToRelative } from "@/lib/persisted-paths";
import { isExternalUrl, resolveRelativePath } from "../../utils/path-resolver";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

// 基于标签页的编辑器实例管理
const editorInstances = new Map<string, Crepe>();
const initializingEditors = new Set<string>();

// 调试开关与轻量日志函数
// removed development-only logging helpers

// 预处理内容，将 frontmatter 转换为 YAML 代码块
function preprocessFrontmatterForEditor(content: string): string {
  // 处理 frontmatter
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const frontmatterMatch = content.match(frontmatterRegex);

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const bodyContent = frontmatterMatch[2];

    // 将 frontmatter 转换为 YAML 代码块
    const processedContent = `\`\`\`yaml\n${frontmatter}\n\`\`\`\n\n${bodyContent}`;

    // removed verbose log

    return processedContent;
  }

  return content;
}

// 后处理内容，将 YAML 代码块转换回 frontmatter
function postprocessContentFromEditor(content: string): string {
  // 匹配开头的 YAML 代码块
  const yamlCodeBlockRegex = /^```yaml\n([\s\S]*?)\n```\n\n([\s\S]*)$/;
  const yamlMatch = content.match(yamlCodeBlockRegex);

  if (yamlMatch) {
    const yamlContent = yamlMatch[1];
    const bodyContent = yamlMatch[2];

    // 转换回 frontmatter 格式
    const processedContent = `---\n${yamlContent}\n---\n${bodyContent}`;

    // removed verbose log

    return processedContent;
  }

  return content;
}

// 编辑器实例接口
export interface MilkdownEditorRef {
  processInlineImages: (content: string) => Promise<string>;
  getMarkdown: () => string;
}

interface MilkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  // 图片上传处理函数
  onImageUpload?: (file: File) => Promise<string>;
  // 编辑器唯一标识符
  editorId?: string;
  // 文章路径，用于正确解析相对图片路径
  articlePath?: string;
  // 内容源类型，用于正确的图片路径转换
  contentSource?: "webdav" | "local";
}

// 转换图片路径用于编辑器显示
function convertImagePathForEditor(
  imagePath: string,
  articlePath: string = "",
  contentSource: "webdav" | "local" = "local"
): string {
  // 从文章路径推断文章目录
  const articleDir = articlePath.startsWith("/")
    ? articlePath.substring(1).split("/").slice(0, -1).join("/") +
      (articlePath.includes("/") ? "/" : "")
    : "";
  // 如果已经是完整的 URL、base64图片或已经是文件代理路径，直接返回
  if (
    imagePath &&
    (isExternalUrl(imagePath) ||
      imagePath.startsWith("data:") ||
      imagePath.startsWith("/api/files/"))
  ) {
    return imagePath;
  }

  // 如果是相对路径，转换为对应内容源的文件代理路径
  if (imagePath) {
    // 使用路径解析逻辑
    const resolvedPath = resolveRelativePath(imagePath, articleDir);

    // 根据内容源使用对应的文件代理路径
    return `/api/files/${contentSource}/${resolvedPath}`;
  }

  return imagePath;
}

// 预处理内容，转换图片路径
function preprocessContentForEditor(
  content: string,
  articlePath: string = "",
  contentSource: "webdav" | "local" = "local"
): string {
  // 处理图片路径
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  return content.replace(imageRegex, (_match, alt, src) => {
    // 使用实际的文章路径来确定目录
    const convertedSrc = convertImagePathForEditor(src, articlePath, contentSource);
    // removed verbose log
    return `![${alt}](${convertedSrc})`;
  });
}

export const MilkdownEditor = forwardRef<MilkdownEditorRef, MilkdownEditorProps>(
  (
    {
      content,
      onChange,
      placeholder = "开始写作...",
      className = "",
      "data-testid": dataTestId,
      onImageUpload,
      editorId = "default",
      articlePath = "",
      contentSource = "local",
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const lastContentRef = useRef<string>(content);
    const initialContentRef = useRef<string>(content);
    const onImageUploadRef = useRef(onImageUpload);
    const onChangeRef = useRef(onChange);
    const isUpdatingRef = useRef<boolean>(false); // 防止循环更新的标志

    // 处理内联图片上传 - 与 UniversalEditor 相同的逻辑
    const processInlineImages = async (content: string): Promise<string> => {
      return processInlineImagesCompat(
        content,
        contentSource,
        articlePath || "__unknown__.md",
        "relative"
      );
    };

    // 暴露给外部的方法
    useImperativeHandle(ref, () => ({
      processInlineImages,
      getMarkdown: () => lastContentRef.current,
    }));

    // 更新 onImageUpload 引用
    useEffect(() => {
      onImageUploadRef.current = onImageUpload;
    }, [onImageUpload]);

    // 同步最新的 onChange 到 ref（避免把 onChange 放入初始化副作用依赖）
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    // 初始化编辑器
    useEffect(() => {
      if (!editorRef.current) return;
      if (crepeRef.current) return; // 如果已经有编辑器实例，直接返回

      let cancelled = false;

      // 检查是否已经有这个 editorId 的实例
      if (editorInstances.has(editorId)) {
        // removed warn
        // 移除旧实例，重新创建以确保正确挂载
        const oldInstance = editorInstances.get(editorId);
        if (oldInstance) {
          try {
            oldInstance.destroy();
          } catch (_error) {
            // removed warn
          }
        }
        editorInstances.delete(editorId);
      }

      const initEditor = async () => {
        try {
          initializingEditors.add(editorId);
          // removed log

          // 预处理内容，转换 frontmatter 和图片路径
          const frontmatterProcessed = preprocessFrontmatterForEditor(initialContentRef.current);
          const processedContent = preprocessContentForEditor(
            frontmatterProcessed,
            articlePath,
            contentSource
          );

          // 创建 Crepe 编辑器实例
          if (!editorRef.current) return;
          const crepe = new Crepe({
            root: editorRef.current,
            defaultValue: processedContent,
            features: {
              // 启用所有主要功能以获得完整的 WYSIWYG 体验
              [CrepeFeature.Cursor]: true,
              [CrepeFeature.ListItem]: true,
              [CrepeFeature.LinkTooltip]: true,
              [CrepeFeature.ImageBlock]: true,
              [CrepeFeature.BlockEdit]: true,
              [CrepeFeature.Placeholder]: true,
              [CrepeFeature.Toolbar]: true,
              [CrepeFeature.CodeMirror]: true,
              [CrepeFeature.Table]: true,
              [CrepeFeature.Latex]: false, // 暂时禁用 LaTeX 以简化
            },
            featureConfigs: {
              [CrepeFeature.Placeholder]: {
                text: placeholder,
              },
              [CrepeFeature.ImageBlock]: {
                onUpload: async (file: File) => {
                  // removed log

                  if (onImageUploadRef.current) {
                    try {
                      const result = await onImageUploadRef.current(file);
                      // removed log
                      return result;
                    } catch (error) {
                      console.error("❌ [MilkdownEditor] 图片上传失败:", error);
                      // 返回 data URL 作为备选
                      return URL.createObjectURL(file);
                    }
                  } else {
                    // 如果没有上传函数，返回 data URL
                    return URL.createObjectURL(file);
                  }
                },
              },
            },
          });

          if (cancelled) {
            try {
              crepe.destroy();
            } catch {
              // ignore
            }
            return;
          }

          // 监听内容变化
          crepe.on((listener) => {
            listener.markdownUpdated((_, markdown) => {
              // 防止循环更新：如果正在更新中，跳过
              if (isUpdatingRef.current) {
                // removed log
                return;
              }

              // 后处理内容，将 YAML 代码块转换回 frontmatter
              const processedMarkdown = postprocessContentFromEditor(markdown);
              const persistedMarkdownFilePath =
                typeof articlePath === "string" && articlePath.length > 0
                  ? articlePath.replace(/^\/+/, "")
                  : "__unknown__.md";
              const persistedMarkdown = rewriteApiFilesUrlsToRelative(
                processedMarkdown,
                persistedMarkdownFilePath
              ).content;

              // 超强防护机制：多重检查避免无限循环
              const currentContent = lastContentRef.current;
              const isSameContent = currentContent === persistedMarkdown;

              // 检查内容是否完全相同
              if (isSameContent) {
                // removed log
                return;
              }

              // 检查去除空白字符后是否相同
              const currentTrimmed = currentContent.trim();
              const processedTrimmed = processedMarkdown.trim();
              if (currentTrimmed === processedTrimmed) {
                // removed log
                return;
              }

              // 检查长度差异是否过小（可能是格式化差异）
              const lengthDiff = Math.abs(currentContent.length - processedMarkdown.length);
              if (lengthDiff <= 3 && currentTrimmed === processedTrimmed) {
                // removed log
                return;
              }

              // 设置更新标志，防止循环
              isUpdatingRef.current = true;

              // 更新最后内容引用，防止后续循环
              lastContentRef.current = persistedMarkdown;

              // removed log

              // 异步调用 onChange，然后重置标志
              setTimeout(() => {
                onChangeRef.current(persistedMarkdown);
                isUpdatingRef.current = false;
              }, 0);
            });
          });

          // 创建编辑器
          await crepe.create();

          if (cancelled) {
            try {
              crepe.destroy();
            } catch {
              // ignore
            }
            return;
          }

          crepeRef.current = crepe;
          lastContentRef.current = initialContentRef.current;

          // 保存到实例管理器
          editorInstances.set(editorId, crepe);
          // removed log
        } catch (error) {
          console.error(`❌ [MilkdownEditor] 编辑器 ${editorId} 初始化失败:`, error);
        } finally {
          initializingEditors.delete(editorId);
        }
      };

      initEditor();

      return () => {
        cancelled = true;
        initializingEditors.delete(editorId);

        const instance = crepeRef.current ?? editorInstances.get(editorId) ?? null;
        if (instance) {
          // removed log
          try {
            instance.destroy();
          } catch {
            // ignore
          }
        }

        crepeRef.current = null;
        // 从实例管理器中移除
        editorInstances.delete(editorId);
      };
    }, [articlePath, editorId, contentSource, placeholder]); // 只在组件挂载时初始化一次，避免内容变化触发重建

    // 处理外部内容变化 - 修复无限循环
    useEffect(() => {
      if (crepeRef.current && lastContentRef.current !== content && !isUpdatingRef.current) {
        try {
          // removed log

          // 超强防护：检查内容是否真的不同
          const currentContent = lastContentRef.current;
          const isSameContent = currentContent === content;
          const isSameTrimmed = currentContent.trim() === content.trim();

          if (isSameContent || isSameTrimmed) {
            // removed log
            return;
          }

          // 设置更新标志
          isUpdatingRef.current = true;

          // 预处理内容，转换 frontmatter 和图片路径
          const frontmatterProcessed = preprocessFrontmatterForEditor(content);
          const processedContent = preprocessContentForEditor(
            frontmatterProcessed,
            articlePath,
            contentSource
          );

          // 使用 Milkdown 的 action API 来设置内容，并保持光标位置
          let didUpdateContent = false;
          crepeRef.current.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const doc = parser(processedContent);

            if (!doc) {
              return;
            }

            const { state } = view;
            const { from, to } = state.selection;
            const slice = new Slice(doc.content, 0, 0);
            const tr = state.tr.replace(0, state.doc.content.size, slice);
            const docSize = tr.doc.content.size;
            const clampPosition = (position: number) => Math.max(0, Math.min(position, docSize));

            const nextSelection = TextSelection.create(
              tr.doc,
              clampPosition(from),
              clampPosition(to)
            );

            view.dispatch(tr.setSelection(nextSelection));
            didUpdateContent = true;
          });

          if (didUpdateContent) {
            lastContentRef.current = content;
          }

          // removed log

          // 延迟重置标志
          setTimeout(() => {
            isUpdatingRef.current = false;
          }, 100);
        } catch (error) {
          console.error("❌ [MilkdownEditor] 内容更新失败:", error);
          isUpdatingRef.current = false;
        }
      }
    }, [content, articlePath, contentSource]);

    return (
      <div
        ref={editorRef}
        className={`milkdown-editor ${className}`}
        data-testid={dataTestId}
        style={{
          minHeight: "inherit",
          height: "auto",
        }}
      />
    );
  }
);

MilkdownEditor.displayName = "MilkdownEditor";
