import React, { useState } from 'react';

export interface Attachment {
  filename: string;
  path: string;
  contentType?: string;
  size?: number;
  isImage: boolean;
}

interface AttachmentGridProps {
  attachments: Attachment[];
  onRemove?: (index: number) => void;
  editable?: boolean;
}

// 图片放大模态框组件
function ImageModal({
  src,
  alt,
  filename,
  size,
  isOpen,
  onClose,
}: {
  src: string;
  alt: string;
  filename: string;
  size?: number;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  if (!isOpen) return null;

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 重置状态
  const resetImageState = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setImageLoaded(false);
    setImageDimensions({ width: 0, height: 0 });
  };

  // 处理图片加载
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setImageLoaded(true);
  };

  // 处理鼠标滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.1, Math.min(5, scale + delta));
    setScale(newScale);
  };

  // 处理拖拽开始
  const handleMouseDown = (e: React.MouseEvent) => {
    // 移除缩放限制，任何缩放级别都可以拖拽
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  // 处理拖拽移动
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  // 处理拖拽结束
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 双击重置
  const handleDoubleClick = () => {
    if (scale === 1) {
      setScale(2);
    } else {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  // 关闭模态框时重置状态
  const handleClose = () => {
    resetImageState();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center" onClick={handleClose}>
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={src}
          alt={alt}
          className={`max-w-none select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            maxWidth: scale === 1 ? '90vw' : 'none',
            maxHeight: scale === 1 ? '90vh' : 'none',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onLoad={handleImageLoad}
          draggable={false}
        />

        {/* 工具栏 */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          {/* 缩放控制 */}
          <div className="bg-black bg-opacity-50 text-white px-3 py-2 rounded-md flex items-center space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setScale(Math.max(0.1, scale - 0.2));
              }}
              className="w-8 h-8 flex items-center justify-center hover:bg-white hover:bg-opacity-20 rounded"
              title="缩小"
            >
              −
            </button>
            <span className="text-sm min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setScale(Math.min(5, scale + 0.2));
              }}
              className="w-8 h-8 flex items-center justify-center hover:bg-white hover:bg-opacity-20 rounded"
              title="放大"
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setScale(1);
                setPosition({ x: 0, y: 0 });
              }}
              className="px-2 py-1 text-xs hover:bg-white hover:bg-opacity-20 rounded"
              title="重置"
            >
              重置
            </button>
          </div>

          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="w-10 h-10 bg-black bg-opacity-50 hover:bg-opacity-75 text-white rounded-full flex items-center justify-center text-xl font-bold"
            title="关闭"
          >
            ×
          </button>
        </div>

        {/* 文件信息和操作提示 */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
          <div className="bg-black bg-opacity-50 text-white px-3 py-2 rounded-md">
            <div className="text-sm font-medium">{filename}</div>
            <div className="text-xs opacity-75 flex items-center space-x-4">
              {size && <span>{formatFileSize(size)}</span>}
              {imageLoaded && (
                <span>
                  {imageDimensions.width} × {imageDimensions.height}
                </span>
              )}
            </div>
          </div>

          <div className="bg-black bg-opacity-50 text-white px-3 py-2 rounded-md text-xs opacity-75">
            <div>滚轮缩放 • 拖拽移动 • 双击重置</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AttachmentGrid({ attachments, onRemove, editable = false }: AttachmentGridProps) {
  const [selectedImage, setSelectedImage] = useState<{
    src: string;
    alt: string;
    filename: string;
    size?: number;
  } | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'ppt':
      case 'pptx':
        return '📽️';
      case 'zip':
      case 'rar':
      case '7z':
        return '🗜️';
      case 'mp3':
      case 'wav':
      case 'flac':
        return '🎵';
      case 'mp4':
      case 'avi':
      case 'mov':
        return '🎬';
      default:
        return '📎';
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 mt-2 sm:mt-3">
        {attachments.map((attachment, index) => (
          <div key={`${attachment.path}-${index}`} className="relative group">
            {/* 删除按钮 */}
            {editable && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute top-1 right-1 sm:top-2 sm:right-2 z-10 btn btn-circle btn-xs btn-error opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                title="删除附件"
              >
                ×
              </button>
            )}

            {/* 1:1 比例的附件容器 */}
            <div
              className={`aspect-square border border-base-300 rounded-lg overflow-hidden hover:shadow-md transition-shadow relative ${
                attachment.isImage ? 'bg-base-100' : 'bg-base-200'
              }`}
            >
              {attachment.isImage ? (
                <div
                  className="w-full h-full cursor-pointer relative group/image"
                  onClick={(e) => {
                    // 阻止事件冒泡，防止触发父级的详情页跳转
                    e.preventDefault();
                    e.stopPropagation();

                    // 使用优化后的图片 URL，指定显示尺寸为300x300（闪念附件1:1比例）
                    const imagePath = attachment.path.replace(/^\//, '');
                    const optimizedSrc = `/api/render-image/${imagePath}?f=webp&q=90&display-w=300&display-h=300`;
                    setSelectedImage({
                      src: optimizedSrc,
                      alt: attachment.filename,
                      filename: attachment.filename,
                      size: attachment.size,
                    });
                  }}
                >
                  <img
                    src={`/api/render-image/${attachment.path.replace(/^\//, '')}?w=300&f=webp&q=85&display-w=300&display-h=300`}
                    alt={attachment.filename}
                    className="w-full h-full object-cover bg-base-200"
                    loading="lazy"
                  />

                  {/* 文件名覆盖层 */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <div className="text-white text-xs truncate">{attachment.filename}</div>
                  </div>
                </div>
              ) : (
                <div
                  className="w-full h-full flex flex-col items-center justify-center p-3 text-center relative group/file"
                  style={{
                    minHeight: '100%',
                  }}
                >
                  <div className="text-4xl mb-2 text-base-content/60">{getFileIcon(attachment.filename)}</div>
                  <div className="text-xs font-medium truncate w-full px-1 text-base-content">
                    {attachment.filename}
                  </div>
                  {attachment.size && (
                    <div className="text-xs mt-1 text-base-content/60">{formatFileSize(attachment.size)}</div>
                  )}

                  {/* 悬停效果 */}
                  <div className="absolute inset-0 bg-base-content opacity-0 group-hover/file:opacity-10 transition-all duration-200 rounded-lg"></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 图片放大模态框 */}
      <ImageModal
        src={selectedImage?.src || ''}
        alt={selectedImage?.alt || ''}
        filename={selectedImage?.filename || ''}
        size={selectedImage?.size}
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
}
