import type { APIRoute } from 'astro';
import { config } from '~/lib/config';
import { isWebDAVEnabled } from '~/lib/webdav';

export const GET: APIRoute = async () => {
  try {
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      WEBDAV_URL: process.env.WEBDAV_URL,
      WEBDAV_USERNAME: process.env.WEBDAV_USERNAME,
      WEBDAV_PASSWORD: process.env.WEBDAV_PASSWORD ? '[REDACTED]' : undefined,
      WEBDAV_MEMOS_PATH: process.env.WEBDAV_MEMOS_PATH,
      WEBDAV_ASSETS_PATH: process.env.WEBDAV_ASSETS_PATH,

      // 从配置中读取的值
      config_webdav_url: config.webdav.url,
      config_webdav_username: config.webdav.username,
      config_webdav_password: config.webdav.password ? '[REDACTED]' : undefined,
      config_webdav_memosPath: config.webdav.memosPath,

      // WebDAV 状态
      isWebDAVEnabled: isWebDAVEnabled(),
    };

    return new Response(JSON.stringify(envInfo, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          error: error.message,
          stack: error.stack,
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
