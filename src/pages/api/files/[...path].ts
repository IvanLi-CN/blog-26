import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';

import { createForbiddenResponse, isAdminRequest } from '~/lib/auth-utils';
import { config } from '~/lib/config';
import { getWebDAVClient, isWebDAVEnabled } from '~/lib/webdav';

export const prerender = false;

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

    const headers: Record<string, string> = {};
    if (webdavConfig.username && webdavConfig.password) {
      headers.Authorization = `Basic ${Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')}`;
    }

    const response = await fetch(url, { headers });
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

// 创建本地文件
async function createLocalFile(filePath: string, content: Buffer | string): Promise<boolean> {
  try {
    const fullPath = path.join(process.cwd(), 'dev-data/local', filePath);
    const dir = path.dirname(fullPath);

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (content instanceof Buffer) {
      fs.writeFileSync(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, content, 'utf-8');
    }
    return true;
  } catch (error) {
    console.error('Error creating local file:', error);
    return false;
  }
}

// 创建WebDAV文件
async function createWebDAVFile(filePath: string, content: Buffer | string): Promise<boolean> {
  try {
    if (!isWebDAVEnabled()) {
      return false;
    }

    const webdavClient = getWebDAVClient();

    if (content instanceof Buffer) {
      await webdavClient.putBinaryFile(filePath, content.buffer as ArrayBuffer);
    } else {
      await webdavClient.putFile(filePath, content);
    }
    return true;
  } catch (error) {
    console.error('Error creating WebDAV file:', error);
    return false;
  }
}

// 删除本地文件
async function deleteLocalFile(filePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(process.cwd(), 'dev-data/local', filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return true;
  } catch (error) {
    console.error('Error deleting local file:', error);
    return false;
  }
}

// 删除WebDAV文件
async function deleteWebDAVFile(filePath: string): Promise<boolean> {
  try {
    if (!isWebDAVEnabled()) {
      return false;
    }

    const webdavClient = getWebDAVClient();
    await webdavClient.deleteFile(filePath);
    return true;
  } catch (error) {
    console.error('Error deleting WebDAV file:', error);
    return false;
  }
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

// 验证路径安全性
function isValidPath(filePath: string): boolean {
  // 防止路径遍历攻击
  if (filePath.includes('..') || filePath.includes('//') || filePath.startsWith('/')) {
    return false;
  }
  return true;
}

// GET - 读取文件（管理员专用）
export const GET: APIRoute = async ({ params, request }) => {
  try {
    // 权限检查
    const isAdmin = await isAdminRequest(request);
    if (!isAdmin) {
      return createForbiddenResponse('Admin access required');
    }

    const pathSegments = params.path?.split('/') || [];

    if (pathSegments.length < 2) {
      return new Response('Invalid path format. Expected: /api/files/<source>/<...path>', {
        status: 400,
      });
    }

    const [source, ...filePathSegments] = pathSegments;
    const filePath = filePathSegments.join('/');

    if (!filePath || !isValidPath(filePath)) {
      return new Response('Invalid file path', { status: 400 });
    }

    console.log(`Admin Files API: Reading ${source}/${filePath}`);

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
      console.log(`Admin Files API: File not found: ${source}/${filePath}`);
      return new Response('File not found', { status: 404 });
    }

    const mimeType = getMimeType(filePath);
    console.log(`Admin Files API: Found file ${source}/${filePath}, type: ${mimeType}, size: ${fileBuffer.length}`);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Admin Files API: Error reading file:', error);
    return new Response('Internal server error', { status: 500 });
  }
};

