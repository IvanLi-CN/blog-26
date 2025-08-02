import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 全局测试清理
 * 在所有测试运行完成后执行一次
 */
async function globalTeardown() {
  console.log('🧹 开始E2E测试全局清理...');

  try {
    // 1. 清理测试数据
    console.log('🗑️ 清理测试数据...');
    await execAsync('bun run test-data:clean').catch(() => {
      // 忽略清理错误
    });

    // 2. 清理认证文件
    console.log('🔐 清理认证文件...');
    const fs = await import('fs/promises');
    await fs.unlink('tests/e2e/setup/admin-auth.json').catch(() => {
      // 忽略文件不存在的错误
    });

    // 3. 清理临时文件
    console.log('🗂️ 清理临时文件...');
    await fs.rm('test-data/webdav/assets/tmp', { recursive: true, force: true }).catch(() => {
      // 忽略目录不存在的错误
    });

    // 4. 清理测试数据库
    console.log('🗄️ 清理测试数据库...');
    await fs.unlink('./test-results/test.db').catch(() => {
      // 忽略文件不存在的错误
    });

    console.log('✅ 全局清理完成');
  } catch (error) {
    console.error('❌ 全局清理失败:', error);
    // 不抛出错误，避免影响测试结果
  }
}

export default globalTeardown;
