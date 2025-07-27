import path from 'path';
import sharp from 'sharp';

export interface ImageOptimizationOptions {
  size?: number; // 单一尺寸参数，图片会等比缩放到这个尺寸
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  addWatermark?: boolean;
  removeMetadata?: boolean;
  pixelRatio?: number; // 显示倍率，用于调整水印大小，默认1x
}

export interface OptimizedImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
}

// 预定义的响应式断点
export const RESPONSIVE_BREAKPOINTS = [320, 480, 640, 768, 1024, 1280, 1536, 1920];

// 默认优化选项
export const DEFAULT_OPTIMIZATION_OPTIONS: Required<ImageOptimizationOptions> = {
  size: 1920,
  quality: 85,
  format: 'webp',
  addWatermark: true,
  removeMetadata: true,
  pixelRatio: 1,
};

/**
 * 根据像素倍率创建水印文本
 */
async function createWatermarkSvg(
  text: string,
  actualWidth: number,
  actualHeight: number,
  pixelRatio: number = 1
): Promise<Buffer> {
  // 确保尺寸为正数且合理
  const safeActualWidth = Math.max(1, Math.floor(actualWidth));
  const safeActualHeight = Math.max(1, Math.floor(actualHeight));

  // 水印默认高度20像素，根据像素倍率调整
  const watermarkHeight = 20 * pixelRatio;

  // 计算字体大小，保持水印高度一致
  const fontSize = Math.max(8, Math.min(64, watermarkHeight));

  // 水印位置：右下角，留出一些边距
  const padding = Math.max(4, fontSize * 0.5);
  const x = safeActualWidth - padding;
  const y = safeActualHeight - padding;

  // 阴影和描边效果基于字体大小
  const shadowOffset = Math.max(1, fontSize * 0.08);
  const strokeWidth = Math.max(0.5, fontSize * 0.04);

  const svg = `
    <svg width="${safeActualWidth}" height="${safeActualHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="${shadowOffset}" dy="${shadowOffset}" stdDeviation="${shadowOffset}" flood-color="rgba(0,0,0,0.5)"/>
        </filter>
      </defs>
      <text
        x="${x}"
        y="${y}"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="500"
        fill="rgba(255,255,255,0.8)"
        stroke="rgba(128,128,128,0.6)"
        stroke-width="${strokeWidth}"
        text-anchor="end"
        dominant-baseline="bottom"
        filter="url(#shadow)"
      >${text}</text>
    </svg>
  `;

  return Buffer.from(svg);
}

/**
 * 优化单张图片
 */
export async function optimizeImage(
  inputBuffer: Buffer,
  options: Partial<ImageOptimizationOptions> = {}
): Promise<OptimizedImageResult> {
  const opts = { ...DEFAULT_OPTIMIZATION_OPTIONS, ...options };

  let pipeline = sharp(inputBuffer);

  // 获取原始图片信息
  const metadata = await pipeline.metadata();
  const originalWidth = metadata.width;
  const originalHeight = metadata.height;

  // 计算目标尺寸，保持宽高比
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  if (opts.size && originalWidth && originalHeight) {
    // 如果传入的尺寸大于原图的最大边，则不处理
    const maxOriginalDimension = Math.max(originalWidth, originalHeight);
    if (opts.size >= maxOriginalDimension) {
      // 不缩放，保持原始尺寸
      targetWidth = originalWidth;
      targetHeight = originalHeight;
    } else {
      // 等比缩放到指定尺寸
      const aspectRatio = originalWidth / originalHeight;

      if (originalWidth >= originalHeight) {
        // 宽图：以宽度为准
        targetWidth = opts.size;
        targetHeight = Math.round(opts.size / aspectRatio);
      } else {
        // 高图：以高度为准
        targetHeight = opts.size;
        targetWidth = Math.round(opts.size * aspectRatio);
      }
    }
  }

  // 调整尺寸
  if (targetWidth && targetHeight && (targetWidth !== originalWidth || targetHeight !== originalHeight)) {
    console.log('Resizing from', { originalWidth, originalHeight }, 'to', { targetWidth, targetHeight });
    pipeline = pipeline.resize(targetWidth, targetHeight, {
      fit: 'cover', // 使用cover确保输出尺寸准确
      withoutEnlargement: true,
    });
  }

  // 默认情况下 sharp 会移除所有元数据（包括 EXIF 信息）
  // 如果需要保留元数据，使用 keepMetadata()
  if (!opts.removeMetadata) {
    pipeline = pipeline.keepMetadata();
  }

  // 添加水印 - 简化版本
  if (opts.addWatermark) {
    try {
      // 使用计算出的目标尺寸，如果没有缩放则使用原始尺寸
      const finalWidth = targetWidth || originalWidth;
      const finalHeight = targetHeight || originalHeight;

      if (finalWidth && finalHeight) {
        // 先处理图片到最终尺寸，然后添加水印
        const processedBuffer = await pipeline.toBuffer();
        const processedMeta = await sharp(processedBuffer).metadata();

        const watermarkSvg = await createWatermarkSvg(
          'ivanli.cc',
          processedMeta.width || finalWidth,
          processedMeta.height || finalHeight,
          opts.pixelRatio || 1
        );

        // 重新创建pipeline并添加水印
        pipeline = sharp(processedBuffer).composite([
          {
            input: watermarkSvg,
            blend: 'over',
          },
        ]);
      }
    } catch (watermarkError) {
      console.warn('添加水印失败，跳过水印:', watermarkError.message);
      // 如果水印添加失败，继续处理图片但不添加水印
    }
  }

  // 设置输出格式和质量
  switch (opts.format) {
    case 'webp':
      pipeline = pipeline.webp({ quality: opts.quality });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: opts.quality });
      break;
    case 'png':
      pipeline = pipeline.png({ quality: opts.quality });
      break;
  }

  // 执行处理
  const result = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
    format: result.info.format,
    size: result.info.size,
  };
}

/**
 * 生成多个分辨率的优化图片
 */
export async function generateResponsiveImages(
  inputBuffer: Buffer,
  breakpoints: number[] = RESPONSIVE_BREAKPOINTS,
  options: Partial<ImageOptimizationOptions> = {}
): Promise<Map<number, OptimizedImageResult>> {
  const results = new Map<number, OptimizedImageResult>();

  // 获取原始图片尺寸
  const metadata = await sharp(inputBuffer).metadata();
  const originalWidth = metadata.width || 1920;

  // 过滤掉大于原始宽度的断点
  const validBreakpoints = breakpoints.filter((size) => size <= originalWidth);

  // 为每个断点生成优化图片
  for (const size of validBreakpoints) {
    try {
      const result = await optimizeImage(inputBuffer, {
        ...options,
        size,
      });

      results.set(size, result);
    } catch (error) {
      console.error(`Failed to generate image for size ${size}:`, error);
    }
  }

  return results;
}

/**
 * 检查文件是否为支持的图片格式
 */
export function isSupportedImageFormat(filename: string): boolean {
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff', '.bmp'];
  const ext = path.extname(filename).toLowerCase();
  return supportedExtensions.includes(ext);
}

/**
 * 根据文件扩展名获取 MIME 类型
 */
export function getMimeTypeFromExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
