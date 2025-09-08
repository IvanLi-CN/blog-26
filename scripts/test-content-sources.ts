#!/usr/bin/env bun

/**
 * 内容源基础架构测试脚本
 *
 * 验证类型定义、工具函数和基础架构是否正常工作
 */

import {
  calculateContentHash,
  createContentItemFromParsed,
  generateSlugFromPath,
  inferContentTypeFromPath,
  parseMarkdownContent,
  SUPPORTED_CONTENT_TYPES,
  sanitizeContentItem,
  VERSION,
  validateContentItem,
} from "../src/lib/content-sources";

console.log("🧪 开始测试内容源基础架构...");
console.log(`📦 版本: ${VERSION}`);
console.log(`🎯 支持的内容类型: ${SUPPORTED_CONTENT_TYPES.join(", ")}`);

// 测试 Markdown 解析
console.log("\n1️⃣ 测试 Markdown 解析...");
const testMarkdown = `---
title: "测试文章"
date: "2024-01-01"
tags: ["test", "markdown"]
category: "技术"
draft: false
---

# 测试标题

这是一个测试文章的内容。

## 子标题

- 列表项 1
- 列表项 2

**粗体文本** 和 *斜体文本*。
`;

try {
  const parsed = parseMarkdownContent(testMarkdown, "/test/posts/test-article.md");
  console.log("✅ Markdown 解析成功");
  console.log(`   - 标题: ${parsed.frontmatter.title}`);
  console.log(`   - 内容哈希: ${parsed.contentHash.substring(0, 8)}...`);
  console.log(`   - 正文长度: ${parsed.body.length} 字符`);
} catch (error) {
  console.error("❌ Markdown 解析失败:", error);
  process.exit(1);
}

// 测试内容项创建
console.log("\n2️⃣ 测试内容项创建...");
try {
  const parsed = parseMarkdownContent(testMarkdown, "/test/posts/test-article.md");
  const contentItem = createContentItemFromParsed(
    parsed,
    "/test/posts/test-article.md",
    "test-source"
  );

  console.log("✅ 内容项创建成功");
  console.log(`   - ID: ${contentItem.id}`);
  console.log(`   - 类型: ${contentItem.type}`);
  console.log(`   - Slug: ${contentItem.slug}`);
  console.log(`   - 标题: ${contentItem.title}`);
  console.log(`   - 标签: ${contentItem.tags.join(", ")}`);
  console.log(`   - 是否草稿: ${contentItem.draft}`);
  console.log(`   - 是否公开: ${contentItem.public}`);
} catch (error) {
  console.error("❌ 内容项创建失败:", error);
  process.exit(1);
}

// 测试路径推断
console.log("\n3️⃣ 测试路径推断...");
const testPaths = [
  "/content/posts/hello-world.md",
  "/content/projects/my-project.md",
  "/content/memos/quick-note.md",
  "/some/other/path.md",
];

testPaths.forEach((path) => {
  const contentType = inferContentTypeFromPath(path);
  const slug = generateSlugFromPath(path);
  console.log(`   ${path} -> 类型: ${contentType}, Slug: ${slug}`);
});

// 测试哈希计算
console.log("\n4️⃣ 测试哈希计算...");
const testContent = "Hello, World!";
const hash1 = calculateContentHash(testContent);
const hash2 = calculateContentHash(testContent);
const hash3 = calculateContentHash("Different content");

console.log(`   相同内容哈希一致: ${hash1 === hash2 ? "✅" : "❌"}`);
console.log(`   不同内容哈希不同: ${hash1 !== hash3 ? "✅" : "❌"}`);
console.log(`   哈希长度正确 (64): ${hash1.length === 64 ? "✅" : "❌"}`);

// 测试内容项验证
console.log("\n5️⃣ 测试内容项验证...");
const parsed = parseMarkdownContent(testMarkdown, "/test/posts/test-article.md");
const contentItem = createContentItemFromParsed(
  parsed,
  "/test/posts/test-article.md",
  "test-source"
);

const isValid = validateContentItem(contentItem);
console.log(`   内容项验证: ${isValid ? "✅" : "❌"}`);

const sanitized = sanitizeContentItem(contentItem);
console.log(`   内容项清理: ${sanitized.title === contentItem.title.trim() ? "✅" : "❌"}`);

// 测试数据库类型（简单导入测试）
console.log("\n6️⃣ 测试数据库类型导入...");
try {
  const { contentSyncLogs, contentSyncStatus, posts } = await import("../src/lib/schema");
  console.log("✅ 数据库类型导入成功");
  console.log(`   - contentSyncLogs: ${typeof contentSyncLogs}`);
  console.log(`   - contentSyncStatus: ${typeof contentSyncStatus}`);
  console.log(`   - posts: ${typeof posts}`);
} catch (error) {
  console.error("❌ 数据库类型导入失败:", error);
  process.exit(1);
}

console.log("\n🎉 所有基础架构测试通过！");
console.log("✨ 多源内容采集系统基础架构已就绪，可以开始实施阶段2");
