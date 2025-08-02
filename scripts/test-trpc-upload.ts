#!/usr/bin/env bun

/**
 * 测试 tRPC uploadAttachment 端点
 * 用于调试附件上传的 500 错误
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.WEBDAV_URL = 'http://localhost:8080';
process.env.WEBDAV_USERNAME = '';
process.env.WEBDAV_PASSWORD = '';
process.env.WEBDAV_MEMOS_PATH = '/Memos';
process.env.WEBDAV_ASSETS_PATH = '/assets';
process.env.DB_PATH = './test-results/test.db';
process.env.OPENAI_API_KEY = 'test-key';
process.env.SITE_URL = 'http://localhost:4321';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32-chars';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_FROM_EMAIL = 'test@example.com';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.PUBLIC_LUOSIMAO_SITE_KEY = 'test-site-key';
process.env.LUOSIMAO_SECRET_KEY = 'test-secret-key';

import { readFileSync } from 'fs';
import { createTRPCMsw } from 'msw-trpc';
import { join } from 'path';
import { memosRouter } from '../src/server/routers/memos';

async function testTRPCUpload() {
  console.log('🧪 开始测试 tRPC uploadAttachment 端点...');

  try {
    // 1. 创建测试图片文件
    console.log('1. 创建测试图片文件...');
    const testImagePath = join(process.cwd(), 'tests/e2e/test-data/images/test-image.png');
    let testImageBuffer: Buffer;

    try {
      testImageBuffer = readFileSync(testImagePath);
      console.log(`   ✅ 测试图片读取成功，大小: ${testImageBuffer.length} 字节`);
    } catch (error) {
      console.error(`   ❌ 读取测试图片失败: ${error.message}`);

      // 创建一个简单的测试图片（1x1 PNG）
      const simplePng = Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a, // PNG signature
        0x00,
        0x00,
        0x00,
        0x0d,
        0x49,
        0x48,
        0x44,
        0x52, // IHDR chunk
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00,
        0x01, // 1x1 pixels
        0x08,
        0x02,
        0x00,
        0x00,
        0x00,
        0x90,
        0x77,
        0x53, // bit depth, color type, etc.
        0xde,
        0x00,
        0x00,
        0x00,
        0x0c,
        0x49,
        0x44,
        0x41, // IDAT chunk
        0x54,
        0x08,
        0xd7,
        0x63,
        0xf8,
        0x00,
        0x00,
        0x00, // image data
        0x00,
        0x01,
        0x00,
        0x01,
        0x5c,
        0xc2,
        0xd5,
        0x7a, // checksum
        0x00,
        0x00,
        0x00,
        0x00,
        0x49,
        0x45,
        0x4e,
        0x44, // IEND chunk
        0xae,
        0x42,
        0x60,
        0x82,
      ]);
      testImageBuffer = simplePng;
      console.log(`   ✅ 使用简单测试图片，大小: ${testImageBuffer.length} 字节`);
    }

    // 2. 转换为 Base64
    console.log('2. 转换为 Base64...');
    const base64Content = testImageBuffer.toString('base64');
    console.log(`   ✅ Base64 转换完成，长度: ${base64Content.length} 字符`);

    // 3. 准备测试数据
    console.log('3. 准备测试数据...');
    const tempMemoId = `temp_${Date.now()}.md`;
    const filename = 'test-image.png';
    const contentType = 'image/png';

    const input = {
      memoId: tempMemoId,
      filename,
      content: base64Content,
      contentType,
      isTemporary: true,
    };

    console.log(`   Memo ID: ${tempMemoId}`);
    console.log(`   文件名: ${filename}`);
    console.log(`   类型: ${contentType}`);
    console.log(`   临时文件: ${input.isTemporary}`);

    // 4. 直接调用 tRPC 路由器
    console.log('4. 调用 tRPC uploadAttachment...');

    // 创建模拟的上下文
    const ctx = {
      req: null,
      resHeaders: new Headers(),
      user: {
        id: 'test-admin',
        nickname: 'Test Admin',
        email: 'admin@test.com',
      },
      isAdmin: true, // 管理员权限
      clientAddress: 'test',
    };

    try {
      const result = await memosRouter.createCaller(ctx).uploadAttachment(input);

      console.log('   ✅ 附件上传成功:');
      console.log(`      路径: ${result.path}`);
      console.log(`      文件名: ${result.filename}`);
      console.log(`      类型: ${result.contentType}`);
      console.log(`      大小: ${result.size} 字节`);
      console.log(`      是图片: ${result.isImage}`);
    } catch (error) {
      console.error(`   ❌ 附件上传失败: ${error.message}`);
      console.error('   错误详情:', error);

      // 检查错误类型
      if (error.code) {
        console.error(`   错误代码: ${error.code}`);
      }
      if (error.cause) {
        console.error(`   错误原因: ${error.cause}`);
      }
      return;
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
测试 tRPC uploadAttachment 端点

用法:
  bun run scripts/test-trpc-upload.ts    运行测试

注意:
  请确保 WebDAV 服务器正在运行 (bun run webdav:start)
`);
    return;
  }

  await testTRPCUpload();
}

if (import.meta.main) {
  main().catch(console.error);
}
