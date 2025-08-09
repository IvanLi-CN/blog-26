import { useState } from 'react';
import MarkdownRenderer from '~/components/common/MarkdownRenderer';
import type { Attachment } from './AttachmentGrid';
import { MemoEditEditor } from './MemoEditEditor';

interface MemoDetailWithEditProps {
  memoData: {
    id: string;
    slug: string;
    title: string;
    content: string;
    body: string;
    publishDate: Date;
    updateDate?: Date;
    public: boolean;
    attachments: Attachment[];
    tags: string[];
    image?: any;
  };
  isAdmin: boolean;
}

export function MemoDetailWithEdit({ memoData, isAdmin }: MemoDetailWithEditProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleSaveSuccess = (updatedMemo: any) => {
    // 更新成功后退出编辑模式并刷新页面
    setIsEditing(false);
    window.location.reload();
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="mt-8">
        <MemoEditEditor
          memoId={memoData.id}
          initialContent={memoData.body}
          initialIsPublic={memoData.public}
          initialAttachments={memoData.attachments}
          onSaveSuccess={handleSaveSuccess}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div>
      {/* 管理员编辑按钮 */}
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleEditClick}
            className="btn btn-sm btn-outline btn-primary"
            data-testid="edit-memo-button"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            编辑
          </button>
        </div>
      )}

      {/* 原始内容显示 */}
      <MarkdownRenderer content={memoData.body} variant="detail" className="prose prose-lg max-w-none" />
    </div>
  );
}
