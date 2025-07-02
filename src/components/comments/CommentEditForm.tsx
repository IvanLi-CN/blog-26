import React, { useState } from 'react';

interface CommentEditFormProps {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
  isEditing: boolean;
  error: string | null;
}

export default function CommentEditForm({ initialContent, onSave, onCancel, isEditing, error }: CommentEditFormProps) {
  const [content, setContent] = useState(initialContent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      return;
    }
    await onSave(content);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        className="textarea textarea-bordered w-full"
        placeholder="编辑留言..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
        disabled={isEditing}
        rows={3}
      />
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={isEditing || !content.trim()}>
          {isEditing ? '保存中...' : '保存'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm" disabled={isEditing}>
          取消
        </button>
      </div>
    </form>
  );
}