// POST - 创建文件（管理员专用）
export const POST: APIRoute = async ({ params, request }) => {
  try {
    // 权限检查
    const isAdmin = await isAdminRequest(request);
    if (!isAdmin) {
      return createForbiddenResponse('Admin access required');
    }

    const pathSegments = params.path?.split('/') || [];

    if (pathSegments.length < 2) {
      return new Response('Invalid path format. Expected: /api/files/<source>/<...path>', {
        status: 400,
      });
    }

    const [source, ...filePathSegments] = pathSegments;
    const filePath = filePathSegments.join('/');

    if (!filePath || !isValidPath(filePath)) {
      return new Response('Invalid file path', { status: 400 });
    }

    console.log(`Admin Files API: Creating ${source}/${filePath}`);

    // 获取请求内容
    const contentType = request.headers.get('content-type') || '';
    let content: Buffer | string;

    if (contentType.includes('application/json')) {
      const json = await request.json();
      content = json.content || '';
    } else if (contentType.includes('text/')) {
      content = await request.text();
    } else {
      // 二进制内容
      const arrayBuffer = await request.arrayBuffer();
      content = Buffer.from(arrayBuffer);
    }

    // 根据数据源创建文件
    let success = false;

    switch (source) {
      case 'local':
        success = await createLocalFile(filePath, content);
        break;
      case 'webdav':
        success = await createWebDAVFile(filePath, content);
        break;
      default:
        return new Response(`Unsupported source: ${source}`, { status: 400 });
    }

    if (!success) {
      return new Response('Failed to create file', { status: 500 });
    }

    console.log(`Admin Files API: Created file ${source}/${filePath}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'File created successfully',
        path: `${source}/${filePath}`,
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Admin Files API: Error creating file:', error);
    return new Response('Internal server error', { status: 500 });
  }
};

// PUT - 更新文件（管理员专用）
export const PUT: APIRoute = async ({ params, request }) => {
  try {
    // 权限检查
    const isAdmin = await isAdminRequest(request);
    if (!isAdmin) {
      return createForbiddenResponse('Admin access required');
    }

    const pathSegments = params.path?.split('/') || [];

    if (pathSegments.length < 2) {
      return new Response('Invalid path format. Expected: /api/files/<source>/<...path>', {
        status: 400,
      });
    }

    const [source, ...filePathSegments] = pathSegments;
    const filePath = filePathSegments.join('/');

    if (!filePath || !isValidPath(filePath)) {
      return new Response('Invalid file path', { status: 400 });
    }

    console.log(`Admin Files API: Updating ${source}/${filePath}`);

    // 获取请求内容
    const contentType = request.headers.get('content-type') || '';
    let content: Buffer | string;

    if (contentType.includes('application/json')) {
      const json = await request.json();
      content = json.content || '';
    } else if (contentType.includes('text/')) {
      content = await request.text();
    } else {
      // 二进制内容
      const arrayBuffer = await request.arrayBuffer();
      content = Buffer.from(arrayBuffer);
    }

    // 根据数据源更新文件（PUT 操作与 POST 相同，都是创建或覆盖）
    let success = false;

    switch (source) {
      case 'local':
        success = await createLocalFile(filePath, content);
        break;
      case 'webdav':
        success = await createWebDAVFile(filePath, content);
        break;
      default:
        return new Response(`Unsupported source: ${source}`, { status: 400 });
    }

    if (!success) {
      return new Response('Failed to update file', { status: 500 });
    }

    console.log(`Admin Files API: Updated file ${source}/${filePath}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'File updated successfully',
        path: `${source}/${filePath}`,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Admin Files API: Error updating file:', error);
    return new Response('Internal server error', { status: 500 });
  }
};

// DELETE - 删除文件（管理员专用）
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    // 权限检查
    const isAdmin = await isAdminRequest(request);
    if (!isAdmin) {
      return createForbiddenResponse('Admin access required');
    }

    const pathSegments = params.path?.split('/') || [];

    if (pathSegments.length < 2) {
      return new Response('Invalid path format. Expected: /api/files/<source>/<...path>', {
        status: 400,
      });
    }

    const [source, ...filePathSegments] = pathSegments;
    const filePath = filePathSegments.join('/');

    if (!filePath || !isValidPath(filePath)) {
      return new Response('Invalid file path', { status: 400 });
    }

    console.log(`Admin Files API: Deleting ${source}/${filePath}`);

    // 根据数据源删除文件
    let success = false;

    switch (source) {
      case 'local':
        success = await deleteLocalFile(filePath);
        break;
      case 'webdav':
        success = await deleteWebDAVFile(filePath);
        break;
      default:
        return new Response(`Unsupported source: ${source}`, { status: 400 });
    }

    if (!success) {
      return new Response('Failed to delete file', { status: 500 });
    }

    console.log(`Admin Files API: Deleted file ${source}/${filePath}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'File deleted successfully',
        path: `${source}/${filePath}`,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Admin Files API: Error deleting file:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
