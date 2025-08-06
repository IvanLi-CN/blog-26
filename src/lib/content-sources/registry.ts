/**
 * 多源内容数据源架构 - 数据源注册
 *
 * 注册所有可用的数据源类型
 */

import { config } from '~/lib/config';
import { ContentSourceFactory } from './factory';
import { LocalFileSystemDataSource } from './local';
import { WebDAVDataSource } from './webdav';

/**
 * 注册所有内置数据源类型
 */
export function registerBuiltinDataSources(): void {
  // 注册WebDAV数据源
  ContentSourceFactory.registerSourceType('webdav', WebDAVDataSource);

  // 注册本地文件系统数据源
  ContentSourceFactory.registerSourceType('local', LocalFileSystemDataSource);

  console.log('✅ 已注册所有内置数据源类型');
}

/**
 * 获取默认的多源配置
 */
export function getDefaultMultiSourceConfig(): any {
  const multiSourceConfig = config.multiSource;
  const localConfig = config.localContent;
  const webdavConfig = config.webdav;

  return {
    dataSources: [
      {
        name: 'local',
        type: 'local' as const,
        enabled: true,
        priority: 1,
        required: false,
        config: {
          basePath: localConfig.basePath,
          watchChanges: localConfig.watchChanges,
          excludePaths: localConfig.excludePaths,
          projectsPath: localConfig.projectsPath,
          memosPath: localConfig.memosPath,
          includePatterns: ['**/*.md', '**/*.mdx'],
          excludePatterns: ['**/.*', '**/_*'],
        },
      },
      {
        name: 'webdav-primary',
        type: 'webdav' as const,
        enabled: !!webdavConfig.url, // 只要有URL就启用，用户名和密码可选（开发环境可能不需要认证）
        priority: 2,
        required: false,
        config: {
          url: webdavConfig.url,
          username: webdavConfig.username,
          password: webdavConfig.password,
          excludePaths: webdavConfig.excludePaths,
          projectsPath: webdavConfig.projectsPath,
          memosPath: webdavConfig.memosPath,
        },
      },
    ],
    cache: multiSourceConfig.cache,
  };
}

/**
 * 初始化多源内容管理器
 */
export async function initializeMultiSourceManager(): Promise<any> {
  // 注册内置数据源类型
  registerBuiltinDataSources();

  // 获取配置
  const config = getDefaultMultiSourceConfig();

  // 创建管理器
  const manager = await ContentSourceFactory.createMultiSourceManager(config);

  return manager;
}

// 导出便捷函数
export { ContentSourceFactory } from './factory';
export { LocalFileSystemDataSource } from './local';
export { MultiSourceContentManager } from './manager';
export { WebDAVDataSource } from './webdav';
