/**
 * 数据库 Seed 系统
 * 支持从任何版本迁移到新版本，并在开发/测试环境填充测试数据
 */

import { eq, like } from 'drizzle-orm';
import { config } from '../config';
import { db, initializeDB } from '../db';
import { comments, memos, posts, users } from '../schema';
import { generateTestData } from './test-data';
import type { SeedData, SeedOptions, SeedResult } from './types';
import { TEST_DATA_PREFIX } from './types';

/**
 * 检查是否应该运行 seed
 */
function shouldRunSeed(options: SeedOptions): boolean {
  // 如果指定了只在开发环境运行，检查当前环境
  if (options.developmentOnly && config.env.isProduction) {
    return false;
  }

  return true;
}

/**
 * 清理现有的测试数据
 */
async function clearTestData(dataTypes: string[], verbose: boolean = false): Promise<void> {
  if (verbose) {
    console.log('🧹 清理现有测试数据...');
  }

  try {
    if (dataTypes.includes('comments')) {
      const deletedComments = await db.delete(comments).where(like(comments.id, `${TEST_DATA_PREFIX}%`));
      if (verbose) {
        console.log(`   删除了 ${deletedComments.changes} 条测试评论`);
      }
    }

    if (dataTypes.includes('memos')) {
      const deletedMemos = await db.delete(memos).where(like(memos.id, `${TEST_DATA_PREFIX}%`));
      if (verbose) {
        console.log(`   删除了 ${deletedMemos.changes} 条测试闪念`);
      }
    }

    if (dataTypes.includes('posts')) {
      const deletedPosts = await db.delete(posts).where(like(posts.id, `${TEST_DATA_PREFIX}%`));
      if (verbose) {
        console.log(`   删除了 ${deletedPosts.changes} 条测试文章`);
      }
    }

    if (dataTypes.includes('users')) {
      const deletedUsers = await db.delete(users).where(like(users.id, `${TEST_DATA_PREFIX}%`));
      if (verbose) {
        console.log(`   删除了 ${deletedUsers.changes} 个测试用户`);
      }
    }

    if (verbose) {
      console.log('✅ 测试数据清理完成');
    }
  } catch (error) {
    console.error('❌ 清理测试数据时出错:', error);
    throw error;
  }
}

/**
 * 插入 seed 数据
 */
async function insertSeedData(
  data: SeedData,
  dataTypes: string[],
  verbose: boolean = false
): Promise<{ posts: number; memos: number; comments: number; users: number }> {
  const counts = { posts: 0, memos: 0, comments: 0, users: 0 };

  try {
    // 插入用户数据（需要先插入，因为评论依赖用户）
    if (dataTypes.includes('users') && data.users.length > 0) {
      await db.insert(users).values(data.users);
      counts.users = data.users.length;
      if (verbose) {
        console.log(`   插入了 ${counts.users} 个测试用户`);
      }
    }

    // 插入文章数据
    if (dataTypes.includes('posts') && data.posts.length > 0) {
      await db.insert(posts).values(data.posts);
      counts.posts = data.posts.length;
      if (verbose) {
        console.log(`   插入了 ${counts.posts} 篇测试文章`);
      }
    }

    // 插入闪念数据
    if (dataTypes.includes('memos') && data.memos.length > 0) {
      await db.insert(memos).values(data.memos);
      counts.memos = data.memos.length;
      if (verbose) {
        console.log(`   插入了 ${counts.memos} 条测试闪念`);
      }
    }

    // 插入评论数据
    if (dataTypes.includes('comments') && data.comments.length > 0) {
      await db.insert(comments).values(data.comments);
      counts.comments = data.comments.length;
      if (verbose) {
        console.log(`   插入了 ${counts.comments} 条测试评论`);
      }
    }

    return counts;
  } catch (error) {
    console.error('❌ 插入 seed 数据时出错:', error);
    throw error;
  }
}

/**
 * 执行数据库 seed
 */
export async function seedDatabase(options: SeedOptions = {}): Promise<SeedResult> {
  const {
    clearExisting = true,
    developmentOnly = true,
    dataTypes = ['posts', 'memos', 'comments', 'users'],
    verbose = false,
  } = options;

  try {
    // 检查是否应该运行 seed
    if (!shouldRunSeed(options)) {
      return {
        success: false,
        message: '当前环境不允许运行 seed（生产环境）',
        seededCounts: { posts: 0, memos: 0, comments: 0, users: 0 },
      };
    }

    if (verbose) {
      console.log('🌱 开始数据库 seed...');
      console.log(`   环境: ${config.env.nodeEnv}`);
      console.log(`   数据类型: ${dataTypes.join(', ')}`);
    }

    // 确保数据库已初始化
    await initializeDB();

    // 清理现有测试数据
    if (clearExisting) {
      await clearTestData(dataTypes, verbose);
    }

    // 生成测试数据
    if (verbose) {
      console.log('📝 生成测试数据...');
    }
    const testData = generateTestData();

    // 插入新的测试数据
    if (verbose) {
      console.log('💾 插入测试数据...');
    }
    const seededCounts = await insertSeedData(testData, dataTypes, verbose);

    if (verbose) {
      console.log('✅ 数据库 seed 完成!');
      console.log('📊 统计信息:');
      console.log(`   文章: ${seededCounts.posts}`);
      console.log(`   闪念: ${seededCounts.memos}`);
      console.log(`   评论: ${seededCounts.comments}`);
      console.log(`   用户: ${seededCounts.users}`);
    }

    return {
      success: true,
      message: 'Seed 执行成功',
      seededCounts,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      message: `Seed 执行失败: ${errorMessage}`,
      seededCounts: { posts: 0, memos: 0, comments: 0, users: 0 },
      errors: [errorMessage],
    };
  }
}

/**
 * 检查是否存在测试数据
 */
export async function hasTestData(): Promise<boolean> {
  try {
    await initializeDB();

    const testPosts = await db
      .select()
      .from(posts)
      .where(like(posts.id, `${TEST_DATA_PREFIX}%`))
      .limit(1);
    const testMemos = await db
      .select()
      .from(memos)
      .where(like(memos.id, `${TEST_DATA_PREFIX}%`))
      .limit(1);

    return testPosts.length > 0 || testMemos.length > 0;
  } catch (error) {
    console.error('检查测试数据时出错:', error);
    return false;
  }
}

/**
 * 清理所有测试数据
 */
export async function clearAllTestData(): Promise<void> {
  await initializeDB();
  await clearTestData(['posts', 'memos', 'comments', 'users'], true);
}
