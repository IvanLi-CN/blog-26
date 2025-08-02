#!/usr/bin/env bun

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

/**
 * 生成测试图片文件
 * 使用 Sharp 库生成真正有效的图片文件
 */

/**
 * 创建一个有效的 PNG 图片 (10x10 像素红色)
 */
async function createPNGData(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }, // 红色
    },
  })
    .png()
    .toBuffer();
}

/**
 * 创建一个有效的 JPEG 图片 (10x10 像素红色)
 */
async function createJPEGData(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }, // 红色
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * 创建一个有效的 GIF 图片 (10x10 像素红色)
 * 使用最小有效的 GIF 格式
 */
async function createGIFData(): Promise<Buffer> {
  // 最小有效的 1x1 红色 GIF
  return Buffer.from([
    // GIF Header
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61, // "GIF89a"
    // Logical Screen Descriptor
    0x01,
    0x00,
    0x01,
    0x00, // width=1, height=1
    0x80,
    0x00,
    0x00, // global color table flag, color resolution, sort flag
    // Global Color Table (2 colors)
    0xff,
    0x00,
    0x00, // color 0: red
    0x00,
    0x00,
    0x00, // color 1: black
    // Image Descriptor
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    // Image Data
    0x02,
    0x02,
    0x04,
    0x01,
    0x00,
    // Trailer
    0x3b,
  ]);
}

async function generateTestImages() {
  console.log('🖼️ 生成测试图片...');

  const imagesDir = path.resolve('tests/e2e/test-data/images');

  try {
    // 确保目录存在
    await mkdir(imagesDir, { recursive: true });

    // 生成PNG图片
    const pngData = await createPNGData();
    await writeFile(path.join(imagesDir, 'test-image.png'), pngData);
    console.log('✅ 生成 test-image.png');

    // 生成JPG图片
    const jpegData = await createJPEGData();
    await writeFile(path.join(imagesDir, 'test-image.jpg'), jpegData);
    console.log('✅ 生成 test-image.jpg');

    // 生成GIF图片
    const gifData = await createGIFData();
    await writeFile(path.join(imagesDir, 'test-image.gif'), gifData);
    console.log('✅ 生成 test-image.gif');

    // 生成多个测试图片用于批量上传测试
    await writeFile(path.join(imagesDir, 'test-image-1.png'), pngData);
    await writeFile(path.join(imagesDir, 'test-image-2.png'), pngData);
    await writeFile(path.join(imagesDir, 'test-image-3.png'), pngData);
    console.log('✅ 生成批量测试图片');

    console.log('🎉 测试图片生成完成');
  } catch (error) {
    console.error('❌ 生成测试图片失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (import.meta.main) {
  generateTestImages().catch(console.error);
}

export { generateTestImages };
