import { useEffect, useState } from 'react';

interface ImageLightboxProps {
  isOpen: boolean;
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageLightbox({ isOpen, src, alt, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // 重置状态
  const resetImageState = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    setImageLoaded(false);
  };

  // 处理滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.5, Math.min(5, scale + delta));
    setScale(newScale);

    // 如果缩放到1，重置位置
    if (newScale === 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  // 处理鼠标按下
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  // 处理鼠标移动
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  // 处理鼠标释放
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 处理键盘事件
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === '0' || e.key === 'Home') {
        // 重置缩放和位置
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // 关闭模态框时重置状态
  const handleClose = () => {
    resetImageState();
    onClose();
  };

  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center" onClick={handleClose}>
      {/* 关闭按钮 */}
      <button
        className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
        }}
        aria-label="关闭"
      >
        ✕
      </button>

      {/* 缩放提示 */}
      <div className="absolute top-4 left-4 text-white text-sm bg-black bg-opacity-50 px-3 py-2 rounded z-10">
        <div>滚轮缩放 | 拖拽移动 | ESC 关闭</div>
        <div>缩放: {Math.round(scale * 100)}%</div>
      </div>

      {/* 图片容器 */}
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={(e) => e.stopPropagation()}
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
          onMouseDown={handleMouseDown}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(false)}
          draggable={false}
        />

        {/* 加载状态 */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-lg">加载中...</div>
          </div>
        )}
      </div>
    </div>
  );
}
