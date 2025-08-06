import { describe, expect, it } from 'vitest';
import {
  generateOptimizedImageUrl,
  isExternalUrl,
  isImagePath,
  isOptimizedImageUrl,
  resolveRelativePath,
} from '../path-resolver';

describe('path-resolver', () => {
  describe('resolveRelativePath', () => {
    describe('~/assets/ 路径处理', () => {
      it('应该正确处理 ~/assets/ 路径', () => {
        const result = resolveRelativePath('~/assets/image.jpg', 'Memos/');
        expect(result).toBe('assets/image.jpg');
      });

      it('应该正确处理 ~/assets/ 子目录路径', () => {
        const result = resolveRelativePath('~/assets/icons/logo.svg', 'Projects/');
        expect(result).toBe('assets/icons/logo.svg');
      });
    });

    describe('./ 相对路径处理', () => {
      it('应该正确处理 ./ 路径', () => {
        const result = resolveRelativePath('./image.jpg', 'Memos/');
        expect(result).toBe('Memos/image.jpg');
      });

      it('应该正确处理 ./assets/ 路径', () => {
        const result = resolveRelativePath('./assets/image.jpg', 'Projects/MyProject/');
        expect(result).toBe('Projects/MyProject/assets/image.jpg');
      });

      it('应该正确处理空目录的 ./ 路径', () => {
        const result = resolveRelativePath('./image.jpg', '');
        expect(result).toBe('image.jpg');
      });
    });

    describe('../ 上级目录路径处理', () => {
      it('应该正确处理单级 ../ 路径', () => {
        const result = resolveRelativePath('../image.jpg', 'Memos/SubDir/');
        expect(result).toBe('Memos/image.jpg');
      });

      it('应该正确处理多级 ../ 路径', () => {
        const result = resolveRelativePath('../../assets/image.jpg', 'Projects/MyProject/SubDir/');
        expect(result).toBe('Projects/assets/image.jpg');
      });

      it('应该正确处理超出根目录的 ../ 路径', () => {
        const result = resolveRelativePath('../../../image.jpg', 'Memos/');
        expect(result).toBe('image.jpg');
      });

      it('应该正确处理复杂的 ../ 路径', () => {
        const result = resolveRelativePath('../assets/icons/logo.svg', 'Projects/MyProject/');
        expect(result).toBe('Projects/assets/icons/logo.svg');
      });
    });

    describe('/ 绝对路径处理', () => {
      it('应该正确处理绝对路径', () => {
        const result = resolveRelativePath('/assets/image.jpg', 'Memos/');
        expect(result).toBe('assets/image.jpg');
      });

      it('应该正确处理根目录绝对路径', () => {
        const result = resolveRelativePath('/image.jpg', 'Projects/');
        expect(result).toBe('image.jpg');
      });
    });

    describe('无前缀相对路径处理', () => {
      it('应该为 Memos 目录添加 assets/ 前缀', () => {
        const result = resolveRelativePath('image.jpg', 'Memos/');
        expect(result).toBe('assets/image.jpg');
      });

      it('应该为 Memos 子目录添加 assets/ 前缀', () => {
        const result = resolveRelativePath('image.jpg', 'Memos/SubDir/');
        expect(result).toBe('assets/image.jpg');
      });

      it('应该为已有 assets/ 前缀的 Memos 路径保持不变', () => {
        const result = resolveRelativePath('assets/image.jpg', 'Memos/');
        expect(result).toBe('assets/image.jpg');
      });

      it('应该为非 Memos 目录使用相对路径', () => {
        const result = resolveRelativePath('image.jpg', 'Projects/MyProject/');
        expect(result).toBe('Projects/MyProject/image.jpg');
      });
    });

    describe('路径清理', () => {
      it('应该移除多余的斜杠', () => {
        const result = resolveRelativePath('./assets//image.jpg', 'Memos/');
        expect(result).toBe('Memos/assets/image.jpg');
      });

      it('应该移除开头的斜杠', () => {
        const result = resolveRelativePath('/assets/image.jpg', '');
        expect(result).toBe('assets/image.jpg');
      });
    });
  });

  describe('generateOptimizedImageUrl', () => {
    it('应该生成默认参数的优化图片URL', () => {
      const result = generateOptimizedImageUrl('assets/image.jpg');
      expect(result).toBe('/api/render-image/assets/image.jpg?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该生成自定义参数的优化图片URL', () => {
      const result = generateOptimizedImageUrl('assets/image.jpg', {
        format: 'png',
        quality: 95,
        size: 800,
        dpr: 2,
      });
      expect(result).toBe('/api/render-image/assets/image.jpg?f=png&q=95&s=800&dpr=2');
    });

    it('应该处理复杂路径', () => {
      const result = generateOptimizedImageUrl('Projects/MyProject/assets/image.jpg');
      expect(result).toBe('/api/render-image/Projects/MyProject/assets/image.jpg?f=webp&q=85&s=1200&dpr=1');
    });
  });

  describe('isImagePath', () => {
    it('应该识别常见图片格式', () => {
      expect(isImagePath('image.jpg')).toBe(true);
      expect(isImagePath('image.jpeg')).toBe(true);
      expect(isImagePath('image.png')).toBe(true);
      expect(isImagePath('image.gif')).toBe(true);
      expect(isImagePath('image.webp')).toBe(true);
      expect(isImagePath('image.svg')).toBe(true);
      expect(isImagePath('image.bmp')).toBe(true);
      expect(isImagePath('image.tiff')).toBe(true);
    });

    it('应该识别大写扩展名', () => {
      expect(isImagePath('image.JPG')).toBe(true);
      expect(isImagePath('image.PNG')).toBe(true);
      expect(isImagePath('image.SVG')).toBe(true);
    });

    it('应该拒绝非图片文件', () => {
      expect(isImagePath('document.pdf')).toBe(false);
      expect(isImagePath('text.txt')).toBe(false);
      expect(isImagePath('video.mp4')).toBe(false);
      expect(isImagePath('audio.mp3')).toBe(false);
    });

    it('应该处理带路径的文件名', () => {
      expect(isImagePath('assets/images/photo.jpg')).toBe(true);
      expect(isImagePath('/path/to/image.png')).toBe(true);
      expect(isImagePath('./relative/image.svg')).toBe(true);
    });
  });

  describe('isExternalUrl', () => {
    it('应该识别HTTP URL', () => {
      expect(isExternalUrl('http://example.com/image.jpg')).toBe(true);
      expect(isExternalUrl('https://example.com/image.jpg')).toBe(true);
    });

    it('应该拒绝相对路径', () => {
      expect(isExternalUrl('./image.jpg')).toBe(false);
      expect(isExternalUrl('/assets/image.jpg')).toBe(false);
      expect(isExternalUrl('assets/image.jpg')).toBe(false);
    });

    it('应该拒绝其他协议', () => {
      expect(isExternalUrl('ftp://example.com/file.jpg')).toBe(false);
      expect(isExternalUrl('data:image/png;base64,abc')).toBe(false);
    });
  });

  describe('isOptimizedImageUrl', () => {
    it('应该识别优化图片端点', () => {
      expect(isOptimizedImageUrl('/api/render-image/assets/image.jpg')).toBe(true);
      expect(isOptimizedImageUrl('/api/render-image/Projects/image.png?f=webp')).toBe(true);
    });

    it('应该拒绝其他路径', () => {
      expect(isOptimizedImageUrl('/files/webdav/assets/image.jpg')).toBe(false);
      expect(isOptimizedImageUrl('/assets/image.jpg')).toBe(false);
      expect(isOptimizedImageUrl('https://example.com/api/render-image/image.jpg')).toBe(false);
    });
  });

  describe('集成测试 - 真实场景', () => {
    it('应该正确处理SVG测试文章的封面图片路径', () => {
      // SVG测试文章的封面图片：./assets/svg-test-diagram.svg
      const result = resolveRelativePath('./assets/svg-test-diagram.svg', '');
      expect(result).toBe('assets/svg-test-diagram.svg');
    });

    it('应该正确处理Memos中的图片路径', () => {
      // Memos中的图片：./image.jpg
      const result = resolveRelativePath('./image.jpg', 'Memos/');
      expect(result).toBe('Memos/image.jpg');
    });

    it('应该正确处理Memos中的assets图片', () => {
      // Memos中的全局assets图片：image.jpg
      const result = resolveRelativePath('image.jpg', 'Memos/');
      expect(result).toBe('assets/image.jpg');
    });

    it('应该正确处理项目文章中的相对图片', () => {
      // 项目文章中的图片：./diagrams/flow.svg
      const result = resolveRelativePath('./diagrams/flow.svg', 'Projects/MyProject/');
      expect(result).toBe('Projects/MyProject/diagrams/flow.svg');
    });

    it('应该正确处理跨目录引用', () => {
      // 项目文章引用上级目录的共享资源：../shared/logo.png
      const result = resolveRelativePath('../shared/logo.png', 'Projects/MyProject/');
      expect(result).toBe('Projects/shared/logo.png');
    });
  });
});
