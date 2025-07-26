/**
 * 版本信息工具模块
 */

import { readFileSync } from 'fs';
import path from 'path';

export interface VersionInfo {
  version: string;
  buildDate: string;
  commitHash: string;
  commitShortHash: string;
  repositoryUrl: string;
  commitUrl: string;
}

/**
 * 获取版本信息
 * 优先从构建时生成的文件读取，如果文件不存在则返回默认值
 */
export function getVersionInfo(): VersionInfo {
  try {
    // 尝试读取构建时生成的版本信息文件
    const versionPath = path.join(process.cwd(), 'src', 'generated', 'version.json');
    const versionData = JSON.parse(readFileSync(versionPath, 'utf-8')) as VersionInfo;
    return versionData;
  } catch (_error) {
    // 如果文件不存在或读取失败，返回默认值
    console.warn('Version info file not found, using fallback values');

    const now = new Date();
    const buildDate = now.toISOString().slice(0, 10).replace(/-/g, '');

    // 在开发环境中尝试检查是否有未提交的更改
    let version = `${buildDate}-dev`;
    try {
      const { execSync } = require('child_process');
      const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
      if (gitStatus.length > 0) {
        version += '-draft';
      }
    } catch {
      // 如果无法检查 git 状态，就不添加 -draft
    }

    return {
      version,
      buildDate,
      commitHash: 'development',
      commitShortHash: 'dev',
      repositoryUrl: 'https://git.ivanli.cc/Ivan/blog-astrowind',
      commitUrl: 'https://git.ivanli.cc/Ivan/blog-astrowind',
    };
  }
}

/**
 * 格式化版本信息用于显示
 */
export function formatVersionInfo(versionInfo: VersionInfo) {
  return {
    displayVersion: versionInfo.version,
    displayDate: formatBuildDate(versionInfo.buildDate),
    commitLink: {
      text: versionInfo.commitShortHash,
      url: versionInfo.commitUrl,
    },
    repositoryLink: {
      text: '查看仓库',
      url: versionInfo.repositoryUrl,
    },
  };
}

/**
 * 格式化构建日期
 */
function formatBuildDate(buildDate: string): string {
  if (buildDate.length === 8) {
    // YYYYMMDD -> YYYY-MM-DD
    const year = buildDate.slice(0, 4);
    const month = buildDate.slice(4, 6);
    const day = buildDate.slice(6, 8);
    return `${year}-${month}-${day}`;
  }
  return buildDate;
}
