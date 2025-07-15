/**
 * 错误处理工具函数
 */

/**
 * 检查用户代理是否支持HTML
 * @param userAgent 用户代理字符串
 * @returns 是否支持HTML
 */
export function isHtmlAccepted(request: Request): boolean {
  // 检查Accept头是否包含text/html
  const acceptHeader = request.headers.get('accept');
  if (acceptHeader && acceptHeader.includes('text/html')) {
    return true;
  }

  // 检查用户代理是否为浏览器
  const userAgent = request.headers.get('user-agent');
  if (!userAgent) return false;

  // 常见浏览器标识
  const browserIdentifiers = ['Mozilla', 'Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'MSIE', 'Trident'];

  return browserIdentifiers.some((identifier) => userAgent.includes(identifier));
}

/**
 * 创建404响应
 * @param request 请求对象
 * @param message 自定义错误消息
 * @returns 根据用户代理返回适当的404响应
 */
export function create404Response(request: Request, message = 'Not Found'): Response {
  const supportsHtml = isHtmlAccepted(request);

  // 如果用户代理支持HTML，返回HTML格式的404页面内容
  if (supportsHtml) {
    const html404Content = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Page Not Found</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { font-size: 72px; color: #333; margin: 0; }
        p { font-size: 18px; color: #666; margin: 20px 0; }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>404</h1>
    <p>Sorry, we couldn't find this page.</p>
    <p><a href="/">Back to homepage</a></p>
</body>
</html>`;

    return new Response(html404Content, {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  // 检查是否可能是API请求
  const acceptHeader = request.headers.get('accept');
  const isJsonPreferred =
    acceptHeader && (acceptHeader.includes('application/json') || !acceptHeader.includes('text/'));

  // 如果是API请求，返回JSON格式的404
  if (isJsonPreferred) {
    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message,
        status: 404,
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // 默认返回纯文本404
  return new Response(`404 - ${message}`, {
    status: 404,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
