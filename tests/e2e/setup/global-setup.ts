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

    // 2. 生成测试数据
    console.log('📝 生成测试数据...');
    try {
      await execAsync('bun run test-data:generate');
      console.log('✅ 测试数据生成完成');
    } catch (error) {
      console.error('❌ 生成测试数据失败:', error.message);
      throw new Error(`测试数据生成失败: ${error.message}`);
    }

    // 3. 等待一段时间让WebDAV服务器有时间启动
    console.log('⏳ 等待WebDAV服务器启动...');
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 等待5秒

    // 4. 等待WebDAV服务器响应
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
    console.error('   4. 尝试手动运行: bun run webdav:start');
    throw error;
  }
}

/**
 * 等待WebDAV服务器启动
 */
async function waitForWebDAV() {
  const maxRetries = 60; // 增加重试次数到60次
  const retryInterval = 2000; // 增加间隔到2秒

  console.log(`⏳ 等待WebDAV服务器启动 (最多等待 ${(maxRetries * retryInterval) / 1000} 秒)...`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🔍 尝试连接WebDAV服务器 (${i + 1}/${maxRetries})...`);

      const response = await fetch('http://localhost:8080', {
        method: 'GET',
        timeout: 5000, // 5秒超时
      });

      console.log(`📡 WebDAV响应状态: ${response.status}`);

      if (response.status === 200 || response.status === 401 || response.status === 404 || response.status === 500) {
        console.log('✅ WebDAV服务器已启动并响应');
        return;
      } else {
        console.log(`⚠️  WebDAV服务器响应状态异常: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ 连接WebDAV服务器失败: ${error.message}`);

      // 如果是连接被拒绝，可能服务器还没启动
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.log('🔄 服务器可能还在启动中，继续等待...');
      }
    }

    if (i < maxRetries - 1) {
      console.log(`⏱️  等待 ${retryInterval / 1000} 秒后重试...`);
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }
  }

  console.error('❌ WebDAV服务器启动超时，请检查:');
  console.error('   1. WebDAV服务器是否正确启动');
  console.error('   2. 端口8080是否被占用');
  console.error('   3. 测试数据是否正确生成');
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
