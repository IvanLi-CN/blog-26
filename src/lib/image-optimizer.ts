import path from 'path';
import sharp from 'sharp';

export interface ImageOptimizationOptions {
  size?: number; // 单一尺寸参数，图片会等比缩放到这个尺寸
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  addWatermark?: boolean;
  removeMetadata?: boolean;
  pixelRatio?: number; // 显示倍率，用于调整水印大小，默认1x
  // 新增：智能宽高比控制
  usage?: 'content' | 'thumbnail' | 'avatar' | 'default'; // 图片用途
  maxRatio?: number; // 自定义最大宽高比
  minRatio?: number; // 自定义最小宽高比
  smartCrop?: boolean; // 是否启用智能裁剪，默认true
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

// 宽高比限制配置
export const ASPECT_RATIO_LIMITS = {
  content: { min: 0.5, max: 4 }, // 1:2 到 4:1 (正文图片)
  thumbnail: { min: 0.5, max: 2 }, // 1:2 到 2:1 (缩略图)
  avatar: { min: 0.8, max: 1.25 }, // 接近正方形 (头像)
  default: { min: 0.25, max: 8 }, // 更宽松的限制 (默认)
} as const;

// 默认优化选项
export const DEFAULT_OPTIMIZATION_OPTIONS: Required<ImageOptimizationOptions> = {
  size: 1920,
  quality: 85,
  format: 'webp',
  addWatermark: true,
  removeMetadata: true,
  pixelRatio: 1,
  usage: 'default',
  maxRatio: ASPECT_RATIO_LIMITS.default.max,
  minRatio: ASPECT_RATIO_LIMITS.default.min,
  smartCrop: true,
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
 * 智能裁剪图片到合适的宽高比
 */
async function smartCropImage(
  pipeline: sharp.Sharp,
  originalWidth: number,
  originalHeight: number,
  targetMinRatio: number,
  targetMaxRatio: number
): Promise<{ pipeline: sharp.Sharp; width: number; height: number }> {
  const aspectRatio = originalWidth / originalHeight;

  // 如果宽高比在合理范围内，不需要裁剪
  if (aspectRatio >= targetMinRatio && aspectRatio <= targetMaxRatio) {
    return { pipeline, width: originalWidth, height: originalHeight };
  }

  let cropWidth: number;
  let cropHeight: number;

  if (aspectRatio > targetMaxRatio) {
    // 图片太宽，需要裁剪宽度
    cropHeight = originalHeight;
    cropWidth = Math.round(originalHeight * targetMaxRatio);
  } else {
    // 图片太高，需要裁剪高度
    cropWidth = originalWidth;
    cropHeight = Math.round(originalWidth / targetMinRatio);
  }

  // 确保裁剪尺寸不超过原始尺寸
  cropWidth = Math.min(cropWidth, originalWidth);
  cropHeight = Math.min(cropHeight, originalHeight);

  // 计算裁剪位置（居中裁剪）
  const left = Math.round((originalWidth - cropWidth) / 2);
  const top = Math.round((originalHeight - cropHeight) / 2);

  console.log(
    `Smart cropping: ${originalWidth}x${originalHeight} (ratio: ${aspectRatio.toFixed(2)}) -> ${cropWidth}x${cropHeight} (ratio: ${(cropWidth / cropHeight).toFixed(2)})`
  );

  // 应用裁剪
  const croppedPipeline = pipeline.extract({
    left,
    top,
    width: cropWidth,
    height: cropHeight,
  });

  return { pipeline: croppedPipeline, width: cropWidth, height: cropHeight };
}

/**
 * 优化单张图片
 */
export async function optimizeImage(
  inputBuffer: Buffer,
  options: Partial<ImageOptimizationOptions> = {}
): Promise<OptimizedImageResult> {
  const opts = { ...DEFAULT_OPTIMIZATION_OPTIONS, ...options };

  // 根据用途设置宽高比限制
  let minRatio = opts.minRatio;
  let maxRatio = opts.maxRatio;

  if (opts.usage && opts.usage !== 'default') {
    const limits = ASPECT_RATIO_LIMITS[opts.usage];
    minRatio = limits.min;
    maxRatio = limits.max;
  }

  // 检查是否为 SVG 文件
  const isSvg = inputBuffer.toString('utf8', 0, 100).includes('<svg');

  let pipeline: sharp.Sharp;

  // 对于 SVG 文件，需要特殊处理
  if (isSvg) {
    // SVG 转换为 PNG，确保有足够的分辨率
    const svgDensity = 300; // DPI
    pipeline = sharp(inputBuffer, { density: svgDensity });

    // 强制 SVG 输出为 PNG 格式
    if (opts.format === 'webp' || opts.format === 'jpeg') {
      opts.format = 'png';
    }
  } else {
    pipeline = sharp(inputBuffer);
  }

  // 获取原始图片信息（添加错误处理）
  let metadata: import('sharp').Metadata;
  let originalWidth: number | undefined;
  let originalHeight: number | undefined;

  try {
    metadata = await pipeline.metadata();
    originalWidth = metadata.width;
    originalHeight = metadata.height;
  } catch (error) {
    console.warn('⚠️ 无法读取图片元数据，使用默认值:', error);
    // 对于测试图片或损坏的图片，使用默认值
    originalWidth = 100;
    originalHeight = 100;
    metadata = { width: originalWidth, height: originalHeight } as import('sharp').Metadata;
  }

  // 应用智能裁剪（如果启用且有有效的尺寸信息）
  let currentWidth = originalWidth;
  let currentHeight = originalHeight;

  if (opts.smartCrop && originalWidth && originalHeight && minRatio && maxRatio) {
    try {
      const cropResult = await smartCropImage(pipeline, originalWidth, originalHeight, minRatio, maxRatio);
      pipeline = cropResult.pipeline;
      currentWidth = cropResult.width;
      currentHeight = cropResult.height;
    } catch (error) {
      console.warn('⚠️ 智能裁剪失败，继续使用原始尺寸:', error);
    }
  }

  // 计算目标尺寸，保持宽高比（使用裁剪后的当前尺寸）
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  if (opts.size && currentWidth && currentHeight) {
    // 如果传入的尺寸大于当前图片的最大边，则不处理
    const maxCurrentDimension = Math.max(currentWidth, currentHeight);
    if (opts.size >= maxCurrentDimension) {
      // 不缩放，保持当前尺寸
      targetWidth = currentWidth;
      targetHeight = currentHeight;
    } else {
      // 等比缩放到指定尺寸
      const aspectRatio = currentWidth / currentHeight;

      if (currentWidth >= currentHeight) {
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
  if (targetWidth && targetHeight && (targetWidth !== currentWidth || targetHeight !== currentHeight)) {
    console.log('Resizing from', { currentWidth, currentHeight }, 'to', { targetWidth, targetHeight });
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
      // 使用计算出的目标尺寸，如果没有缩放则使用当前尺寸
      const finalWidth = targetWidth || currentWidth;
      const finalHeight = targetHeight || currentHeight;

      if (finalWidth && finalHeight) {
        // 先处理图片到最终尺寸，然后添加水印
        let processedBuffer: Buffer | null;
        try {
          processedBuffer = await pipeline.toBuffer();
        } catch (error) {
          console.warn('⚠️ 图片处理失败，跳过水印添加:', error);
          // 如果图片处理失败，跳过水印添加
          processedBuffer = null;
        }

        if (processedBuffer) {
          try {
            let processedMeta: import('sharp').Metadata;
            try {
              processedMeta = await sharp(processedBuffer).metadata();
            } catch (error) {
              console.warn('⚠️ 无法读取处理后图片元数据，使用默认值:', error);
              processedMeta = { width: finalWidth, height: finalHeight } as import('sharp').Metadata;
            }

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
          } catch (watermarkError) {
            console.warn('⚠️ 添加水印失败，跳过水印:', watermarkError);
            // 如果水印添加失败，继续处理图片但不添加水印
            pipeline = sharp(processedBuffer);
          }
        }
      }
    } catch (watermarkError) {
      console.warn('⚠️ 水印处理失败，跳过水印:', watermarkError);
      // 如果整个水印处理失败，继续处理图片但不添加水印
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

  // 执行处理（添加错误处理）
  try {
    const result = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
      format: result.info.format,
      size: result.info.size,
    };
  } catch (error) {
    console.warn('⚠️ 图片处理失败，返回原始图片:', error);
    // 如果处理失败，返回原始图片
    return {
      buffer: inputBuffer,
      width: currentWidth || 100,
      height: currentHeight || 100,
      format: 'unknown',
      size: inputBuffer.length,
    };
  }
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

  // 获取原始图片尺寸（添加错误处理）
  let metadata: import('sharp').Metadata;
  let originalWidth = 1920;
  try {
    metadata = await sharp(inputBuffer).metadata();
    originalWidth = metadata.width || 1920;
  } catch (error) {
    console.warn('⚠️ 无法读取图片元数据，使用默认宽度:', error);
  }

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
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tiff', '.bmp', '.svg'];
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
    '.svg': 'image/svg+xml',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
