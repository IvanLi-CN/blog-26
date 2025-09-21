"use client";

/**
 * Milkdown 编辑器组件
 *
 * 完全按照旧项目的方式实现，使用 @milkdown/crepe
 */

import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/utils";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { isExternalUrl, resolveRelativePath } from "../../utils/path-resolver";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

// 基于标签页的编辑器实例管理
const editorInstances = new Map<string, Crepe>();
const initializingEditors = new Set<string>();

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

    console.log("📝 [MilkdownEditor] 处理 frontmatter:", {
      hasFrontmatter: true,
      frontmatterLength: frontmatter.length,
      bodyLength: bodyContent.length,
    });

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

    console.log("📝 [MilkdownEditor] 转换回 frontmatter:", {
      hasYamlBlock: true,
      yamlLength: yamlContent.length,
      bodyLength: bodyContent.length,
    });

    return processedContent;
  }

  return content;
}

// 编辑器实例接口
export interface MilkdownEditorRef {
  processInlineImages: (content: string) => Promise<string>;
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
  contentSource: "webdav" | "local" = "webdav"
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
  contentSource: "webdav" | "local" = "webdav"
): string {
  // 处理图片路径
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  return content.replace(imageRegex, (_match, alt, src) => {
    // 使用实际的文章路径来确定目录
    const convertedSrc = convertImagePathForEditor(src, articlePath, contentSource);
    console.log("🖼️ [MilkdownEditor] 转换图片路径:", {
      original: src,
      converted: convertedSrc,
      articlePath: articlePath,
      contentSource: contentSource,
    });
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
      contentSource = "webdav",
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
      // 首先反转义 Markdown 语法，因为 Milkdown 可能会转义输出
      const unescapedContent = content
        .replace(/\\!/g, "!")
        .replace(/\\\[/g, "[")
        .replace(/\\\]/g, "]")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")");

      console.log("🔧 [MilkdownEditor] 反转义处理:", {
        original: `${content.substring(0, 100)}...`,
        unescaped: `${unescapedContent.substring(0, 100)}...`,
        hasEscapedChars: content.includes("\\[") || content.includes("\\]"),
      });

      const base64ImageRegex = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;
      let processedContent = unescapedContent;
      const matches = Array.from(unescapedContent.matchAll(base64ImageRegex));

      for (const match of matches) {
        const [fullMatch, altText, imageType, base64Data] = match;

        console.log("🖼️ [MilkdownEditor] 处理内联图片:", {
          altText,
          imageType,
          base64Length: base64Data.length,
        });

        try {
          // 将 base64 转换为 Blob
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: `image/${imageType}` });

          // 创建 File 对象
          const timestamp = Date.now();
          const filename = `inline-${timestamp}.${imageType}`;
          const file = new File([blob], filename, { type: `image/${imageType}` });

          // 上传文件
          const uploadPath = `${articlePath}/${filename}`;
          const formData = new FormData();
          formData.append("file", file);

          const response = await fetch(`/api/files/${contentSource}/${uploadPath}`, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`上传失败: ${response.statusText}`);
          }

          const result = await response.json();
          console.log("✅ [MilkdownEditor] 内联图片上传成功:", {
            uploadPath,
            result,
          });

          // 构建新的图片路径 - 始终使用绝对路径，避免相对路径解析问题
          const imagePath = `/api/files/${contentSource}/${uploadPath}`;
          console.log("✅ [MilkdownEditor] 内联图片处理成功:", {
            filename,
            imagePath,
            uploadPath,
            contentSource,
          });

          // 替换原始的 base64 图片 - 使用绝对路径确保正确显示
          processedContent = processedContent.replace(fullMatch, `![${altText}](${imagePath})`);
        } catch (error) {
          console.error("❌ [MilkdownEditor] 内联图片处理失败:", error);
          // 保持原始内容不变
        }
      }

      return processedContent;
    };

    // 暴露给外部的方法
    useImperativeHandle(ref, () => ({
      processInlineImages,
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

      // 检查是否已经有这个 editorId 的实例
      if (editorInstances.has(editorId)) {
        console.warn(
          `⚠️ [MilkdownEditor] 编辑器实例 ${editorId} 已存在，但需要重新创建以确保正确挂载`
        );
        // 移除旧实例，重新创建以确保正确挂载
        const oldInstance = editorInstances.get(editorId);
        if (oldInstance) {
          try {
            oldInstance.destroy();
          } catch (error) {
            console.warn("销毁旧编辑器实例时出错:", error);
          }
        }
        editorInstances.delete(editorId);
      }

      // 检查是否正在初始化
      if (initializingEditors.has(editorId)) {
        console.warn(`⚠️ [MilkdownEditor] 编辑器 ${editorId} 正在初始化中，跳过重复初始化`);
        return;
      }

      const initEditor = async () => {
        try {
          initializingEditors.add(editorId);
          console.log(`🔨 [MilkdownEditor] 初始化编辑器 ${editorId}...`);

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
                  console.log("📤 [MilkdownEditor] 图片上传:", {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                  });

                  if (onImageUploadRef.current) {
                    try {
                      const result = await onImageUploadRef.current(file);
                      console.log("✅ [MilkdownEditor] 图片上传成功:", result);
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

          // 监听内容变化
          crepe.on((listener) => {
            listener.markdownUpdated((_, markdown) => {
              // 防止循环更新：如果正在更新中，跳过
              if (isUpdatingRef.current) {
                console.log("🔄 [MilkdownEditor] 正在更新中，跳过 onChange 避免无限循环");
                return;
              }

              // 后处理内容，将 YAML 代码块转换回 frontmatter
              const processedMarkdown = postprocessContentFromEditor(markdown);

              // 超强防护机制：多重检查避免无限循环
              const currentContent = lastContentRef.current;
              const isSameContent = currentContent === processedMarkdown;

              // 检查内容是否完全相同
              if (isSameContent) {
                console.log("🔄 [MilkdownEditor] 编辑器内容完全相同，跳过 onChange 避免无限循环");
                return;
              }

              // 检查去除空白字符后是否相同
              const currentTrimmed = currentContent.trim();
              const processedTrimmed = processedMarkdown.trim();
              if (currentTrimmed === processedTrimmed) {
                console.log(
                  "🔄 [MilkdownEditor] 编辑器内容仅空白字符差异，跳过 onChange 避免无限循环"
                );
                return;
              }

              // 检查长度差异是否过小（可能是格式化差异）
              const lengthDiff = Math.abs(currentContent.length - processedMarkdown.length);
              if (lengthDiff <= 3 && currentTrimmed === processedTrimmed) {
                console.log(
                  "🔄 [MilkdownEditor] 编辑器内容仅格式化差异，跳过 onChange 避免无限循环"
                );
                return;
              }

              // 设置更新标志，防止循环
              isUpdatingRef.current = true;

              // 更新最后内容引用，防止后续循环
              lastContentRef.current = processedMarkdown;

              console.log("📝 [MilkdownEditor] 编辑器内容变化，触发 onChange:", {
                oldLength: currentContent.length,
                newLength: processedMarkdown.length,
                lengthDiff: processedMarkdown.length - currentContent.length,
              });

              // 异步调用 onChange，然后重置标志
              setTimeout(() => {
                onChangeRef.current(processedMarkdown);
                isUpdatingRef.current = false;
              }, 0);
            });
          });

          // 创建编辑器
          await crepe.create();
          crepeRef.current = crepe;
          lastContentRef.current = initialContentRef.current;

          // 保存到实例管理器
          editorInstances.set(editorId, crepe);
          console.log(`✅ [MilkdownEditor] 编辑器 ${editorId} 初始化完成`);
        } catch (error) {
          console.error(`❌ [MilkdownEditor] 编辑器 ${editorId} 初始化失败:`, error);
        } finally {
          initializingEditors.delete(editorId);
        }
      };

      initEditor();

      return () => {
        if (crepeRef.current) {
          console.log(`🧹 [MilkdownEditor] 清理编辑器 ${editorId}...`);
          crepeRef.current.destroy();
          crepeRef.current = null;
          // 从实例管理器中移除
          editorInstances.delete(editorId);
          initializingEditors.delete(editorId);
        }
      };
    }, [articlePath, editorId, contentSource, placeholder]); // 只在组件挂载时初始化一次，避免内容变化触发重建

    // 处理外部内容变化 - 修复无限循环
    useEffect(() => {
      if (crepeRef.current && lastContentRef.current !== content && !isUpdatingRef.current) {
        try {
          console.log("🔄 [MilkdownEditor] 更新编辑器内容:", {
            oldLength: lastContentRef.current.length,
            newLength: content.length,
          });

          // 超强防护：检查内容是否真的不同
          const currentContent = lastContentRef.current;
          const isSameContent = currentContent === content;
          const isSameTrimmed = currentContent.trim() === content.trim();

          if (isSameContent || isSameTrimmed) {
            console.log("🔄 [MilkdownEditor] 内容相同或仅空白差异，跳过更新避免无限循环");
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

          // 使用 Milkdown 的 action API 来设置内容
          crepeRef.current.editor.action(replaceAll(processedContent));
          lastContentRef.current = content;

          console.log("✅ [MilkdownEditor] 内容更新成功");

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
