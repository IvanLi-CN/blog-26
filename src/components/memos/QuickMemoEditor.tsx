"use client";

/**
 * 快速 Memo 编辑器组件
 *
 * 轻量级版本，专注于快速记录想法
 */

import { Globe, Hash, Image, Lock, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export interface QuickMemoEditorProps {
  /** 占位符文本 */
  placeholder?: string;
  /** 最大高度 */
  maxHeight?: number;
  /** 是否自动聚焦 */
  autoFocus?: boolean;
  /** 保存回调 */
  onSave?: (data: QuickMemoData) => Promise<void>;
  /** 样式类名 */
  className?: string;
  /** 是否显示高级选项 */
  showAdvancedOptions?: boolean;
}

export interface QuickMemoData {
  content: string;
  isPublic: boolean;
  tags: string[];
}

export function QuickMemoEditor({
  placeholder = "记录你的想法...",
  maxHeight = 200,
  autoFocus = false,
  onSave,
  className,
  showAdvancedOptions = false,
}: QuickMemoEditorProps) {
  // 状态管理
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [_showOptions, _setShowOptions] = useState(false);

  // 引用
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [maxHeight]);

  // 处理内容变化
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      adjustHeight();

      // 自动提取标签
      const hashtagRegex = /#(\w+)/g;
      const extractedTags = Array.from(e.target.value.matchAll(hashtagRegex))
        .map((match) => match[1])
        .filter((tag, index, arr) => arr.indexOf(tag) === index); // 去重

      setTags(extractedTags);
    },
    [adjustHeight]
  );

  // 处理保存
  const handleSave = useCallback(async () => {
    if (!content.trim() || !onSave) return;

    setIsSaving(true);
    try {
      await onSave({
        content: content.trim(),
        isPublic,
        tags,
      });

      // 清空内容
      setContent("");
      setTags([]);
      adjustHeight();

      // 重新聚焦
      textareaRef.current?.focus();
    } catch (error) {
      console.error("保存快速 memo 失败:", error);
    } finally {
      setIsSaving(false);
    }
  }, [content, isPublic, tags, onSave, adjustHeight]);

  // 处理键盘快捷键
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter 快速发布
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }

      // Shift + Enter 换行
      if (e.shiftKey && e.key === "Enter") {
        // 默认行为，不需要特殊处理
      }
    },
    [handleSave]
  );

  // 处理图片上传
  const handleImageUpload = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;

    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        // 这里可以实现图片上传逻辑
        console.log("上传图片:", files);
        // 暂时添加占位符
        const imageMarkdown = Array.from(files)
          .map((file) => `![${file.name}](uploading...)`)
          .join("\n");

        setContent((prev) => prev + (prev ? "\n" : "") + imageMarkdown);
      }
    };

    input.click();
  }, []);

  // 初始化时调整高度
  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className={cn("quick-memo-editor border rounded-lg bg-background", className)}>
      {/* 主要输入区域 */}
      <div className="p-4">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[80px] resize-none border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          style={{ maxHeight: `${maxHeight}px` }}
        />

        {/* 标签预览 */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/50">
        <div className="flex items-center space-x-2">
          {/* 图片上传按钮 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleImageUpload}
            className="h-8 w-8 p-0"
            title="上传图片"
          >
            <Image className="w-4 h-4" />
          </Button>

          {/* 标签提示 */}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="使用 #标签 来分类">
            <Hash className="w-4 h-4" />
          </Button>

          {/* 公开/私有切换 */}
          {showAdvancedOptions && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPublic(!isPublic)}
              className="h-8 w-8 p-0"
              title={isPublic ? "公开" : "私有"}
            >
              {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </Button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* 字符计数 */}
          <span className="text-xs text-muted-foreground">{content.length}</span>

          {/* 发布按钮 */}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!content.trim() || isSaving}
            className="h-8"
          >
            <Send className="w-4 h-4 mr-1" />
            {isSaving ? "发布中..." : "发布"}
          </Button>
        </div>
      </div>

      {/* 快捷键提示 */}
      <div className="px-4 py-1 text-xs text-muted-foreground border-t">
        <span>Ctrl+Enter 快速发布 • Shift+Enter 换行 • #标签 自动识别</span>
      </div>
    </div>
  );
}
