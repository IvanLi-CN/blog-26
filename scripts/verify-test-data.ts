#!/usr/bin/env bun

/**
 * 验证测试数据脚本
 * 检查生成的测试数据是否符合预期格式
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const TEST_DATA_DIR = "test-data";

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

  if (typeof frontmatter.draft !== "boolean") {
    errors.push(`${filePath}: draft 字段应为布尔值`);
  }

  if (typeof frontmatter.public !== "boolean") {
    errors.push(`${filePath}: public 字段应为布尔值`);
  }

  return errors;
}

function validateMemoFrontmatter(frontmatter: any, filePath: string): string[] {
  const errors: string[] = [];

  if (!frontmatter.created_at) {
    errors.push(`${filePath}: 缺少 created_at 字段`);
  }

  if (typeof frontmatter.public !== "boolean") {
    errors.push(`${filePath}: public 字段应为布尔值`);
  }

  return errors;
}

// 验证文件内容
function validateFile(filePath: string, type: "post" | "project" | "memo"): string[] {
  const errors: string[] = [];

  try {
    const content = readFileSync(filePath, "utf-8");
    const { data: frontmatter, content: body } = matter(content);

    if (!body.trim()) {
      errors.push(`${filePath}: 文件内容为空`);
    }

    if (type === "memo") {
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
function validateDirectory(
  dirPath: string,
  type: "post" | "project" | "memo"
): { errors: string[]; count: number } {
  const errors: string[] = [];

  if (!existsSync(dirPath)) {
    errors.push(`目录不存在: ${dirPath}`);
    return { errors, count: 0 };
  }

  const files = readdirSync(dirPath).filter((file) => file.endsWith(".md"));

  // 验证每个文件
  for (const file of files) {
    const filePath = join(dirPath, file);
    errors.push(...validateFile(filePath, type));
  }

  return { errors, count: files.length };
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

  console.log("🔍 开始验证测试数据...\n");

  // 检查基础目录结构
  const webdavDir = join(TEST_DATA_DIR, "webdav");
  const localDir = join(TEST_DATA_DIR, "local");

  if (!existsSync(webdavDir)) {
    result.errors.push("WebDAV 测试数据目录不存在");
  }

  if (!existsSync(localDir)) {
    result.errors.push("本地测试数据目录不存在");
  }

  if (result.errors.length > 0) {
    result.success = false;
    return result;
  }

  // 验证 WebDAV 数据
  console.log("📁 验证 WebDAV 数据...");

  // 验证闪念
  const memosDir = join(webdavDir, "Memos");
  const memosValidation = validateDirectory(memosDir, "memo");
  result.errors.push(...memosValidation.errors);
  result.stats.webdavMemos = memosValidation.count;
  console.log(`   📝 闪念文件: ${memosValidation.count} 个`);

  // 验证本地数据
  console.log("📁 验证本地数据...");
  const localValidation = validateDirectory(localDir, "post");
  result.errors.push(...localValidation.errors);
  result.stats.localPosts = localValidation.count;
  console.log(`   📄 博客文章: ${localValidation.count} 个`);

  // 检查是否有错误
  if (result.errors.length > 0) {
    result.success = false;
  }

  return result;
}

// 主函数
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
测试数据验证脚本

用法:
  bun run scripts/verify-test-data.ts [选项]

选项:
  --help, -h                显示帮助信息

功能:
  - 验证测试数据目录结构
  - 检查 Markdown 文件格式
  - 验证 frontmatter 字段
  - 统计文件数量
`);
    return;
  }

  try {
    const result = validateTestData();

    console.log("\n📊 验证结果:");
    console.log(`   WebDAV 闪念: ${result.stats.webdavMemos} 个`);
    console.log(`   本地文章: ${result.stats.localPosts} 个`);

    if (result.warnings.length > 0) {
      console.log("\n⚠️  警告:");
      result.warnings.forEach((warning) => {
        console.log(`   ${warning}`);
      });
    }

    if (result.errors.length > 0) {
      console.log("\n❌ 错误:");
      result.errors.forEach((error) => {
        console.log(`   ${error}`);
      });
      console.log("\n💡 请运行测试数据生成脚本修复这些问题");
      process.exit(1);
    } else {
      console.log("\n✅ 所有测试数据验证通过！");
    }
  } catch (error) {
    console.error("❌ 验证失败:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
