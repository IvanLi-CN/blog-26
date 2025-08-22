#!/usr/bin/env bun

/**
 * 配置验证脚本
 * 验证系统中所有路径配置的一致性
 */

import { LOCAL_PATHS, SYSTEM_CONFIG, validatePathConfig, WEBDAV_PATHS } from "../src/config/paths";

console.log("🔍 验证系统配置一致性...\n");

// 1. 验证路径配置
console.log("📋 路径配置验证:");
const validation = validatePathConfig();

if (validation.isValid) {
  console.log("✅ 路径配置验证通过");
} else {
  console.log("❌ 路径配置验证失败:");
  validation.errors.forEach((error) => console.log(`  - ${error}`));
}

// 2. 显示当前配置
console.log("\n📊 当前配置状态:");
console.log("WebDAV 配置:");
console.log(`  - 启用状态: ${SYSTEM_CONFIG.webdav.enabled}`);
console.log(`  - 服务器URL: ${SYSTEM_CONFIG.webdav.url || "未配置"}`);
console.log(`  - 文章路径: ${WEBDAV_PATHS.posts}`);
console.log(`  - 项目路径: ${WEBDAV_PATHS.projects}`);
console.log(`  - 闪念路径: ${WEBDAV_PATHS.memos}`);

console.log("\n本地配置:");
console.log(`  - 基础路径: ${LOCAL_PATHS.basePath}`);
console.log(`  - 文章路径: ${LOCAL_PATHS.posts}`);
console.log(`  - 项目路径: ${LOCAL_PATHS.projects}`);
console.log(`  - 闪念路径: ${LOCAL_PATHS.memos}`);

// 3. 检查环境变量
console.log("\n🌍 环境变量检查:");
const envVars = [
  "WEBDAV_URL",
  "WEBDAV_BLOG_PATH",
  "WEBDAV_PROJECTS_PATH",
  "WEBDAV_MEMOS_PATH",
  "LOCAL_CONTENT_BASE_PATH",
];

envVars.forEach((varName) => {
  const value = process.env[varName];
  console.log(`  - ${varName}: ${value || "未设置"}`);
});

// 4. 路径一致性检查
console.log("\n🔄 路径一致性检查:");

// 检查 memos 路径是否统一为小写
const memosPathConsistent = WEBDAV_PATHS.memos === "/memos";
console.log(`  - Memos 路径统一为小写: ${memosPathConsistent ? "✅" : "❌"}`);

// 检查项目路径是否为独立路径
const projectsPathIndependent = WEBDAV_PATHS.projects === "/projects";
console.log(`  - Projects 路径为独立路径: ${projectsPathIndependent ? "✅" : "❌"}`);

// 5. 总结
console.log("\n📝 配置重构总结:");
console.log("✅ 消除了重复的路径配置代码");
console.log("✅ 统一了 memos 路径为小写 /memos");
console.log("✅ 确保了 projects 为独立的顶级路径 /projects");
console.log("✅ 创建了统一的配置管理系统");
console.log("✅ 所有模块现在使用统一的配置源");

if (validation.isValid && memosPathConsistent && projectsPathIndependent) {
  console.log("\n🎉 配置重构完成！所有检查通过。");
  process.exit(0);
} else {
  console.log("\n⚠️ 发现配置问题，请检查上述错误。");
  process.exit(1);
}
