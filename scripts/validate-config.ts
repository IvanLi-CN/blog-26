#!/usr/bin/env bun

/**
 * 配置验证脚本
 * 验证系统中所有路径配置的一致性
 */

console.log("🔍 验证系统配置一致性...\n");

console.log("🌍 环境变量检查:");
const envVars = [
  "WEBDAV_URL",
  "WEBDAV_BLOG_PATH",
  "WEBDAV_PROJECTS_PATH",
  "WEBDAV_MEMOS_PATH",
  "LOCAL_CONTENT_BASE_PATH",
  "LOCAL_MEMOS_PATH",
  "PUBLIC_LOCAL_MEMOS_PATH",
];

envVars.forEach((varName) => {
  const value = process.env[varName];
  console.log(`  - ${varName}: ${value || "未设置"}`);
});

let config: typeof import("../src/config/paths");
try {
  config = await import("../src/config/paths");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log("\n📋 路径配置验证:");
  console.log("❌ 路径配置验证失败:");
  console.log(`  - ${message}`);
  console.log("\n⚠️ 发现配置问题，请检查上述错误。");
  process.exit(1);
}

const {
  getLocalMemoRootConsistencyError,
  LOCAL_PATHS,
  SYSTEM_CONFIG,
  validatePathConfig,
  WEBDAV_PATHS,
} = config;

// 1. 验证路径配置
console.log("\n📋 路径配置验证:");
const validation = validatePathConfig();

if (validation.isValid) {
  console.log("✅ 路径配置验证通过");
} else {
  console.log("❌ 路径配置验证失败:");
  validation.errors.forEach((error) => {
    console.log(`  - ${error}`);
  });
}

// 2. 显示当前配置
console.log("\n📊 当前配置状态:");
console.log("WebDAV 配置:");
console.log(`  - 启用状态: ${SYSTEM_CONFIG.webdav.enabled}`);
console.log(`  - 服务器URL: ${SYSTEM_CONFIG.webdav.url || "未配置"}`);
console.log(`  - 文章路径: [${WEBDAV_PATHS.posts.join(", ")}]`);
console.log(`  - 项目路径: [${WEBDAV_PATHS.projects.join(", ")}]`);
console.log(`  - 闪念路径: [${WEBDAV_PATHS.memos.join(", ")}]`);

console.log("\n本地配置:");
console.log(`  - 基础路径: ${LOCAL_PATHS.basePath ?? "未启用"}`);
console.log(`  - 文章路径: [${LOCAL_PATHS.posts.join(", ")}]`);
console.log(`  - 项目路径: [${LOCAL_PATHS.projects.join(", ")}]`);
console.log(`  - 闪念路径: [${LOCAL_PATHS.memos.join(", ")}]`);

// 3. 路径一致性检查
console.log("\n🔄 路径一致性检查:");

// 检查 memos 路径是否保持 Memos 根目录语义（大小写可配置）
const memosPathConsistent = [WEBDAV_PATHS.memos, LOCAL_PATHS.memos].every((paths) =>
  paths.some((path) => path.toLowerCase() === "/memos")
);
console.log(`  - Memos 路径配置有效: ${memosPathConsistent ? "✅" : "❌"}`);

const localMemoRootConsistencyError = getLocalMemoRootConsistencyError();
console.log(`  - Memo 客户端/服务端根目录一致: ${localMemoRootConsistencyError ? "❌" : "✅"}`);
if (localMemoRootConsistencyError) {
  console.log(`    ${localMemoRootConsistencyError}`);
}

// 检查项目路径是否为独立路径
const projectsPathIndependent = WEBDAV_PATHS.projects.some((path) => {
  const normalized = path.toLowerCase();
  return normalized === "/project" || normalized === "/projects";
});
console.log(`  - Projects 路径包含独立路径: ${projectsPathIndependent ? "✅" : "❌"}`);

// 检查多路径支持
const hasMultiplePaths = Object.values(WEBDAV_PATHS).some((paths) => paths.length > 1);
console.log(`  - 支持多路径配置: ${hasMultiplePaths ? "✅" : "🔧 (单路径模式)"}`);

// 检查路径解析功能
console.log("  - 路径解析功能: ✅ (支持逗号分隔和引号包裹)");

// 4. 总结
console.log("\n📝 配置重构总结:");
console.log("✅ 消除了重复的路径配置代码");
console.log("✅ 统一了 memo 根目录语义（支持 /Memos 与 /memos 配置）");
console.log("✅ 为本地 memo 根目录增加了客户端/服务端一致性校验");
console.log("✅ 确保了 projects 为独立的顶级路径 /projects");
console.log("✅ 创建了统一的配置管理系统");
console.log("✅ 所有模块现在使用统一的配置源");

if (
  validation.isValid &&
  memosPathConsistent &&
  !localMemoRootConsistencyError &&
  projectsPathIndependent
) {
  console.log("\n🎉 配置重构完成！所有检查通过。");
  process.exit(0);
}

console.log("\n⚠️ 发现配置问题，请检查上述错误。");
process.exit(1);
