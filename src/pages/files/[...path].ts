import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';
import { optimizeImage } from '~/lib/image-optimizer';
import { config } from '../../lib/config';

export const prerender = false;

// 支持的图片格式
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.tiff', '.bmp'];

// 获取本地文件
async function getLocalFile(filePath: string): Promise<Buffer | null> {
  try {
    const fullPath = path.join(process.cwd(), 'dev-data/local', filePath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fs.readFileSync(fullPath);
  } catch (error) {
    console.error('Error reading local file:', error);
    return null;
  }
}

// 获取WebDAV文件
async function getWebDAVFile(filePath: string): Promise<Buffer | null> {
  try {
    const webdavConfig = config.webdav;
    if (!webdavConfig.url) {
      console.error('WebDAV config missing: URL is required');
      return null;
    }

    const url = `${webdavConfig.url}/${filePath}`;
    console.log(`WebDAV: Fetching ${url}`);

    // 构建请求头，只在有用户名和密码时才添加认证
    const headers: Record<string, string> = {};
    if (webdavConfig.username && webdavConfig.password) {
      headers.Authorization = `Basic ${Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')}`;
    }

    const response = await fetch(url, {
      headers,
    });

    console.log(`WebDAV: Response status ${response.status} for ${url}`);

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error reading WebDAV file:', error);
    return null;
  }
}

// 检查是否为图片文件
function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

// 获取MIME类型
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const pathSegments = params.path?.split('/') || [];

    if (pathSegments.length < 2) {
      return new Response('Invalid path format. Expected: /files/<source>/<...path>', {
        status: 400,
      });
    }

    const [source, ...filePathSegments] = pathSegments;
    const filePath = filePathSegments.join('/');

    if (!filePath) {
      return new Response('File path is required', { status: 400 });
    }

    console.log(`Files service: Requesting ${source}/${filePath}`);

    // 根据数据源获取文件
    let fileBuffer: Buffer | null = null;

    switch (source) {
      case 'local':
        fileBuffer = await getLocalFile(filePath);
        break;
      case 'webdav':
        fileBuffer = await getWebDAVFile(filePath);
        break;
      default:
        return new Response(`Unsupported source: ${source}`, { status: 400 });
    }

    if (!fileBuffer) {
      console.log(`Files service: File not found: ${source}/${filePath}`);
      return new Response('File not found', { status: 404 });
    }

    const mimeType = getMimeType(filePath);
    console.log(`Files service: Found file ${source}/${filePath}, type: ${mimeType}, size: ${fileBuffer.length}`);

    // 如果是图片文件，进行处理（加水印、优化等）
    if (isImageFile(filePath)) {
      try {
        const searchParams = url.searchParams;
        const size = parseInt(searchParams.get('s') || '1200');
        const quality = parseInt(searchParams.get('q') || '85');
        let format = searchParams.get('f') || 'webp';

        // 检查是否为 SVG 文件
        const isSvg = path.extname(filePath).toLowerCase() === '.svg';

        // 对于 SVG 文件，强制转换为 PNG 格式以支持水印
        if (isSvg && (format === 'webp' || format === 'jpeg')) {
          format = 'png';
          console.log(`Files service: SVG detected, forcing PNG format for watermark support`);
        }

        console.log(
          `Files service: Processing image with size=${size}, quality=${quality}, format=${format}, isSvg=${isSvg}`
        );

        const result = await optimizeImage(fileBuffer, {
          size,
          quality,
          format: format as 'webp' | 'jpeg' | 'png',
          addWatermark: true, // 确保 SVG 也添加水印
        });

        const processedBuffer = result.buffer;

        const outputMimeType =
          format === 'webp'
            ? 'image/webp'
            : format === 'jpeg'
              ? 'image/jpeg'
              : format === 'png'
                ? 'image/png'
                : mimeType;

        console.log(`Files service: Image processed successfully, output size: ${processedBuffer.length}`);

        return new Response(processedBuffer, {
          headers: {
            'Content-Type': outputMimeType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': processedBuffer.length.toString(),
          },
        });
      } catch (error) {
        console.error('Files service: Error processing image:', error);
        // 如果图片处理失败，返回原始文件
        return new Response(fileBuffer, {
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=31536000',
            'Content-Length': fileBuffer.length.toString(),
          },
        });
      }
    }

    // 对于非图片文件，直接返回
    console.log(`Files service: Returning non-image file directly`);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Files service: Error serving file:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
