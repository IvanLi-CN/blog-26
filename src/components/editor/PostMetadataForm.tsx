import { useState } from 'react';

export interface PostMetadata {
  title: string;
  description?: string;
  publishDate?: string;
  updateDate?: string;
  draft: boolean;
  public: boolean;
  tags: string[];
  category?: string;
  author?: string;
  image?: string;
  excerpt?: string;
  slug?: string;
}

interface PostMetadataFormProps {
  metadata: PostMetadata;
  onChange: (metadata: PostMetadata) => void;
  className?: string;
}

export function PostMetadataForm({ metadata, onChange, className = '' }: PostMetadataFormProps) {
  const [tagInput, setTagInput] = useState('');

  // 格式化日期为 YYYY-MM-DD 格式
  const formatDateForInput = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // 将输入的日期转换为 ISO 字符串
  const formatDateForStorage = (dateString: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toISOString();
    } catch {
      return '';
    }
  };

  const handleInputChange = (field: keyof PostMetadata, value: any) => {
    onChange({
      ...metadata,
      [field]: value,
    });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !metadata.tags.includes(tag)) {
      handleInputChange('tags', [...metadata.tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    handleInputChange(
      'tags',
      metadata.tags.filter((tag) => tag !== tagToRemove)
    );
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 标题 */}
        <div className="md:col-span-2">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            标题 *
          </label>
          <input
            type="text"
            id="title"
            value={metadata.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="输入文章标题"
            required
          />
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Slug
          </label>
          <input
            type="text"
            id="slug"
            value={metadata.slug || ''}
            onChange={(e) => handleInputChange('slug', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="文章 URL 标识符"
          />
        </div>

        {/* 分类 */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            分类
          </label>
          <input
            type="text"
            id="category"
            value={metadata.category || ''}
            onChange={(e) => handleInputChange('category', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="文章分类"
          />
        </div>

        {/* 作者 */}
        <div>
          <label htmlFor="author" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            作者
          </label>
          <input
            type="text"
            id="author"
            value={metadata.author || ''}
            onChange={(e) => handleInputChange('author', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="文章作者"
          />
        </div>

        {/* 发布日期 */}
        <div>
          <label htmlFor="publishDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            发布日期
          </label>
          <input
            type="date"
            id="publishDate"
            value={formatDateForInput(metadata.publishDate)}
            onChange={(e) => handleInputChange('publishDate', formatDateForStorage(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* 更新日期 */}
        <div>
          <label htmlFor="updateDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            更新日期
          </label>
          <input
            type="date"
            id="updateDate"
            value={formatDateForInput(metadata.updateDate)}
            onChange={(e) => handleInputChange('updateDate', formatDateForStorage(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      {/* 描述 */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          描述
        </label>
        <textarea
          id="description"
          value={metadata.description || ''}
          onChange={(e) => handleInputChange('description', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          placeholder="文章描述"
        />
      </div>

      {/* 摘要 */}
      <div>
        <label htmlFor="excerpt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          摘要
        </label>
        <textarea
          id="excerpt"
          value={metadata.excerpt || ''}
          onChange={(e) => handleInputChange('excerpt', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          placeholder="文章摘要"
        />
      </div>

      {/* 封面图片 */}
      <div>
        <label htmlFor="image" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          封面图片
        </label>
        <input
          type="url"
          id="image"
          value={metadata.image || ''}
          onChange={(e) => handleInputChange('image', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          placeholder="封面图片 URL"
        />
      </div>

      {/* 标签 */}
      <div>
        <label htmlFor="tags" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          标签
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {metadata.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagInputKeyDown}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="输入标签并按回车"
          />
          <button
            type="button"
            onClick={addTag}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            添加
          </button>
        </div>
      </div>

      {/* 状态选项 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="draft"
            checked={metadata.draft}
            onChange={(e) => handleInputChange('draft', e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="draft" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            草稿
          </label>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="public"
            checked={metadata.public}
            onChange={(e) => handleInputChange('public', e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="public" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            公开
          </label>
        </div>
      </div>
    </div>
  );
}
