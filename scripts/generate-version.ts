#!/usr/bin/env bun

/**
 * 生成版本信息脚本
 * 格式：YYYYMMDD-shortHash
 * 例如：20250101-abcdef01
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

interface VersionInfo {
  version: string;
  buildDate: string;
  commitHash: string;
  commitShortHash: string;
  repositoryUrl: string;
  commitUrl: string;
}

function generateVersionInfo(): VersionInfo {
  try {
    // 优先从环境变量获取信息（用于 Docker 构建）
    const envBuildDate = process.env.BUILD_DATE;
    const envCommitHash = process.env.COMMIT_HASH;
    const envCommitShortHash = process.env.COMMIT_SHORT_HASH;
    const envRepositoryUrl = process.env.REPOSITORY_URL;

    let buildDate: string;
    let commitHash: string;
    let commitShortHash: string;
    let repositoryUrl: string;

    if (envBuildDate && envCommitHash && envCommitShortHash && envRepositoryUrl) {
      // 使用环境变量中的信息（Docker 构建场景）
      buildDate = envBuildDate;
      commitHash = envCommitHash;
      commitShortHash = envCommitShortHash;
      repositoryUrl = envRepositoryUrl;
      console.log("使用环境变量中的 Git 信息");
    } else {
      // 从 Git 获取信息（本地构建场景）
      const now = new Date();
      buildDate = now.toISOString().slice(0, 10).replace(/-/g, "");
      commitHash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      commitShortHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();

      // 获取仓库 URL
      const remoteUrl = execSync("git config --get remote.origin.url", {
        encoding: "utf-8",
      }).trim();

      // 转换 SSH URL 为 HTTPS URL (如果需要)
      repositoryUrl = remoteUrl;
      if (remoteUrl.startsWith("ssh://gitea@")) {
        // ssh://gitea@git.ivanli.cc:7018/Ivan/blog-nextjs.git
        // -> https://git.ivanli.cc/Ivan/blog-nextjs
        repositoryUrl = remoteUrl
          .replace("ssh://gitea@", "https://")
          .replace(":7018", "")
          .replace(".git", "");
      } else if (remoteUrl.startsWith("git@")) {
        // git@github.com:user/repo.git -> https://github.com/user/repo
        repositoryUrl = remoteUrl.replace("git@", "https://").replace(":", "/").replace(".git", "");
      }

      console.log("从 Git 获取信息");
    }

    // 检查是否有未提交的更改（仅在本地 Git 环境中）
    let hasUncommittedChanges = false;
    if (!envBuildDate) {
      // 只有在本地构建时才检查未提交的更改
      try {
        const gitStatus = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
        hasUncommittedChanges = gitStatus.length > 0;
      } catch (_error) {
        console.warn("无法检查 git 状态，假设没有未提交的更改");
      }
    }

    // 生成版本号，如果有未提交的更改则添加 -draft 后缀
    let version = `${buildDate}-${commitShortHash}`;
    if (hasUncommittedChanges) {
      version += "-draft";
    }

    // 生成 commit URL
    const commitUrl = `${repositoryUrl}/commit/${commitHash}`;

    return {
      version,
      buildDate,
      commitHash,
      commitShortHash,
      repositoryUrl,
      commitUrl,
    };
  } catch (error) {
    console.error("Error generating version info:", error);

    // 如果无法获取 git 信息，使用默认值
    const now = new Date();
    const buildDate = now.toISOString().slice(0, 10).replace(/-/g, "");

    // 尝试检查是否有未提交的更改（即使在错误情况下）
    let fallbackVersion = `${buildDate}-unknown`;
    try {
      const gitStatus = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
      if (gitStatus.length > 0) {
        fallbackVersion += "-draft";
      }
    } catch {
      // 如果连 git status 都失败，就不添加 -draft
    }

    return {
      version: fallbackVersion,
      buildDate,
      commitHash: "unknown",
      commitShortHash: "unknown",
      repositoryUrl: "https://github.com/user/blog-nextjs",
      commitUrl: "https://github.com/user/blog-nextjs",
    };
  }
}

function main() {
  console.log("🔧 Generating version information...");

  const versionInfo = generateVersionInfo();

  console.log("📋 Version Info:");
  console.log(`  Version: ${versionInfo.version}`);
  console.log(`  Build Date: ${versionInfo.buildDate}`);
  console.log(`  Commit: ${versionInfo.commitShortHash} (${versionInfo.commitHash})`);
  console.log(`  Repository: ${versionInfo.repositoryUrl}`);
  console.log(`  Commit URL: ${versionInfo.commitUrl}`);

  // 写入版本信息文件
  const outputPath = path.join(process.cwd(), "src", "generated", "version.json");

  // 确保目录存在
  const outputDir = path.dirname(outputPath);
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch (_error) {
    // 忽略错误，可能目录已存在
  }

  writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));

  console.log(`✅ Version info written to: ${outputPath}`);
}

if (import.meta.main) {
  main();
}
