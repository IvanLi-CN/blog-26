import path from 'path';
import sharp from 'sharp';

export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  addWatermark?: boolean;
  removeMetadata?: boolean;
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
  width: 1920,
  height: 1080,
  quality: 85,
  format: 'webp',
  addWatermark: true,
  removeMetadata: true,
};

/**
 * 创建水印文本
 */
async function createWatermarkSvg(text: string, width: number, height: number): Promise<Buffer> {
  // 确保尺寸为正数且合理
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));

  // 计算字体大小，基于图片宽度，但设置合理的范围
  const fontSize = Math.max(8, Math.min(32, safeWidth * 0.02));

  // 水印位置：右下角，留出一些边距
  const padding = Math.max(4, fontSize * 0.5);
  const x = safeWidth - padding;
  const y = safeHeight - padding;

  const svg = `
    <svg width="${safeWidth}" height="${safeHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.5)"/>
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
        stroke-width="0.5"
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
  const originalWidth = metadata.width || opts.width;
  const originalHeight = metadata.height || opts.height;

  // 计算目标尺寸，保持宽高比
  let targetWidth = opts.width;
  let targetHeight = opts.height;

  if (originalWidth && originalHeight) {
    const aspectRatio = originalWidth / originalHeight;

    if (opts.width && !opts.height) {
      targetWidth = opts.width;
      targetHeight = Math.round(opts.width / aspectRatio);
    } else if (opts.height && !opts.width) {
      targetHeight = opts.height;
      targetWidth = Math.round(opts.height * aspectRatio);
    } else if (opts.width && opts.height) {
      // 如果同时指定了宽高，保持宽高比，以较小的缩放比例为准
      const widthRatio = opts.width / originalWidth;
      const heightRatio = opts.height / originalHeight;
      const ratio = Math.min(widthRatio, heightRatio);

      targetWidth = Math.round(originalWidth * ratio);
      targetHeight = Math.round(originalHeight * ratio);
    }
  }

  // 调整尺寸
  if (targetWidth && targetHeight) {
    pipeline = pipeline.resize(targetWidth, targetHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // 默认情况下 sharp 会移除所有元数据（包括 EXIF 信息）
  // 如果需要保留元数据，使用 keepMetadata()
  if (!opts.removeMetadata) {
    pipeline = pipeline.keepMetadata();
  }

  // 添加水印 - 需要先获取调整后的实际尺寸
  if (opts.addWatermark) {
    try {
      // 获取当前 pipeline 的元数据以确定实际尺寸
      const currentMetadata = await pipeline.metadata();
      const actualWidth = currentMetadata.width || targetWidth || originalWidth;
      const actualHeight = currentMetadata.height || targetHeight || originalHeight;

      if (actualWidth && actualHeight) {
        const watermarkSvg = await createWatermarkSvg('ivanli.cc', actualWidth, actualHeight);
        pipeline = pipeline.composite([
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
  const validBreakpoints = breakpoints.filter((width) => width <= originalWidth);

  // 为每个断点生成优化图片
  for (const width of validBreakpoints) {
    try {
      const result = await optimizeImage(inputBuffer, {
        ...options,
        width,
        height: undefined, // 让高度自动计算以保持宽高比
      });

      results.set(width, result);
    } catch (error) {
      console.error(`Failed to generate image for width ${width}:`, error);
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
