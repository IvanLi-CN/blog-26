import { type Browser, type BrowserContext } from '@playwright/test';

/**
 * 创建非管理员浏览器上下文
 * 专门用于权限测试，确保没有管理员权限
 */
export async function createNonAdminContext(browser: Browser): Promise<BrowserContext> {
  // 创建一个完全干净的浏览器上下文
  const context = await browser.newContext({
    // 不使用任何存储状态
    storageState: undefined,

    // 设置 HTTP 头来确保非管理员状态
    extraHTTPHeaders: {
      // 清除管理员邮箱头，设置为非管理员邮箱
      'Remote-Email': 'non-admin@test.com',
      // 添加标识表明这是权限测试
      'X-Test-Mode': 'non-admin',
      // 明确标识这不是管理员
      'X-Admin-Override': 'false',
    },

    // 清除所有可能的认证信息
    httpCredentials: undefined,
  });

  // 在所有页面加载前执行脚本，确保非管理员环境
  await context.addInitScript(() => {
    // 清除可能的管理员标识
    if (typeof window !== 'undefined') {
      // 清除 localStorage 中的管理员信息
      localStorage.removeItem('admin');
      localStorage.removeItem('isAdmin');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('token');

      // 清除 sessionStorage 中的管理员信息
      sessionStorage.removeItem('admin');
      sessionStorage.removeItem('isAdmin');
      sessionStorage.removeItem('adminToken');
      sessionStorage.removeItem('token');

      // 模拟非管理员环境变量
      (window as any).__TEST_NON_ADMIN__ = true;
    }
  });

  return context;
}

/**
 * 清除浏览器上下文中的所有认证状态
 */
export async function clearAuthState(context: BrowserContext): Promise<void> {
  // 获取所有页面
  const pages = context.pages();

  for (const page of pages) {
    try {
      // 清除所有存储（安全地处理可能的权限错误）
      await page.evaluate(() => {
        try {
          // 清除 localStorage
          if (typeof localStorage !== 'undefined') {
            localStorage.clear();
          }
        } catch {
          // 忽略 localStorage 访问错误
        }

        try {
          // 清除 sessionStorage
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
          }
        } catch {
          // 忽略 sessionStorage 访问错误
        }

        try {
          // 清除所有 cookies
          if (typeof document !== 'undefined') {
            document.cookie.split(';').forEach(function (c) {
              document.cookie = c
                .replace(/^ +/, '')
                .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
            });
          }
        } catch {
          // 忽略 cookie 访问错误
        }
      });
    } catch (error) {
      // 忽略清除错误，继续处理其他页面
      console.warn('清除认证状态时出错:', error);
    }
  }

  // 清除上下文级别的 cookies
  try {
    await context.clearCookies();
  } catch (error) {
    console.warn('清除上下文 cookies 时出错:', error);
  }
}
