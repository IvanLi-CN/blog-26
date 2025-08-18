#!/usr/bin/env bun

/**
 * E2E 测试数据验证脚本
 *
 * 验证 E2E 测试是否使用了正确的测试数据，而不是种子数据
 */

import { eq, like } from "drizzle-orm";
import { db, initializeDB } from "../src/lib/db";
import { posts } from "../src/lib/schema";

interface DataVerificationResult {
  success: boolean;
  message: string;
  details?: any;
}

class E2EDataVerifier {
  /**
   * 验证数据库中的测试数据
   */
  async verifyTestData(): Promise<DataVerificationResult> {
    try {
      console.log("🔍 验证 E2E 测试数据...");

      // 检查测试数据特征
      const testDataChecks = await Promise.all([
        this.checkTestMemos(),
        this.checkTestPosts(),
        this.checkTestProjects(),
        this.checkSeedDataAbsence(),
      ]);

      const allPassed = testDataChecks.every((check) => check.success);

      if (allPassed) {
        return {
          success: true,
          message: "✅ E2E 测试数据验证通过！使用的是正确的测试数据，而不是种子数据。",
          details: testDataChecks,
        };
      } else {
        const failedChecks = testDataChecks.filter((check) => !check.success);
        return {
          success: false,
          message: "❌ E2E 测试数据验证失败！可能仍在使用种子数据。",
          details: failedChecks,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `❌ 验证过程出错: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 检查测试 Memos 数据
   */
  private async checkTestMemos(): Promise<DataVerificationResult> {
    // 测试数据中的特征性 memo slug
    const testMemoSlugs = [
      "20250805-zhou1-mo4-she4-ying3-xiao3-ji4", // 周末摄影小记
      "20250817-xue2-xi2-react-18-xin1-te4-xing4", // 学习 React 18 新特性
      "20250813-cqbmp-og", // 特殊的测试 memo
    ];

    const foundMemos = await db
      .select({ slug: posts.slug, title: posts.title })
      .from(posts)
      .where(eq(posts.type, "memo"));

    const testMemosFound = testMemoSlugs.filter((slug) =>
      foundMemos.some((memo) => memo.slug === slug)
    );

    const success = testMemosFound.length >= 2; // 至少找到2个测试 memo

    return {
      success,
      message: success
        ? `✅ 找到 ${testMemosFound.length} 个测试 memo`
        : `❌ 只找到 ${testMemosFound.length} 个测试 memo，可能使用了种子数据`,
      details: {
        expected: testMemoSlugs,
        found: testMemosFound,
        totalMemos: foundMemos.length,
      },
    };
  }

  /**
   * 检查测试 Posts 数据
   */
  private async checkTestPosts(): Promise<DataVerificationResult> {
    // 测试数据中的特征性 post slug
    const testPostSlugs = [
      "vue3-composition-api-deep-dive",
      "svelte-5-new-features",
      "react-hooks-deep-dive",
      "typescript-advanced-types",
    ];

    const foundPosts = await db
      .select({ slug: posts.slug, title: posts.title })
      .from(posts)
      .where(eq(posts.type, "post"));

    const testPostsFound = testPostSlugs.filter((slug) =>
      foundPosts.some((post) => post.slug === slug)
    );

    const success = testPostsFound.length >= 3; // 至少找到3个测试 post

    return {
      success,
      message: success
        ? `✅ 找到 ${testPostsFound.length} 个测试文章`
        : `❌ 只找到 ${testPostsFound.length} 个测试文章，可能使用了种子数据`,
      details: {
        expected: testPostSlugs,
        found: testPostsFound,
        totalPosts: foundPosts.length,
      },
    };
  }

  /**
   * 检查测试 Projects 数据
   */
  private async checkTestProjects(): Promise<DataVerificationResult> {
    // 测试数据中的特征性 project slug
    const testProjectSlugs = [
      "personal-blog-system",
      "ai-powered-code-review-tool",
      "open-source-component-library",
    ];

    const foundProjects = await db
      .select({ slug: posts.slug, title: posts.title })
      .from(posts)
      .where(eq(posts.type, "project"));

    const testProjectsFound = testProjectSlugs.filter((slug) =>
      foundProjects.some((project) => project.slug === slug)
    );

    const success = testProjectsFound.length >= 2; // 至少找到2个测试项目

    return {
      success,
      message: success
        ? `✅ 找到 ${testProjectsFound.length} 个测试项目`
        : `❌ 只找到 ${testProjectsFound.length} 个测试项目，可能使用了种子数据`,
      details: {
        expected: testProjectSlugs,
        found: testProjectsFound,
        totalProjects: foundProjects.length,
      },
    };
  }

  /**
   * 检查种子数据是否不存在
   */
  private async checkSeedDataAbsence(): Promise<DataVerificationResult> {
    // 种子数据中的特征性 slug
    const seedDataSlugs = [
      "nextjs-15-features", // 种子数据中的文章
      "typescript-5-guide",
      "modern-frontend-architecture",
    ];

    const foundSeedData = await db
      .select({ slug: posts.slug, title: posts.title })
      .from(posts)
      .where(like(posts.slug, "nextjs-15-features"));

    const seedDataFound = seedDataSlugs.filter((slug) =>
      foundSeedData.some((item) => item.slug === slug)
    );

    const success = seedDataFound.length === 0; // 不应该找到种子数据

    return {
      success,
      message: success
        ? "✅ 没有发现种子数据，确认使用测试数据"
        : `❌ 发现 ${seedDataFound.length} 个种子数据项，可能混合了种子数据`,
      details: {
        seedDataFound,
        totalFound: foundSeedData.length,
      },
    };
  }

  /**
   * 输出详细的数据统计
   */
  async printDataStatistics(): Promise<void> {
    console.log("\n📊 数据库内容统计:");

    const stats = await db
      .select({
        type: posts.type,
        count: posts.id,
      })
      .from(posts);

    const typeStats = stats.reduce(
      (acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    for (const [type, count] of Object.entries(typeStats)) {
      console.log(`  - ${type}: ${count} 项`);
    }

    const total = Object.values(typeStats).reduce((sum, count) => sum + count, 0);
    console.log(`  - 总计: ${total} 项`);
  }
}

// 主函数
async function main() {
  // 初始化数据库
  await initializeDB();

  const verifier = new E2EDataVerifier();

  console.log("🧪 开始验证 E2E 测试数据...\n");

  // 输出数据统计
  await verifier.printDataStatistics();

  // 验证测试数据
  const result = await verifier.verifyTestData();

  console.log(`\n${result.message}`);

  if (result.details && Array.isArray(result.details)) {
    console.log("\n📋 详细检查结果:");
    for (const detail of result.details) {
      console.log(`  ${detail.message}`);
    }
  }

  process.exit(result.success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("验证脚本执行失败:", error);
    process.exit(1);
  });
}
