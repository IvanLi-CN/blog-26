#!/usr/bin/env bun

/**
 * 验证测试数据脚本
 * 检查生成的测试数据是否符合预期格式
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

const TEST_DATA_DIR = 'test-data';

interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    webdavPosts: number;
    webdavProjects: number;
    webdavMemos: number;
    localPosts: number;
    localProjects: number;
  };
}

// 验证 frontmatter 格式
function validatePostFrontmatter(frontmatter: any, filePath: string): string[] {
  const errors: string[] = [];

  if (!frontmatter.title) {
    errors.push(`${filePath}: 缺少 title 字段`);
  }

  if (!frontmatter.publishDate) {
    errors.push(`${filePath}: 缺少 publishDate 字段`);
  }

  if (typeof frontmatter.draft !== 'boolean') {
    errors.push(`${filePath}: draft 字段应为布尔值`);
  }

  if (typeof frontmatter.public !== 'boolean') {
    errors.push(`${filePath}: public 字段应为布尔值`);
  }

  return errors;
}

function validateMemoFrontmatter(frontmatter: any, filePath: string): string[] {
  const errors: string[] = [];

  if (!frontmatter.createdAt) {
    errors.push(`${filePath}: 缺少 createdAt 字段`);
  }

  if (!frontmatter.updatedAt) {
    errors.push(`${filePath}: 缺少 updatedAt 字段`);
  }

  if (typeof frontmatter.public !== 'boolean') {
    errors.push(`${filePath}: public 字段应为布尔值`);
  }

  return errors;
}

// 验证文件内容
function validateFile(filePath: string, type: 'post' | 'project' | 'memo'): string[] {
  const errors: string[] = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content: body } = matter(content);

    if (!body.trim()) {
      errors.push(`${filePath}: 文件内容为空`);
    }

    if (type === 'memo') {
      errors.push(...validateMemoFrontmatter(frontmatter, filePath));
    } else {
      errors.push(...validatePostFrontmatter(frontmatter, filePath));
    }
  } catch (error) {
    errors.push(`${filePath}: 文件读取失败 - ${error}`);
  }

  return errors;
}

// 验证目录结构
function validateDirectory(dirPath: string, expectedFiles: number, type: 'post' | 'project' | 'memo'): string[] {
  const errors: string[] = [];

  if (!existsSync(dirPath)) {
    errors.push(`目录不存在: ${dirPath}`);
    return errors;
  }

  const files = readdirSync(dirPath).filter((file) => file.endsWith('.md'));

  if (files.length !== expectedFiles) {
    errors.push(`${dirPath}: 期望 ${expectedFiles} 个文件，实际 ${files.length} 个`);
  }

  // 验证每个文件
  for (const file of files) {
    const filePath = join(dirPath, file);
    errors.push(...validateFile(filePath, type));
  }

  return errors;
}

// 主验证函数
function validateTestData(): ValidationResult {
  const result: ValidationResult = {
    success: true,
    errors: [],
    warnings: [],
    stats: {
      webdavPosts: 0,
      webdavProjects: 0,
      webdavMemos: 0,
      localPosts: 0,
      localProjects: 0,
    },
  };

  console.log('🔍 开始验证测试数据...\n');

  // 检查基础目录结构
  const webdavDir = join(TEST_DATA_DIR, 'webdav');
  const localDir = join(TEST_DATA_DIR, 'local');

  if (!existsSync(webdavDir)) {
    result.errors.push('WebDAV 测试数据目录不存在');
  }

  if (!existsSync(localDir)) {
    result.errors.push('本地测试数据目录不存在');
  }

  if (result.errors.length > 0) {
    result.success = false;
    return result;
  }

  // 验证 WebDAV 数据
  console.log('📁 验证 WebDAV 数据...');

  // WebDAV 文章
  const webdavPostsErrors = validateDirectory(webdavDir, 5, 'post');
  result.errors.push(...webdavPostsErrors);
  result.stats.webdavPosts = readdirSync(webdavDir).filter((f) => f.endsWith('.md')).length;

  // WebDAV 项目
  const webdavProjectsDir = join(webdavDir, 'projects');
  const webdavProjectsErrors = validateDirectory(webdavProjectsDir, 5, 'project');
  result.errors.push(...webdavProjectsErrors);
  if (existsSync(webdavProjectsDir)) {
    result.stats.webdavProjects = readdirSync(webdavProjectsDir).filter((f) => f.endsWith('.md')).length;
  }

  // WebDAV 备忘录
  const webdavMemosDir = join(webdavDir, 'Memos');
  const webdavMemosErrors = validateDirectory(webdavMemosDir, 5, 'memo');
  result.errors.push(...webdavMemosErrors);
  if (existsSync(webdavMemosDir)) {
    result.stats.webdavMemos = readdirSync(webdavMemosDir).filter((f) => f.endsWith('.md')).length;
  }

  // 验证本地数据
  console.log('📁 验证本地数据...');

  // 本地文章
  const localPostsErrors = validateDirectory(localDir, 5, 'post');
  result.errors.push(...localPostsErrors);
  result.stats.localPosts = readdirSync(localDir).filter((f) => f.endsWith('.md')).length;

  // 本地项目
  const localProjectsDir = join(localDir, 'projects');
  const localProjectsErrors = validateDirectory(localProjectsDir, 5, 'project');
  result.errors.push(...localProjectsErrors);
  if (existsSync(localProjectsDir)) {
    result.stats.localProjects = readdirSync(localProjectsDir).filter((f) => f.endsWith('.md')).length;
  }

  // 检查备忘录文件命名格式
  if (existsSync(webdavMemosDir)) {
    const memoFiles = readdirSync(webdavMemosDir).filter((f) => f.endsWith('.md'));
    for (const file of memoFiles) {
      if (!/^\d{8}_memo_\d{2}\.md$/.test(file)) {
        result.warnings.push(`备忘录文件命名格式不符合规范: ${file}`);
      }
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

// 显示验证结果
function displayResults(result: ValidationResult) {
  console.log('\n📊 验证统计:');
  console.log(`  WebDAV 文章: ${result.stats.webdavPosts} 篇`);
  console.log(`  WebDAV 项目: ${result.stats.webdavProjects} 篇`);
  console.log(`  WebDAV 备忘录: ${result.stats.webdavMemos} 篇`);
  console.log(`  本地文章: ${result.stats.localPosts} 篇`);
  console.log(`  本地项目: ${result.stats.localProjects} 篇`);

  if (result.warnings.length > 0) {
    console.log('\n⚠️  警告:');
    result.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  if (result.errors.length > 0) {
    console.log('\n❌ 错误:');
    result.errors.forEach((error) => console.log(`  - ${error}`));
  }

  if (result.success) {
    console.log('\n✅ 测试数据验证通过！');
    console.log('\n🚀 下一步:');
    console.log('  1. 运行 "bun run webdav:start" 启动 WebDAV 服务器');
    console.log('  2. 配置环境变量');
    console.log('  3. 运行 "bun run dev" 启动开发服务器');
  } else {
    console.log('\n❌ 测试数据验证失败！');
    console.log('请修复上述错误后重新生成测试数据。');
    process.exit(1);
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
测试数据验证工具

用法:
  bun run verify-test-data        验证测试数据
  bun run verify-test-data --help 显示帮助信息

功能:
  - 检查目录结构是否正确
  - 验证文件数量是否符合预期
  - 检查 frontmatter 格式是否正确
  - 验证文件内容是否完整
  - 统计生成的数据量
`);
    return;
  }

  const result = validateTestData();
  displayResults(result);
}

if (import.meta.main) {
  main();
}
