"use client";

/**
 * 通用编辑器组件
 *
 * 完全按照旧项目的方式实现，包含 processInlineImages 函数
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { MilkdownEditor } from "../memos/MilkdownEditor";
import "highlight.js/styles/github.css";

// 编辑器模式类型
type EditorMode = "wysiwyg" | "source" | "preview";

export interface UniversalEditorProps {
  // 内容相关
  initialContent: string;
  onContentChange?: (content: string) => void;
  placeholder?: string;

  // 附件相关
  attachmentBasePath?: string; // 附件上传的基础路径，如 'assets' 或 'Memos/assets'

  // UI 配置
  title?: string;
  className?: string;
  mode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;

  // 测试相关
  "data-testid"?: string;
}

export function UniversalEditor({
  initialContent,
  onContentChange,
  placeholder = "开始编写...",
  attachmentBasePath = "assets",
  title,
  className = "",
  mode = "wysiwyg",
  onModeChange,
  "data-testid": dataTestId,
}: UniversalEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [currentMode, setCurrentMode] = useState<EditorMode>(mode);

  // 处理内容变化
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    onContentChange?.(newContent);
  };

  // 处理模式切换
  const _handleModeChange = (newMode: EditorMode) => {
    setCurrentMode(newMode);
    onModeChange?.(newMode);
  };

  // 处理内联图片上传 - 完全按照旧项目的方式
  const _processInlineImages = async (content: string): Promise<string> => {
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

        // 生成文件名
        const timestamp = Date.now();
        const filename = `inline-${timestamp}.${imageType}`;

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

        // 使用 /api/files/webdav/<path> API 上传
        const response = await fetch(`/api/files/webdav/${uploadPath}`, {
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

        // 替换内联图片为上传后的路径（使用相对路径）
        const imagePath = `${attachmentBasePath.split("/").pop()}/${filename}`;
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

  // 处理图片上传
  const handleImageUpload = async (file: File): Promise<string> => {
    try {
      // 生成唯一文件名，避免冲突
      const timestamp = Date.now();
      const uniqueFileName = `${timestamp}_${file.name}`;

      // 构建上传路径
      const uploadPath = `${attachmentBasePath}/${uniqueFileName}`;

      console.log("📤 [UniversalEditor] 开始上传图片:", {
        fileName: file.name,
        size: file.size,
        type: file.type,
        uploadPath,
      });

      // 使用 /api/files/webdav/<path> API 上传
      const response = await fetch(`/api/files/webdav/${uploadPath}`, {
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

      // 返回相对路径
      const imagePath = `${attachmentBasePath.split("/").pop()}/${uniqueFileName}`;
      return imagePath;
    } catch (error) {
      console.error("❌ [UniversalEditor] 图片上传失败:", error);
      throw error;
    }
  };

  // 同步外部内容变化
  useEffect(() => {
    if (initialContent !== content) {
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
      {title && (
        <div className="editor-header mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
      )}

      <div className="editor-content h-full">
        {currentMode === "wysiwyg" && (
          <MilkdownEditor
            content={content}
            onChange={handleContentChange}
            placeholder={placeholder}
            className="w-full h-full"
            data-testid="content-input"
            onImageUpload={handleImageUpload}
          />
        )}

        {currentMode === "source" && (
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder={placeholder}
            className="w-full h-full p-4 bg-base-100 border-none outline-none resize-none font-mono text-sm"
            data-testid="content-input"
          />
        )}

        {currentMode === "preview" && (
          <div
            className="w-full h-full p-4 bg-base-100 overflow-auto prose prose-sm max-w-none"
            data-testid="content-preview"
          >
            {content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // 自定义图片组件，处理相对路径
                  img: ({ src, alt, ..._props }) => {
                    const imageSrc = src?.startsWith("/") ? src : `/uploads/${src}`;
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
                {content}
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
