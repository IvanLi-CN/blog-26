/**
 * 数据库 seed 相关的类型定义
 */

import type { NewMemo, NewPost } from '../schema';

// Seed 数据的基础接口
export interface SeedData {
  posts: NewPost[];
  memos: NewMemo[];
  comments: Array<{
    id: string;
    content: string;
    postSlug: string;
    authorName: string;
    authorEmail: string;
    parentId?: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: number;
  }>;
  users: Array<{
    id: string;
    email: string;
    name?: string;
    createdAt: number;
  }>;
}

// Seed 配置选项
export interface SeedOptions {
  // 是否清空现有数据
  clearExisting?: boolean;
  // 是否只在非生产环境运行
  developmentOnly?: boolean;
  // 要 seed 的数据类型
  dataTypes?: Array<'posts' | 'memos' | 'comments' | 'users'>;
  // 是否显示详细日志
  verbose?: boolean;
}

// Seed 执行结果
export interface SeedResult {
  success: boolean;
  message: string;
  seededCounts: {
    posts: number;
    memos: number;
    comments: number;
    users: number;
  };
  errors?: string[];
}

// 测试数据标识符
export const TEST_DATA_PREFIX = 'test_';
export const TEST_DATA_TAG = '#测试数据';
