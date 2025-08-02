import { chromium, type FullConfig } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 全局测试设置
 * 在所有测试运行前执行一次
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 开始E2E测试全局设置...');

  try {
    // 1. 清理之前的测试数据
    console.log('🧹 清理测试数据...');
    try {
      await execAsync('bun run test-data:clean');
      console.log('✅ 测试数据清理完成');
    } catch (error) {
      console.log('⚠️  清理测试数据失败（可能是首次运行）:', error.message);
    }

    // 2. 设置测试数据库
    console.log('🗄️ 设置测试数据库...');
    try {
      // 设置测试环境变量
      process.env.DB_PATH = './test-results/test.db';
      process.env.NODE_ENV = 'test';

      // 运行数据库迁移
      await execAsync('bun run migrate');
      console.log('✅ 数据库迁移完成');
    } catch (error) {
      console.error('❌ 数据库设置失败:', error.message);
      throw new Error(`数据库设置失败: ${error.message}`);
    }

    // 3. 生成测试数据
    console.log('📝 生成测试数据...');
    try {
      await execAsync('bun run test-data:generate');
      console.log('✅ 测试数据生成完成');
    } catch (error) {
      console.error('❌ 生成测试数据失败:', error.message);
      throw new Error(`测试数据生成失败: ${error.message}`);
    }

    // 4. 等待WebDAV服务器响应
    // 注意：WebDAV服务器由Playwright的webServer配置启动
    // 我们只需要等待它响应即可
    await waitForWebDAV();

    // 5. 设置管理员认证
    console.log('🔐 设置管理员认证...');
    try {
      await setupAdminAuth();
      console.log('✅ 管理员认证设置完成');
    } catch (error) {
      console.error('❌ 设置管理员认证失败:', error.message);
      throw new Error(`管理员认证设置失败: ${error.message}`);
    }

    console.log('✅ 全局设置完成');
  } catch (error) {
    console.error('❌ 全局设置失败:', error);
    console.error('💡 调试提示:');
    console.error('   1. 检查WebDAV服务器是否正常启动');
    console.error('   2. 检查测试数据是否正确生成');
    console.error('   3. 检查端口8080是否被占用');
    console.error('   4. 尝试手动运行: bun run dev:test');
    throw error;
  }
}

/**
 * 等待WebDAV服务器启动
 */
async function waitForWebDAV() {
  const maxRetries = 60; // 减少重试次数但增加检查频率
  const retryInterval = 1000; // 1秒间隔
  const initialWait = 5000; // 初始等待5秒
  const ports = [8080, 8081, 8082, 8083, 8084]; // 检查多个可能的端口

  console.log(`⏳ 等待WebDAV服务器启动 (最多等待 ${(maxRetries * retryInterval + initialWait) / 1000} 秒)...`);

  // 初始等待，给WebDAV服务器启动时间
  console.log(`⏱️  初始等待 ${initialWait / 1000} 秒，让服务器有时间启动...`);
  await new Promise((resolve) => setTimeout(resolve, initialWait));

  for (let i = 0; i < maxRetries; i++) {
    console.log(`🔍 尝试连接WebDAV服务器 (${i + 1}/${maxRetries})...`);

    // 尝试多个端口
    for (const port of ports) {
      try {
        const response = await fetch(`http://localhost:${port}`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000), // 3秒超时
        });

        console.log(`📡 端口 ${port} WebDAV响应状态: ${response.status}`);

        if (response.status === 200 || response.status === 401 || response.status === 404 || response.status === 500) {
          console.log(`✅ WebDAV服务器已在端口 ${port} 启动并响应`);

          // 更新环境变量以使用正确的端口
          if (port !== 8080) {
            process.env.WEBDAV_URL = `http://localhost:${port}`;
            console.log(`🔄 更新 WEBDAV_URL 为: http://localhost:${port}`);
          }

          return;
        } else {
          console.log(`⚠️  端口 ${port} WebDAV服务器响应状态异常: ${response.status}`);
        }
      } catch (error) {
        // 只在最后一个端口失败时记录错误
        if (port === ports[ports.length - 1]) {
          console.log(`❌ 所有端口连接失败: ${error.message}`);

          // 如果是连接被拒绝，可能服务器还没启动
          if (
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('fetch failed') ||
            error.message.includes('timeout')
          ) {
            console.log('🔄 服务器可能还在启动中，继续等待...');
          }
        }
      }
    }

    if (i < maxRetries - 1) {
      console.log(`⏱️  等待 ${retryInterval / 1000} 秒后重试...`);
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }
  }

  console.error('❌ WebDAV服务器启动超时，请检查:');
  console.error('   1. WebDAV服务器是否正确启动');
  console.error('   2. 端口8080-8084是否被占用');
  console.error('   3. 测试数据是否正确生成');
  console.error('   4. concurrently是否正确启动了WebDAV和Astro服务器');
  throw new Error('WebDAV服务器启动超时');
}

/**
 * 设置管理员认证
 * 创建一个持久的浏览器上下文，用于管理员操作
 */
async function setupAdminAuth() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 访问首页，触发管理员模式
    await page.goto('http://localhost:4321');

    // 等待页面加载
    await page.waitForLoadState('networkidle');

    // 保存认证状态
    const storage = await context.storageState();

    // 将认证状态保存到文件
    const fs = await import('fs/promises');
    await fs.writeFile('tests/e2e/setup/admin-auth.json', JSON.stringify(storage, null, 2));

    console.log('✅ 管理员认证状态已保存');
  } catch (error) {
    console.error('❌ 设置管理员认证失败:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
