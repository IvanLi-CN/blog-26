/**
 * 测试数据过滤器
 * 在生产环境中过滤掉测试数据
 */

import { and, like, not } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { TEST_DATA_PREFIX, TEST_DATA_TAG } from './types';

/**
 * 检查是否应该显示测试数据
 */
export function shouldShowTestData(): boolean {
  try {
    // 直接检查环境变量，避免导入 config 模块
    const nodeEnv = process.env.NODE_ENV || 'development';
    return nodeEnv === 'development' || nodeEnv === 'test';
  } catch {
    // 如果出错，默认为开发环境
    return true;
  }
}

/**
 * 创建过滤测试数据的 WHERE 条件
 * 在生产环境中排除测试数据
 */
export function createTestDataFilter(idColumn: SQLiteColumn) {
  if (shouldShowTestData()) {
    // 开发/测试环境：显示所有数据
    return undefined;
  } else {
    // 生产环境：排除测试数据
    return not(like(idColumn, `${TEST_DATA_PREFIX}%`));
  }
}

/**
 * 过滤数组中的测试数据
 */
export function filterTestDataFromArray<T extends { id: string }>(items: T[]): T[] {
  if (shouldShowTestData()) {
    return items;
  }

  return items.filter((item) => !item.id.startsWith(TEST_DATA_PREFIX));
}

/**
 * 过滤包含测试标签的内容
 */
export function filterTestDataByContent<T extends { body?: string; content?: string }>(items: T[]): T[] {
  if (shouldShowTestData()) {
    return items;
  }

  return items.filter((item) => {
    const content = item.body || item.content || '';
    return !content.includes(TEST_DATA_TAG);
  });
}

/**
 * 检查单个项目是否为测试数据
 */
export function isTestData(item: { id: string } | { body?: string; content?: string }): boolean {
  // 检查 ID 前缀
  if ('id' in item && item.id.startsWith(TEST_DATA_PREFIX)) {
    return true;
  }

  // 检查内容标签
  if ('body' in item || 'content' in item) {
    const content = ('body' in item ? item.body : item.content) || '';
    if (content.includes(TEST_DATA_TAG)) {
      return true;
    }
  }

  return false;
}

/**
 * 为查询添加环境过滤条件
 * 这是一个通用的查询增强器
 */
export function withEnvironmentFilter<T>(query: T, idColumn: SQLiteColumn, additionalConditions?: any): T {
  const testDataFilter = createTestDataFilter(idColumn);

  if (!testDataFilter && !additionalConditions) {
    return query;
  }

  // 组合过滤条件
  const conditions = [testDataFilter, additionalConditions].filter(Boolean);

  if (conditions.length === 0) {
    return query;
  }

  // 这里需要根据具体的查询类型来应用条件
  // 由于 TypeScript 的限制，我们返回原查询，让调用者手动应用条件
  return query;
}

/**
 * 获取环境信息用于调试
 */
export function getEnvironmentInfo() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  return {
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    shouldShowTestData: shouldShowTestData(),
    testDataPrefix: TEST_DATA_PREFIX,
    testDataTag: TEST_DATA_TAG,
  };
}

/**
 * 日志记录测试数据过滤信息
 */
export function logFilterInfo(context: string, totalCount: number, filteredCount: number): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'development') {
    const filtered = totalCount - filteredCount;
    if (filtered > 0) {
      console.log(`[${context}] 过滤了 ${filtered} 条测试数据，剩余 ${filteredCount} 条`);
    }
  }
}
