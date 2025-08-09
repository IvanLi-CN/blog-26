import { useEffect, useState } from 'react';
import ImageLightbox from './ImageLightbox';

// 全局灯箱状态，确保同一时间只有一个灯箱打开
let globalLightboxSetters: Set<(state: LightboxState) => void> = new Set();

interface ContentImageHandlerProps {
  children: React.ReactNode;
}

interface LightboxState {
  isOpen: boolean;
  src: string;
  alt: string;
  imageId?: string;
}

export default function ContentImageHandler({ children }: ContentImageHandlerProps) {
  const [lightbox, setLightbox] = useState<LightboxState>({
    isOpen: false,
    src: '',
    alt: '',
    imageId: '',
  });

  // 注册当前组件的状态设置器到全局集合
  useEffect(() => {
    globalLightboxSetters.add(setLightbox);
    return () => {
      globalLightboxSetters.delete(setLightbox);
    };
  }, []);

  // 全局状态同步函数
  const setGlobalLightbox = (newState: LightboxState) => {
    // 同步到所有组件实例
    globalLightboxSetters.forEach((setter) => setter(newState));
  };

  // 生成图片唯一标识符
  const generateImageId = (src: string): string => {
    // 使用图片路径的简化版本作为ID，移除查询参数和协议
    const cleanSrc = src
      .replace(/\?.*$/, '')
      .replace(/^https?:\/\//, '')
      .replace(/^\//, '');
    // 使用简单的哈希函数生成短ID
    let hash = 0;
    for (let i = 0; i < cleanSrc.length; i++) {
      const char = cleanSrc.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  };

  // 从URL hash中解析图片ID
  const parseImageIdFromHash = (): string | null => {
    const hash = window.location.hash;
    const match = hash.match(/^#image-(.+)$/);
    return match ? match[1] : null;
  };

  // 设置URL hash
  const setImageHash = (imageId: string) => {
    window.history.replaceState(null, '', `#image-${imageId}`);
  };

  // 清除URL hash
  const clearImageHash = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

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
        if (originalSrc.startsWith('data:')) {
          // Base64 数据 URL，直接使用
          fullSizeSrc = originalSrc;
        } else if (originalSrc.startsWith('http://') || originalSrc.startsWith('https://')) {
          // 外部 URL，直接使用
          fullSizeSrc = originalSrc;
        } else if (originalSrc.includes('/api/render-image/')) {
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
        } else if (!originalSrc.startsWith('/')) {
          // 如果是其他相对路径，也转换为 /api/render-image/ 路径
          fullSizeSrc = `/api/render-image/assets/${originalSrc}?f=webp&q=95&s=2048`;
        }

        // 生成图片ID并设置URL hash
        const imageId = generateImageId(originalSrc);
        setImageHash(imageId);

        setGlobalLightbox({
          isOpen: true,
          src: fullSizeSrc,
          alt,
          imageId,
        });
      }
    };

    // 添加事件监听器
    document.addEventListener('click', handleImageClick);

    return () => {
      document.removeEventListener('click', handleImageClick);
    };
  }, []);

  // 处理URL hash变化，支持通过URL直接打开灯箱
  useEffect(() => {
    const handleHashChange = () => {
      const imageId = parseImageIdFromHash();
      if (imageId && !lightbox.isOpen) {
        // 查找对应的图片元素
        const images = document.querySelectorAll('img.content-image[data-lightbox="true"]');
        for (const img of images) {
          const imgElement = img as HTMLImageElement;
          const originalSrc = imgElement.dataset.originalSrc || imgElement.src;
          const generatedId = generateImageId(originalSrc);

          if (generatedId === imageId) {
            // 找到匹配的图片，打开灯箱
            const alt = imgElement.alt || '图片';

            // 处理图片路径，获取高质量版本
            let fullSizeSrc = originalSrc;
            if (originalSrc.startsWith('data:')) {
              fullSizeSrc = originalSrc;
            } else if (originalSrc.startsWith('http://') || originalSrc.startsWith('https://')) {
              fullSizeSrc = originalSrc;
            } else if (originalSrc.includes('/api/render-image/')) {
              const pathMatch = originalSrc.match(/\/api\/render-image\/(.+?)(?:\?|$)/);
              if (pathMatch) {
                const imagePath = pathMatch[1];
                fullSizeSrc = `/api/render-image/${imagePath}?f=webp&q=95&s=2048`;
              }
            } else if (originalSrc.includes('/files/')) {
              const pathMatch = originalSrc.match(/\/files\/(.+?)(?:\?|$)/);
              if (pathMatch) {
                const imagePath = pathMatch[1];
                fullSizeSrc = `/files/${imagePath}?f=webp&q=95&s=2048`;
              }
            } else if (originalSrc.startsWith('assets/') || originalSrc.startsWith('./assets/')) {
              const cleanPath = originalSrc.replace(/^\.\//, '');
              fullSizeSrc = `/api/render-image/${cleanPath}?f=webp&q=95&s=2048`;
            } else if (!originalSrc.startsWith('/')) {
              fullSizeSrc = `/api/render-image/assets/${originalSrc}?f=webp&q=95&s=2048`;
            }

            setGlobalLightbox({
              isOpen: true,
              src: fullSizeSrc,
              alt,
              imageId,
            });
            break;
          }
        }
      } else if (!imageId && lightbox.isOpen) {
        // 如果hash被清除且灯箱是打开的，关闭灯箱
        setGlobalLightbox({
          isOpen: false,
          src: '',
          alt: '',
          imageId: '',
        });
      }
    };

    // 监听hash变化
    window.addEventListener('hashchange', handleHashChange);

    // 页面加载时检查hash
    handleHashChange();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [lightbox.isOpen]);

  // 单独处理浏览器后退/前进按钮
  useEffect(() => {
    const handlePopState = () => {
      // 检查当前 URL 的 hash
      const imageId = parseImageIdFromHash();
      if (!imageId && lightbox.isOpen) {
        // 如果没有图片 hash 但灯箱是打开的，关闭灯箱
        setGlobalLightbox({
          isOpen: false,
          src: '',
          alt: '',
          imageId: '',
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [lightbox.isOpen]);

  const closeLightbox = () => {
    // 先清除 hash，再关闭灯箱
    if (window.location.hash.match(/^#image-.+$/)) {
      clearImageHash();
    }

    setGlobalLightbox({
      isOpen: false,
      src: '',
      alt: '',
      imageId: '',
    });
  };

  return (
    <>
      {children}
      <ImageLightbox isOpen={lightbox.isOpen} src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
    </>
  );
}
