#!/usr/bin/env bun

/**
 * 测试闪念创建功能
 * 用于调试 e2e 测试中的闪念创建问题
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.WEBDAV_URL = 'http://localhost:8080';
process.env.WEBDAV_USERNAME = '';
process.env.WEBDAV_PASSWORD = '';
process.env.WEBDAV_MEMOS_PATH = '/Memos';
process.env.WEBDAV_ASSETS_PATH = '/assets';
process.env.DB_PATH = ':memory:';
process.env.OPENAI_API_KEY = 'test-key';
process.env.SITE_URL = 'http://localhost:4321';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32-chars';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_FROM_EMAIL = 'test@example.com';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.PUBLIC_LUOSIMAO_SITE_KEY = 'test-site-key';
process.env.LUOSIMAO_SECRET_KEY = 'test-secret-key';

import { getWebDAVClient, isWebDAVEnabled } from '../src/lib/webdav';

async function testMemoCreation() {
  console.log('🧪 开始测试闪念创建功能...');

  try {
    // 1. 检查 WebDAV 是否启用
    console.log('1. 检查 WebDAV 配置...');
    const enabled = isWebDAVEnabled();
    console.log(`   WebDAV 启用状态: ${enabled}`);

    if (!enabled) {
      console.error('❌ WebDAV 未启用');
      return;
    }

    // 2. 获取 WebDAV 客户端
    console.log('2. 获取 WebDAV 客户端...');
    const client = getWebDAVClient();
    console.log('   ✅ WebDAV 客户端获取成功');

    // 3. 测试连接
    console.log('3. 测试 WebDAV 连接...');
    try {
      const files = await client.getFileIndex(1);
      console.log(`   ✅ WebDAV 连接成功，获取到 ${files.length} 个文件`);
    } catch (error) {
      console.error(`   ❌ WebDAV 连接失败: ${error.message}`);
      return;
    }

    // 4. 测试创建闪念
    console.log('4. 测试创建闪念...');
    const testContent = `# 测试闪念

这是一个测试闪念，用于验证创建功能。

创建时间: ${new Date().toISOString()}

#测试 #调试`;

    try {
      const memo = await client.createMemo(testContent, true, []);
      console.log('   ✅ 闪念创建成功:');
      console.log(`      ID: ${memo.id}`);
      console.log(`      Slug: ${memo.slug}`);
      console.log(`      标题: ${memo.data.title || '无标题'}`);
      console.log(`      公开: ${memo.data.public !== false}`);
      console.log(`      标签: ${memo.tags?.join(', ') || '无'}`);
    } catch (error) {
      console.error(`   ❌ 闪念创建失败: ${error.message}`);
      console.error('   错误详情:', error);
      return;
    }

    // 5. 验证文件是否真的创建了
    console.log('5. 验证文件创建...');
    try {
      const memosIndex = await client.getMemosIndex();
      console.log(`   ✅ 获取到 ${memosIndex.length} 个闪念文件`);

      if (memosIndex.length > 0) {
        const latestMemo = memosIndex[0];
        console.log(`   最新闪念: ${latestMemo.basename}`);
      }
    } catch (error) {
      console.error(`   ❌ 验证文件创建失败: ${error.message}`);
    }

    console.log('✅ 测试完成');
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
测试闪念创建功能

用法:
  bun run scripts/test-memo-creation.ts    运行测试

注意:
  请确保 WebDAV 服务器正在运行 (bun run webdav:start)
`);
    return;
  }

  await testMemoCreation();
}

if (import.meta.main) {
  main().catch(console.error);
}
