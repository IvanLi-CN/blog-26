import { exec } from 'child_process';
import { promisify } from 'util';

const _execAsync = promisify(exec);

/**
 * 测试隔离工具
 * 确保每个测试都有独立的数据环境
 */
export class TestIsolation {
  private testId: string;

  constructor(testId?: string) {
    this.testId = testId || `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * 测试开始前的清理
   */
  async beforeTest(): Promise<void> {
    console.log(`🧹 [${this.testId}] 开始测试前清理...`);

    try {
      // 1. 确保基础目录结构存在
      await this.ensureDirectoryStructure();

      // 2. 清理 WebDAV 数据
      await this.cleanWebDAVData();

      // 3. 清理浏览器存储
      // 这将在浏览器上下文创建时处理

      // 4. 等待一小段时间确保清理完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log(`✅ [${this.testId}] 测试前清理完成`);
    } catch (error) {
      console.warn(`⚠️ [${this.testId}] 测试前清理失败:`, error);
    }
  }

  /**
   * 测试结束后的清理
   */
  async afterTest(): Promise<void> {
    console.log(`🧹 [${this.testId}] 开始测试后清理...`);

    try {
      // 1. 清理 WebDAV 数据
      await this.cleanWebDAVData();

      // 2. 清理临时文件
      await this.cleanTempFiles();

      // 3. 等待一小段时间确保清理完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log(`✅ [${this.testId}] 测试后清理完成`);
    } catch (error) {
      console.warn(`⚠️ [${this.testId}] 测试后清理失败:`, error);
    }
  }

  /**
   * 确保基础目录结构存在
   */
  private async ensureDirectoryStructure(): Promise<void> {
    const fs = await import('fs/promises');

    try {
      // 确保基础目录存在
      await fs.mkdir('test-data/webdav/Memos', { recursive: true });
      await fs.mkdir('test-data/webdav/assets', { recursive: true });
      await fs.mkdir('test-data/webdav/assets/tmp', { recursive: true });

      // 确保基础的示例文件存在（WebDAV 服务器需要）
      const memosPath = 'test-data/webdav/Memos';
      const files = await fs.readdir(memosPath).catch(() => []);

      // 如果 Memos 目录为空，创建一个示例文件
      if (files.length === 0) {
        const sampleContent = `---
title: "示例闪念"
date: ${new Date().toISOString()}
public: true
tags: []
attachments: []
---

这是一个示例闪念，用于确保 WebDAV 服务器正常工作。
`;
        await fs.writeFile(`${memosPath}/sample.md`, sampleContent);
      }
    } catch (error) {
      console.debug(`目录创建错误:`, error);
    }
  }

  /**
   * 清理 WebDAV 数据
   */
  private async cleanWebDAVData(): Promise<void> {
    const fs = await import('fs/promises');

    try {
      // 只清理测试生成的文件，保留目录结构
      const memosPath = 'test-data/webdav/Memos';

      // 确保目录存在
      await fs.mkdir(memosPath, { recursive: true }).catch(() => {});

      const files = await fs.readdir(memosPath).catch(() => []);

      for (const file of files) {
        // 只删除测试生成的文件（包含时间戳或特定标识）
        if (
          file.endsWith('.md') &&
          (file.includes('test') || file.includes('Test') || file.includes('测试') || /\d{13}/.test(file)) // 包含时间戳
        ) {
          await fs.unlink(`${memosPath}/${file}`).catch(() => {});
        }
      }

      // 清理 assets 临时目录，但保留主目录
      const assetsPath = 'test-data/webdav/assets';
      await fs.mkdir(assetsPath, { recursive: true }).catch(() => {});
      await fs.rmdir(`${assetsPath}/tmp`, { recursive: true }).catch(() => {});

      // 清理测试上传的文件
      const assetFiles = await fs.readdir(assetsPath).catch(() => []);
      for (const file of assetFiles) {
        if (file.startsWith('test-') || file.includes('test') || /\d{13}/.test(file)) {
          await fs.unlink(`${assetsPath}/${file}`).catch(() => {});
        }
      }
    } catch (error) {
      // 忽略清理错误，但记录日志
      console.debug(`WebDAV 清理错误:`, error);
    }
  }

  /**
   * 清理临时文件
   */
  private async cleanTempFiles(): Promise<void> {
    const fs = await import('fs/promises');

    try {
      // 清理测试生成的图片文件
      const tempFiles = ['test-image.png', 'test-image.jpg', 'test-image.gif', 'test-large-image.png'];

      for (const file of tempFiles) {
        await fs.unlink(file).catch(() => {});
      }
    } catch (error) {
      console.debug(`临时文件清理错误:`, error);
    }
  }

  /**
   * 获取测试 ID
   */
  getTestId(): string {
    return this.testId;
  }
}

/**
 * 创建隔离的浏览器上下文
 */
export async function createIsolatedContext(browser: any): Promise<any> {
  const context = await browser.newContext({
    // 清除所有存储
    storageState: undefined,

    // 禁用缓存
    ignoreHTTPSErrors: true,

    // 每个测试使用独立的用户数据
    userAgent: `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  });

  // 清除所有存储
  await context.clearCookies();

  return context;
}

/**
 * 等待异步操作完成
 */
export async function waitForAsyncOperations(page: any, timeout = 3000): Promise<void> {
  // 等待网络请求完成
  await page.waitForLoadState('networkidle', { timeout });

  // 等待额外的时间确保所有异步操作完成
  await new Promise((resolve) => setTimeout(resolve, 500));
}
