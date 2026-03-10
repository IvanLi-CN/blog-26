"use client";

/**
 * Memo 编辑器组件
 *
 * 基于 UniversalEditor，专门为 memo 功能定制
 */

import { Edit3, Eye, Plus, Save, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { getMemoAssetsDir, getMemoDraftPath, resolveClientMemoRootPath } from "@/lib/memo-paths";
import { cn } from "../../lib/utils";
import { UniversalEditor } from "../editor/UniversalEditor";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

export interface MemoEditorProps {
  /** 初始内容 */
  initialContent?: string;
  /** 初始标题 */
  initialTitle?: string;
  /** 初始公开状态 */
  initialIsPublic?: boolean;
  /** 初始标签 */
  initialTags?: string[];
  /** 是否为编辑模式 */
  isEditing?: boolean;
  /** 保存回调 */
  onSave?: (data: MemoData) => Promise<void>;
  /** 取消回调 */
  onCancel?: () => void;
  /** 预览模式切换回调 */
  onPreviewToggle?: (isPreview: boolean) => void;
  /** 样式类名 */
  className?: string;
  /** 是否显示高级选项 */
  showAdvancedOptions?: boolean;
  /** local source 是否启用 */
  localSourceEnabled?: boolean;
  /** 服务端校验后的 memo 根目录 */
  localMemoRootPath?: string;
}

export interface MemoData {
  content: string;
  title?: string;
  isPublic: boolean;
  tags: string[];
}

export function MemoEditor({
  initialContent = "",
  initialTitle = "",
  initialIsPublic = true,
  initialTags = [],
  isEditing = false,
  onSave,
  onCancel,
  onPreviewToggle,
  className,
  showAdvancedOptions = true,
  localSourceEnabled = true,
  localMemoRootPath,
}: MemoEditorProps) {
  const publicSwitchId = useId();
  const titleInputId = useId();
  // 使用稳定的 editorId，避免在每次渲染时重建编辑器导致失焦
  const stableEditorId = useId();

  // 状态管理
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(initialTitle);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [newTag, setNewTag] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const clientMemoRoot = resolveClientMemoRootPath({
    localSourceEnabled,
    memoRoot: localMemoRootPath,
  });

  // 编辑器模式
  const [editorMode, setEditorMode] = useState<"wysiwyg" | "source" | "preview">("wysiwyg");

  // 自动保存草稿（可选功能）
  useEffect(() => {
    const draftKey = `memo-draft-${Date.now()}`;
    const saveDraft = () => {
      if (content.trim() || title.trim()) {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            content,
            title,
            isPublic,
            tags,
            timestamp: Date.now(),
          })
        );
      }
    };

    const timer = setTimeout(saveDraft, 2000); // 2秒后保存草稿
    return () => clearTimeout(timer);
  }, [content, title, isPublic, tags]);

  // 处理内容变化
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  // 处理标签添加
  const handleAddTag = useCallback(() => {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags((prev) => [...prev, trimmedTag]);
      setNewTag("");
    }
  }, [newTag, tags]);

  // 处理标签删除
  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove));
  }, []);

  // 处理键盘事件（标签输入）
  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag]
  );

  // 处理保存
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      await onSave({
        content,
        title: title.trim() || undefined,
        isPublic,
        tags,
      });
    } catch (error) {
      console.error("保存 memo 失败:", error);
      // 这里可以添加错误提示
    } finally {
      setIsSaving(false);
    }
  }, [content, title, isPublic, tags, onSave]);

  // 处理预览切换
  const handlePreviewToggle = useCallback(() => {
    const newPreviewState = !isPreview;
    setIsPreview(newPreviewState);
    setEditorMode(newPreviewState ? "preview" : "wysiwyg");
    onPreviewToggle?.(newPreviewState);
  }, [isPreview, onPreviewToggle]);

  return (
    <div className={cn("memo-editor space-y-4", className)}>
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-semibold">{isEditing ? "编辑 Memo" : "新建 Memo"}</h2>
          {showAdvancedOptions && (
            <div className="flex items-center space-x-2">
              <Label htmlFor={publicSwitchId} className="text-sm">
                {isPublic ? "公开" : "私有"}
              </Label>
              <Switch
                id={publicSwitchId}
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviewToggle}
            className="flex items-center space-x-1"
          >
            {isPreview ? <Edit3 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{isPreview ? "编辑" : "预览"}</span>
          </Button>

          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              取消
            </Button>
          )}

          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !content.trim()}
            className="flex items-center space-x-1"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? "保存中..." : "保存"}</span>
          </Button>
        </div>
      </div>

      {/* 标题输入（可选） */}
      {showAdvancedOptions && (
        <div className="space-y-2">
          <Label htmlFor={titleInputId}>标题（可选）</Label>
          <Input
            id={titleInputId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="为你的 memo 添加一个标题..."
            className="w-full"
          />
        </div>
      )}

      {/* 标签管理 */}
      {showAdvancedOptions && (
        <div className="space-y-2">
          <Label>标签</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="flex items-center space-x-1">
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="添加标签..."
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddTag}
              disabled={!newTag.trim() || tags.includes(newTag.trim())}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 编辑器 */}
      <div className="border rounded-lg">
        <UniversalEditor
          initialContent={content}
          onContentChange={handleContentChange}
          placeholder="记录你的想法..."
          attachmentBasePath={getMemoAssetsDir(clientMemoRoot)}
          articlePath={getMemoDraftPath(clientMemoRoot)}
          contentSource="local"
          mode={editorMode}
          onModeChange={setEditorMode}
          editorId={`memo-editor-${stableEditorId}`}
          className="min-h-[300px]"
        />
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center space-x-4">
          <span>字符数: {content.length}</span>
          <span>标签: {tags.length}</span>
          {!isPublic && <Badge variant="outline">私有</Badge>}
        </div>
        <div className="text-xs">Ctrl+S 快速保存 • 支持拖拽上传图片</div>
      </div>
    </div>
  );
}
