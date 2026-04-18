#!/usr/bin/env bun

/**
 * 生成版本信息脚本
 * 格式：YYYYMMDD-shortHash
 * 例如：20250101-abcdef01
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

interface VersionInfo {
  version: string;
  buildDate: string;
  commitHash: string;
  commitShortHash: string;
  repositoryUrl: string;
  commitUrl: string;
  branchName: string;
  branchUrl: string | null;
}

const DETACHED_BRANCH_NAME = "detached";

function normalizeRepositoryUrl(remoteUrl: string): string {
  const trimmed = remoteUrl.trim();
  let normalized = trimmed;

  if (trimmed.startsWith("ssh://")) {
    try {
      const parsed = new URL(trimmed);
      normalized = `https://${parsed.hostname}${parsed.pathname}`;
    } catch {
      // 无法解析时保留原值，后续再做兜底处理
    }
  } else if (trimmed.startsWith("git@")) {
    const match = trimmed.match(/^git@([^:]+):(.+?)(\.git)?$/);
    if (match) {
      normalized = `https://${match[1]}/${match[2]}`;
    }
  } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    normalized = trimmed;
  }

  return normalized.replace(/\.git$/, "").replace(/\/$/, "");
}

function sanitizeBranchName(value: string | undefined | null): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "unknown";
  }
  return trimmed;
}

function extractBranchFromRef(ref: string | undefined | null): string | undefined {
  if (!ref) {
    return undefined;
  }
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.startsWith("refs/heads/")) {
    return trimmed.substring("refs/heads/".length);
  }
  if (trimmed.startsWith("refs/tags/")) {
    return trimmed.substring("refs/tags/".length);
  }
  if (trimmed.startsWith("refs/")) {
    const segments = trimmed.split("/");
    return segments[segments.length - 1];
  }
  return trimmed;
}

function generateVersionInfo(): VersionInfo {
  try {
    // 优先从环境变量获取信息（用于 Docker 构建）
    const envBuildDate = process.env.BUILD_DATE;
    const envCommitHash = process.env.COMMIT_HASH;
    const envCommitShortHash = process.env.COMMIT_SHORT_HASH;
    const envRepositoryUrl = process.env.REPOSITORY_URL;
    const envBranchName =
      process.env.BRANCH_NAME ||
      process.env.GITHUB_REF_NAME ||
      process.env.GITHUB_HEAD_REF ||
      extractBranchFromRef(process.env.GITHUB_REF);
    const envBranchUrl = process.env.BRANCH_URL;

    let buildDate: string;
    let commitHash: string;
    let commitShortHash: string;
    let repositoryUrl: string;
    let branchName = sanitizeBranchName(envBranchName);
    let branchUrl: string | null = envBranchUrl ?? null;

    if (envBuildDate && envCommitHash && envCommitShortHash && envRepositoryUrl) {
      // 使用环境变量中的信息（Docker 构建场景）
      buildDate = envBuildDate;
      commitHash = envCommitHash;
      commitShortHash = envCommitShortHash;
      repositoryUrl = normalizeRepositoryUrl(envRepositoryUrl);

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
      repositoryUrl = normalizeRepositoryUrl(remoteUrl);

      if (branchName === "unknown") {
        try {
          const detectedBranch = execSync("git rev-parse --abbrev-ref HEAD", {
            encoding: "utf-8",
          })
            .trim()
            .replace(/^refs\/heads\//, "");

          if (!detectedBranch || detectedBranch === "HEAD") {
            branchName = DETACHED_BRANCH_NAME;
          } else {
            branchName = detectedBranch;
          }
        } catch {
          console.warn("无法检测当前分支名称，使用 unknown");
        }
      }

      console.log("从 Git 获取信息");
    }

    // 确保仓库 URL 统一格式
    repositoryUrl = normalizeRepositoryUrl(repositoryUrl);

    if (
      !branchUrl &&
      branchName &&
      branchName !== "unknown" &&
      branchName !== DETACHED_BRANCH_NAME
    ) {
      branchUrl = `${repositoryUrl}/tree/${encodeURIComponent(branchName)}`;
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
      branchName,
      branchUrl,
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
      repositoryUrl: "https://github.com/IvanLi-CN/blog-26",
      commitUrl: "https://github.com/IvanLi-CN/blog-26",
      branchName: "unknown",
      branchUrl: null,
    };
  }
}

function resolveOutputPath() {
  const configured = process.env.VERSION_INFO_OUTPUT_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  return path.join(process.cwd(), "src", "generated", "version.json");
}

function canReuseExistingVersionFile(
  error: unknown,
  outputPath: string
): error is NodeJS.ErrnoException {
  if (!(error instanceof Error)) {
    return false;
  }

  const errnoError = error as NodeJS.ErrnoException;
  return (errnoError.code === "EACCES" || errnoError.code === "EROFS") && existsSync(outputPath);
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
  console.log(`  Branch: ${versionInfo.branchName}`);
  console.log(`  Branch URL: ${versionInfo.branchUrl ?? "n/a"}`);

  // 写入版本信息文件
  const outputPath = resolveOutputPath();

  // 确保目录存在
  const outputDir = path.dirname(outputPath);
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch (_error) {
    // 忽略错误，可能目录已存在
  }

  const serialized = JSON.stringify(versionInfo, null, 2);

  try {
    writeFileSync(outputPath, serialized);
  } catch (error) {
    if (canReuseExistingVersionFile(error, outputPath)) {
      const errnoError = error as NodeJS.ErrnoException;
      console.warn(
        `⚠️ Version info file is not writable (${errnoError.code}); keeping existing file: ${outputPath}`
      );
      return;
    }

    throw error;
  }

  console.log(`✅ Version info written to: ${outputPath}`);
}

if (import.meta.main) {
  main();
}
