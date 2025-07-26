#!/usr/bin/env bun

/**
 * 生成版本信息脚本
 * 格式：YYYYMMDD-shortHash
 * 例如：20250101-abcdef01
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';

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
    // 获取当前日期 (YYYYMMDD 格式)
    const now = new Date();
    const buildDate = now.toISOString().slice(0, 10).replace(/-/g, '');

    // 获取 git commit hash
    const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const commitShortHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

    // 检查是否有未提交的更改
    let hasUncommittedChanges = false;
    try {
      const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
      hasUncommittedChanges = gitStatus.length > 0;
    } catch (_error) {
      console.warn('无法检查 git 状态，假设没有未提交的更改');
    }

    // 获取仓库 URL
    const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim();

    // 转换 SSH URL 为 HTTPS URL (如果需要)
    let repositoryUrl = remoteUrl;
    if (remoteUrl.startsWith('ssh://gitea@')) {
      // ssh://gitea@git.ivanli.cc:7018/Ivan/blog-astrowind.git
      // -> https://git.ivanli.cc/Ivan/blog-astrowind
      repositoryUrl = remoteUrl.replace('ssh://gitea@', 'https://').replace(':7018', '').replace('.git', '');
    } else if (remoteUrl.startsWith('git@')) {
      // git@github.com:user/repo.git -> https://github.com/user/repo
      repositoryUrl = remoteUrl.replace('git@', 'https://').replace(':', '/').replace('.git', '');
    }

    // 生成版本号，如果有未提交的更改则添加 -draft 后缀
    let version = `${buildDate}-${commitShortHash}`;
    if (hasUncommittedChanges) {
      version += '-draft';
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
    console.error('Error generating version info:', error);

    // 如果无法获取 git 信息，使用默认值
    const now = new Date();
    const buildDate = now.toISOString().slice(0, 10).replace(/-/g, '');

    // 尝试检查是否有未提交的更改（即使在错误情况下）
    let fallbackVersion = `${buildDate}-unknown`;
    try {
      const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
      if (gitStatus.length > 0) {
        fallbackVersion += '-draft';
      }
    } catch {
      // 如果连 git status 都失败，就不添加 -draft
    }

    return {
      version: fallbackVersion,
      buildDate,
      commitHash: 'unknown',
      commitShortHash: 'unknown',
      repositoryUrl: 'https://git.ivanli.cc/Ivan/blog-astrowind',
      commitUrl: 'https://git.ivanli.cc/Ivan/blog-astrowind',
    };
  }
}

function main() {
  console.log('🔧 Generating version information...');

  const versionInfo = generateVersionInfo();

  console.log('📋 Version Info:');
  console.log(`  Version: ${versionInfo.version}`);
  console.log(`  Build Date: ${versionInfo.buildDate}`);
  console.log(`  Commit: ${versionInfo.commitShortHash} (${versionInfo.commitHash})`);
  console.log(`  Repository: ${versionInfo.repositoryUrl}`);
  console.log(`  Commit URL: ${versionInfo.commitUrl}`);

  // 写入版本信息文件
  const outputPath = path.join(process.cwd(), 'src', 'generated', 'version.json');

  // 确保目录存在
  const outputDir = path.dirname(outputPath);
  try {
    execSync(`mkdir -p "${outputDir}"`, { stdio: 'ignore' });
  } catch (_error) {
    // 忽略错误，可能目录已存在
  }

  writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));

  console.log(`✅ Version info written to: ${outputPath}`);
}

if (import.meta.main) {
  main();
}
