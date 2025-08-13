"use client";

/**
 * Milkdown 编辑器组件
 *
 * 完全按照旧项目的方式实现，使用 @milkdown/crepe
 */

import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/utils";
import { useEffect, useRef } from "react";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

interface MilkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  // 图片上传处理函数
  onImageUpload?: (file: File) => Promise<string>;
}

// 转换图片路径用于编辑器显示
function convertImagePathForEditor(imagePath: string): string {
  // 如果已经是完整的 URL、base64图片或已经是文件代理路径，直接返回
  if (
    imagePath &&
    (imagePath.startsWith("http") ||
      imagePath.startsWith("data:") ||
      imagePath.startsWith("/uploads/"))
  ) {
    return imagePath;
  }

  // 如果是相对路径，转换为上传路径
  if (imagePath) {
    return `/uploads/${imagePath}`;
  }

  return imagePath;
}

// 预处理内容，转换图片路径
function preprocessContentForEditor(content: string): string {
  // 处理图片路径
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  return content.replace(imageRegex, (_match, alt, src) => {
    const convertedSrc = convertImagePathForEditor(src);
    console.log("🖼️ [MilkdownEditor] 转换图片路径:", {
      original: src,
      converted: convertedSrc,
    });
    return `![${alt}](${convertedSrc})`;
  });
}

export function MilkdownEditor({
  content,
  onChange,
  _placeholder = "开始写作...",
  className = "",
  "data-testid": dataTestId,
  onImageUpload,
}: MilkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const lastContentRef = useRef<string>(content);
  const onImageUploadRef = useRef(onImageUpload);

  // 更新 onImageUpload 引用
  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
  }, [onImageUpload]);

  // 初始化编辑器
  useEffect(() => {
    if (!editorRef.current) return;

    const initEditor = async () => {
      try {
        console.log("🔨 [MilkdownEditor] 初始化编辑器...");

        // 预处理内容，转换图片路径
        const processedContent = preprocessContentForEditor(content);

        // 创建 Crepe 编辑器实例
        const crepe = new Crepe({
          root: editorRef.current!,
          defaultValue: processedContent,
          features: {
            [CrepeFeature.ImageBlock]: true,
          },
          featureConfigs: {
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
            if (lastContentRef.current !== markdown) {
              lastContentRef.current = markdown;
              onChange(markdown);
            }
          });
        });

        // 创建编辑器
        console.log("🔨 [MilkdownEditor] 创建编辑器实例...");
        await crepe.create();
        crepeRef.current = crepe;
        lastContentRef.current = content;

        console.log("✅ [MilkdownEditor] 编辑器初始化完成");
      } catch (error) {
        console.error("❌ [MilkdownEditor] 编辑器初始化失败:", error);
      }
    };

    initEditor();

    return () => {
      console.log("🧹 [MilkdownEditor] 清理编辑器...");
      if (crepeRef.current) {
        crepeRef.current.destroy();
        crepeRef.current = null;
      }
    };
  }, [content, onChange]); // 只在组件挂载时初始化一次

  // 处理外部内容变化
  useEffect(() => {
    if (crepeRef.current && lastContentRef.current !== content) {
      try {
        console.log("🔄 [MilkdownEditor] 更新编辑器内容:", {
          oldLength: lastContentRef.current.length,
          newLength: content.length,
        });

        // 预处理内容，转换图片路径
        const processedContent = preprocessContentForEditor(content);

        // 使用 Milkdown 的 action API 来设置内容
        crepeRef.current.editor.action(replaceAll(processedContent));
        lastContentRef.current = content;

        console.log("✅ [MilkdownEditor] 内容更新成功");
      } catch (error) {
        console.error("❌ [MilkdownEditor] 内容更新失败:", error);
      }
    }
  }, [content]);

  return (
    <div ref={editorRef} className={`milkdown-editor ${className}`} data-testid={dataTestId} />
  );
}
