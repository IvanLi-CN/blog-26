/**
 * 多源内容数据源架构 - 兼容性层
 *
 * 提供与现有API兼容的接口，逐步迁移到新的多源架构
 */

import type { ContentItem, ContentType } from '~/lib/content';
import { getGlobalContentManager } from './global';

/**
 * 兼容现有的 loadPostsAndProjects 函数
 * 使用新的多源管理器实现
 */
export async function loadPostsAndProjects(): Promise<ContentItem[]> {
  try {
    const manager = await getGlobalContentManager();
    const content = await manager.listContent({
      type: 'all',
      includePrivate: true,
      includeDrafts: true,
    });

    // 过滤出posts和projects
    return content.filter((item) => item.type === 'post' || item.type === 'project');
  } catch (error) {
    console.error('Failed to load posts and projects via multi-source manager:', error);

    // 降级到原有实现
    const { loadPostsAndProjects: originalLoad } = await import('~/lib/content');
    return originalLoad();
  }
}

/**
 * 兼容现有的 loadMemos 函数
 * 使用新的多源管理器实现
 */
export async function loadMemos(): Promise<ContentItem[]> {
  try {
    const manager = await getGlobalContentManager();
    const content = await manager.listContent({
      type: 'memo',
      includePrivate: true,
      includeDrafts: true,
    });

    return content;
  } catch (error) {
    console.error('Failed to load memos via multi-source manager:', error);

    // 降级到原有实现 - loadMemos是私有函数，返回空数组
    console.warn('loadMemos is not available, returning empty array');
    return [];
  }
}

/**
 * 兼容现有的 fetchContent 函数
 * 使用新的多源管理器实现
 */
export async function fetchContent(types: (ContentType | 'all')[] = ['all']): Promise<ContentItem[]> {
  try {
    const manager = await getGlobalContentManager();

    if (types.includes('all')) {
      return manager.listContent({
        includePrivate: true,
        includeDrafts: true,
      });
    }

    const results: ContentItem[] = [];

    for (const type of types) {
      if (type !== 'all') {
        const content = await manager.listContent({
          type,
          includePrivate: true,
          includeDrafts: true,
        });
        results.push(...content);
      }
    }

    // 去重并排序
    const uniqueResults = Array.from(new Map(results.map((item) => [item.id, item])).values());

    return uniqueResults.sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf());
  } catch (error) {
    console.error('Failed to fetch content via multi-source manager:', error);

    // 降级到原有实现（使用已弃用的 fetchContent 作为兼容性回退）
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const { fetchContent: originalFetch } = await import('~/lib/content');
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return originalFetch(types);
  }
}

/**
 * 通过ID获取内容
 */
export async function getContentById(id: string): Promise<ContentItem | null> {
  try {
    const manager = await getGlobalContentManager();
    return manager.getContent(id);
  } catch (error) {
    console.error('Failed to get content by ID via multi-source manager:', error);
    return null;
  }
}

/**
 * 通过slug获取内容
 */
export async function getContentBySlug(slug: string, type?: ContentType): Promise<ContentItem | null> {
  try {
    const manager = await getGlobalContentManager();
    return manager.getContentBySlug(slug, type);
  } catch (error) {
    console.error('Failed to get content by slug via multi-source manager:', error);
    return null;
  }
}

/**
 * 创建内容
 */
export async function createContent(input: {
  slug: string;
  type: ContentType;
  title: string;
  body: string;
  frontmatter?: Record<string, any>;
  customPath?: string;
  collection?: 'posts' | 'projects';
}): Promise<ContentItem> {
  const manager = await getGlobalContentManager();
  return manager.createContent(input);
}

/**
 * 更新内容
 */
export async function updateContent(
  id: string,
  input: {
    title?: string;
    body?: string;
    frontmatter?: Record<string, any>;
    slug?: string;
  }
): Promise<ContentItem> {
  const manager = await getGlobalContentManager();
  return manager.updateContent(id, input);
}

/**
 * 删除内容
 */
export async function deleteContent(id: string): Promise<void> {
  const manager = await getGlobalContentManager();
  return manager.deleteContent(id);
}

/**
 * 搜索内容
 */
export async function searchContent(
  query: string,
  options?: {
    type?: ContentType | 'all';
    limit?: number;
    includePrivate?: boolean;
    includeDrafts?: boolean;
  }
): Promise<ContentItem[]> {
  try {
    const manager = await getGlobalContentManager();
    return manager.searchContent(query, options);
  } catch (error) {
    console.error('Failed to search content via multi-source manager:', error);
    return [];
  }
}

/**
 * 同步内容
 */
export async function syncContent(options?: { since?: Date; force?: boolean; dryRun?: boolean }): Promise<{
  updated: number;
  created: number;
  deleted: number;
  errors: Array<{ source: string; error: string }>;
}> {
  try {
    const manager = await getGlobalContentManager();
    return manager.syncContent(options);
  } catch (error) {
    console.error('Failed to sync content via multi-source manager:', error);
    return {
      updated: 0,
      created: 0,
      deleted: 0,
      errors: [{ source: 'multi-source', error: error.message }],
    };
  }
}

/**
 * 获取内容索引
 */
export async function getContentIndex(): Promise<
  Array<{
    id: string;
    slug: string;
    type: ContentType;
    title: string;
    publishDate: Date;
    updateDate?: Date;
    draft?: boolean;
    public?: boolean;
    lastModified: Date;
    etag?: string;
    contentHash?: string;
  }>
> {
  try {
    const manager = await getGlobalContentManager();
    return manager.getContentIndex();
  } catch (error) {
    console.error('Failed to get content index via multi-source manager:', error);
    return [];
  }
}

/**
 * 检查多源管理器是否可用
 */
export async function isMultiSourceManagerAvailable(): Promise<boolean> {
  try {
    const manager = await getGlobalContentManager();
    const info = manager.getManagerInfo();
    return info.enabledSources > 0;
  } catch (error) {
    console.warn('Multi-source manager not available:', error);
    return false;
  }
}

/**
 * 获取多源管理器状态信息
 */
export async function getMultiSourceManagerInfo(): Promise<any> {
  try {
    const manager = await getGlobalContentManager();
    return manager.getManagerInfo();
  } catch (error) {
    console.error('Failed to get multi-source manager info:', error);
    return {
      totalSources: 0,
      enabledSources: 0,
      error: error.message,
    };
  }
}
