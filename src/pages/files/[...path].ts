import type { APIRoute } from 'astro';
import { config } from '../../lib/config';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  try {
    // 图片访问是公开的，不需要权限控制

    const path = params.path;
    if (!path) {
      console.error('Files proxy: Path is required');
      return new Response('Path is required', { status: 400 });
    }

    const webdavConfig = config.webdav;
    if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      console.error('Files proxy: WebDAV not configured');
      return new Response('WebDAV not configured', { status: 500 });
    }

    // 处理路径：确保正确拼接
    const cleanPath = Array.isArray(path) ? path.join('/') : path;
    // 解码 URL 编码的路径（处理中文字符）
    const decodedPath = decodeURIComponent(cleanPath);
    // 移除开头的斜杠，避免双斜杠
    let normalizedPath = decodedPath.replace(/^\/+/, '');

    // 特殊处理：如果路径只是文件名（没有目录），可能是闪念中的图片
    // 尝试在闪念的 assets 目录中查找
    if (!normalizedPath.includes('/') && normalizedPath.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      console.log(`Files proxy: Detected standalone image file: ${normalizedPath}`);

      // 确保memosPath不以斜杠开头，避免双斜杠
      const cleanMemosPath = webdavConfig.memosPath.replace(/^\/+/, '');

      // 尝试多个可能的路径
      const possiblePaths = [
        `${cleanMemosPath}/assets/${normalizedPath}`,
        `${cleanMemosPath}/assets/tmp/${normalizedPath}`,
        normalizedPath, // 直接在根目录查找
      ];

      for (const possiblePath of possiblePaths) {
        const cleanPossiblePath = possiblePath.replace(/^\/+/, '');
        console.log(`Files proxy: Trying path: ${cleanPossiblePath}`);

        try {
          // 对路径进行正确的编码，处理中文字符
          const pathParts = cleanPossiblePath.split('/');
          const encodedParts = pathParts.map((part) => encodeURIComponent(part));
          const encodedPath = encodedParts.join('/');
          const imageUrl = `${webdavConfig.url}/${encodedPath}`;

          console.log(`Files proxy: Trying URL: ${imageUrl}`);

          const response = await fetch(imageUrl, {
            headers: {
              Authorization: `Basic ${Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')}`,
            },
          });

          if (response.ok) {
            console.log(`Files proxy: Found image at: ${imageUrl}`);
            const imageBuffer = await response.arrayBuffer();
            const contentType = response.headers.get('content-type') || 'image/jpeg';

            return new Response(imageBuffer, {
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
              },
            });
          }
        } catch (error) {
          console.log(`Files proxy: Failed to fetch from ${cleanPossiblePath}:`, error.message);
        }
      }

      console.log(`Files proxy: Failed to find standalone image file in any location`);
    }

    // 确保memosPath不以斜杠开头，避免双斜杠
    const cleanMemosPath = webdavConfig.memosPath.replace(/^\/+/, '');

    let allPossiblePaths: string[];

    // 如果路径已经以正确的Memos路径开头，直接使用
    if (normalizedPath.startsWith(`${cleanMemosPath}/`)) {
      allPossiblePaths = [normalizedPath]; // 直接使用已经正确的路径
      console.log(`Files proxy: Using pre-formatted path: ${normalizedPath}`);
    } else {
      // 如果不是预格式化的路径，尝试多个可能的路径
      let cleanFileName = normalizedPath;

      // 如果路径包含assets，提取assets后的部分
      if (normalizedPath.includes('/assets/')) {
        cleanFileName = normalizedPath.substring(normalizedPath.lastIndexOf('/assets/') + 8);
      } else if (normalizedPath.startsWith('assets/')) {
        cleanFileName = normalizedPath.substring(7);
      }

      allPossiblePaths = [
        normalizedPath, // 原始路径
        `${cleanMemosPath}/assets/${cleanFileName}`, // 在assets目录中
        `${cleanMemosPath}/assets/tmp/${cleanFileName}`, // 在tmp子目录中
      ];
    }

    console.log(`Files proxy: Original path:`, path);
    console.log(`Files proxy: Clean path:`, cleanPath);
    console.log(`Files proxy: Decoded path:`, decodedPath);
    console.log(`Files proxy: Normalized path:`, normalizedPath);
    console.log(`Files proxy: Trying paths:`, allPossiblePaths);

    // 尝试所有可能的路径
    for (const tryPath of allPossiblePaths) {
      try {
        // 正确编码路径以确保中文字符的处理，并避免双斜杠
        const cleanTryPath = tryPath.replace(/^\/+/, ''); // 移除开头的斜杠
        const pathParts = cleanTryPath.split('/');
        const encodedParts = pathParts.map((part) => encodeURIComponent(part));
        const encodedPath = encodedParts.join('/');
        const imageUrl = `${webdavConfig.url}/${encodedPath}`;

        console.log(`Files proxy: Trying URL: ${imageUrl}`);

        // 从 WebDAV 获取图片
        const response = await fetch(imageUrl, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')}`,
          },
        });

        if (response.ok) {
          // 获取图片数据和内容类型
          const imageBuffer = await response.arrayBuffer();
          const contentType = response.headers.get('content-type') || 'image/jpeg';

          console.log(
            `Files proxy: Successfully fetched image from path: ${tryPath}, content-type: ${contentType}, size: ${imageBuffer.byteLength} bytes`
          );

          return new Response(imageBuffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        } else {
          console.log(`Files proxy: Failed to fetch from ${tryPath}: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.log(`Files proxy: Error trying path ${tryPath}:`, error.message);
      }
    }

    console.error(`Files proxy: Failed to find image in any location for path: ${path}`);
    return new Response('Image not found', { status: 404 });
  } catch (error) {
    console.error('Error proxying file:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
