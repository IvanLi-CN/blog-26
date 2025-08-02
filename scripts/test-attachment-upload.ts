#!/usr/bin/env bun

/**
 * 测试附件上传功能
 * 用于调试 e2e 测试中的附件上传问题
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
import { join } from 'path';
import { getWebDAVClient, isWebDAVEnabled } from '../src/lib/webdav';

async function testAttachmentUpload() {
  console.log('🧪 开始测试附件上传功能...');

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

    // 4. 创建测试图片文件
    console.log('4. 创建测试图片文件...');
    const testImagePath = join(process.cwd(), 'test-data', 'test-image.png');
    let testImageBuffer: ArrayBuffer;

    try {
      const fileBuffer = readFileSync(testImagePath);
      testImageBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      console.log(`   ✅ 测试图片读取成功，大小: ${testImageBuffer.byteLength} 字节`);
    } catch (error) {
      console.error(`   ❌ 读取测试图片失败: ${error.message}`);

      // 创建一个简单的测试图片（1x1 PNG）
      const simplePng = new Uint8Array([
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
      testImageBuffer = simplePng.buffer;
      console.log(`   ✅ 使用简单测试图片，大小: ${testImageBuffer.byteLength} 字节`);
    }

    // 5. 测试上传附件
    console.log('5. 测试上传附件...');
    const tempMemoId = `temp_${Date.now()}.md`;
    const filename = 'test-image.png';
    const contentType = 'image/png';

    try {
      const attachmentPath = await client.uploadMemoAttachment(
        tempMemoId,
        filename,
        testImageBuffer,
        contentType,
        true // 临时文件
      );
      console.log('   ✅ 附件上传成功:');
      console.log(`      路径: ${attachmentPath}`);
      console.log(`      文件名: ${filename}`);
      console.log(`      类型: ${contentType}`);
      console.log(`      大小: ${testImageBuffer.byteLength} 字节`);
    } catch (error) {
      console.error(`   ❌ 附件上传失败: ${error.message}`);
      console.error('   错误详情:', error);
      return;
    }

    // 6. 验证文件是否真的创建了
    console.log('6. 验证文件创建...');
    try {
      const expectedPath = `/Memos/assets/tmp/${filename}`;
      // 这里我们无法直接验证文件是否存在，但可以通过 WebDAV 服务器日志来确认
      console.log(`   预期文件路径: ${expectedPath}`);
      console.log('   ✅ 请检查 WebDAV 服务器日志确认文件是否被创建');
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
测试附件上传功能

用法:
  bun run scripts/test-attachment-upload.ts    运行测试

注意:
  请确保 WebDAV 服务器正在运行 (bun run webdav:start)
`);
    return;
  }

  await testAttachmentUpload();
}

if (import.meta.main) {
  main().catch(console.error);
}
