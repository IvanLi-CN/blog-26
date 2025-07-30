import { useEffect, useState } from 'react';
import ImageLightbox from './ImageLightbox';

interface ContentImageHandlerProps {
  children: React.ReactNode;
}

interface LightboxState {
  isOpen: boolean;
  src: string;
  alt: string;
}

export default function ContentImageHandler({ children }: ContentImageHandlerProps) {
  const [lightbox, setLightbox] = useState<LightboxState>({
    isOpen: false,
    src: '',
    alt: '',
  });

  useEffect(() => {
    const handleImageClick = (e: Event) => {
      const target = e.target as HTMLImageElement;

      // 检查是否是内容图片
      if (
        target.tagName === 'IMG' &&
        target.classList.contains('content-image') &&
        target.dataset.lightbox === 'true'
      ) {
        e.preventDefault();
        e.stopPropagation();

        // 获取原始图片 URL，优先使用 data-original-src，否则使用 src
        const originalSrc = target.dataset.originalSrc || target.src;
        const alt = target.alt || '图片';

        // 如果是相对路径或者是优化后的图片，需要获取高质量版本
        let fullSizeSrc = originalSrc;

        // 处理不同类型的图片路径
        if (originalSrc.includes('/api/render-image/')) {
          // 如果已经是 /api/render-image/ 路径，提取路径部分并获取高质量版本
          const pathMatch = originalSrc.match(/\/api\/render-image\/(.+?)(?:\?|$)/);
          if (pathMatch) {
            const imagePath = pathMatch[1];
            fullSizeSrc = `/api/render-image/${imagePath}?f=webp&q=95&s=2048`;
          }
        } else if (originalSrc.includes('/files/')) {
          // 如果是 /files/ 路径，需要特殊处理
          const pathMatch = originalSrc.match(/\/files\/(.+?)(?:\?|$)/);
          if (pathMatch) {
            const imagePath = pathMatch[1];
            // 对于 /files/ 路径，直接使用原始路径但更改参数
            fullSizeSrc = `/files/${imagePath}?f=webp&q=95&s=2048`;
          }
        } else if (originalSrc.startsWith('assets/') || originalSrc.startsWith('./assets/')) {
          // 如果是相对路径（如 assets/xxx.jpg 或 ./assets/xxx.jpg），转换为 /api/render-image/ 路径
          const cleanPath = originalSrc.replace(/^\.\//, '');
          fullSizeSrc = `/api/render-image/${cleanPath}?f=webp&q=95&s=2048`;
        } else if (
          !originalSrc.startsWith('http://') &&
          !originalSrc.startsWith('https://') &&
          !originalSrc.startsWith('/')
        ) {
          // 如果是其他相对路径，也转换为 /api/render-image/ 路径
          fullSizeSrc = `/api/render-image/assets/${originalSrc}?f=webp&q=95&s=2048`;
        }

        setLightbox({
          isOpen: true,
          src: fullSizeSrc,
          alt,
        });
      }
    };

    // 添加事件监听器
    document.addEventListener('click', handleImageClick);

    return () => {
      document.removeEventListener('click', handleImageClick);
    };
  }, []);

  const closeLightbox = () => {
    setLightbox({
      isOpen: false,
      src: '',
      alt: '',
    });
  };

  return (
    <>
      {children}
      <ImageLightbox isOpen={lightbox.isOpen} src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
    </>
  );
}
