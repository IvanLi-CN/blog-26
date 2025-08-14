#!/usr/bin/env bun

/**
 * Memo 功能性能优化脚本
 *
 * 优化数据库查询、创建索引、分析性能瓶颈
 */

import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { memos } from "../src/lib/schema";

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  status: "good" | "warning" | "critical";
}

class MemoPerformanceOptimizer {
  private metrics: PerformanceMetric[] = [];

  async analyzeDatabase() {
    console.log("📊 分析数据库性能...");

    try {
      // 检查 memos 表大小
      const tableInfo = await db.all(sql`
        SELECT 
          COUNT(*) as total_rows,
          AVG(LENGTH(content)) as avg_content_length,
          MAX(LENGTH(content)) as max_content_length
        FROM memos
      `);

      const info = tableInfo[0] as any;
      console.log(`📋 Memos 表统计:`);
      console.log(`  总记录数: ${info.total_rows}`);
      console.log(`  平均内容长度: ${Math.round(info.avg_content_length)} 字符`);
      console.log(`  最大内容长度: ${info.max_content_length} 字符`);

      this.metrics.push({
        name: "总记录数",
        value: info.total_rows,
        unit: "条",
        status: info.total_rows > 10000 ? "warning" : "good",
      });

      this.metrics.push({
        name: "平均内容长度",
        value: Math.round(info.avg_content_length),
        unit: "字符",
        status: info.avg_content_length > 5000 ? "warning" : "good",
      });
    } catch (error) {
      console.error("❌ 数据库分析失败:", error);
    }
  }

  async checkIndexes() {
    console.log("\n🔍 检查数据库索引...");

    try {
      // 检查现有索引
      const indexes = await db.all(sql`
        SELECT name, sql 
        FROM sqlite_master 
        WHERE type = 'index' 
        AND tbl_name = 'memos'
        AND name NOT LIKE 'sqlite_%'
      `);

      console.log("现有索引:");
      indexes.forEach((index: any) => {
        console.log(`  - ${index.name}`);
      });

      // 检查是否需要创建新索引
      const requiredIndexes = [
        "idx_memos_slug",
        "idx_memos_public",
        "idx_memos_publish_date",
        "idx_memos_last_modified",
        "idx_memos_source",
        "idx_memos_type",
      ];

      const existingIndexNames = indexes.map((idx: any) => idx.name);
      const missingIndexes = requiredIndexes.filter((name) => !existingIndexNames.includes(name));

      if (missingIndexes.length > 0) {
        console.log("\n⚠️  缺失的索引:");
        missingIndexes.forEach((name) => {
          console.log(`  - ${name}`);
        });
      } else {
        console.log("✅ 所有必需的索引都已存在");
      }
    } catch (error) {
      console.error("❌ 索引检查失败:", error);
    }
  }

  async optimizeQueries() {
    console.log("\n⚡ 优化查询性能...");

    try {
      // 测试常用查询的性能
      const queries = [
        {
          name: "获取公开 memo 列表",
          query: () => db.select().from(memos).where(sql`public = 1`).limit(10),
        },
        {
          name: "按 slug 查找 memo",
          query: () => db.select().from(memos).where(sql`slug = 'test-memo-1'`).limit(1),
        },
        {
          name: "按标签搜索",
          query: () => db.select().from(memos).where(sql`tags LIKE '%测试%'`).limit(10),
        },
        {
          name: "按时间排序",
          query: () => db.select().from(memos).orderBy(sql`publish_date DESC`).limit(10),
        },
      ];

      for (const { name, query } of queries) {
        const startTime = Date.now();
        await query();
        const duration = Date.now() - startTime;

        console.log(`  ${name}: ${duration}ms`);

        this.metrics.push({
          name: `查询: ${name}`,
          value: duration,
          unit: "ms",
          status: duration > 100 ? "warning" : duration > 50 ? "warning" : "good",
        });
      }
    } catch (error) {
      console.error("❌ 查询优化失败:", error);
    }
  }

  async analyzeContentSize() {
    console.log("\n📏 分析内容大小分布...");

    try {
      const sizeDistribution = await db.all(sql`
        SELECT 
          CASE 
            WHEN LENGTH(content) < 500 THEN '< 500'
            WHEN LENGTH(content) < 1000 THEN '500-1000'
            WHEN LENGTH(content) < 2000 THEN '1000-2000'
            WHEN LENGTH(content) < 5000 THEN '2000-5000'
            ELSE '> 5000'
          END as size_range,
          COUNT(*) as count
        FROM memos
        GROUP BY size_range
        ORDER BY 
          CASE size_range
            WHEN '< 500' THEN 1
            WHEN '500-1000' THEN 2
            WHEN '1000-2000' THEN 3
            WHEN '2000-5000' THEN 4
            ELSE 5
          END
      `);

      console.log("内容大小分布:");
      sizeDistribution.forEach((row: any) => {
        console.log(`  ${row.size_range.padEnd(12)} 字符: ${row.count} 个`);
      });
    } catch (error) {
      console.error("❌ 内容分析失败:", error);
    }
  }

  async checkCacheStrategy() {
    console.log("\n🗄️  检查缓存策略...");

    // 这里可以添加缓存相关的检查
    console.log("缓存策略建议:");
    console.log("  - 对公开 memo 列表启用 Redis 缓存");
    console.log("  - 对热门 memo 内容启用 CDN 缓存");
    console.log("  - 对搜索结果启用短期缓存");
    console.log("  - 对标签列表启用长期缓存");
  }

  async generateOptimizationReport() {
    console.log("\n📋 生成优化建议报告...");

    const report = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      recommendations: [
        {
          category: "数据库",
          items: [
            "为经常查询的字段创建复合索引",
            "考虑对大内容字段进行分离存储",
            "定期清理过期的草稿数据",
          ],
        },
        {
          category: "查询优化",
          items: [
            "使用分页查询避免一次性加载大量数据",
            "对搜索功能实现全文索引",
            "优化标签查询使用 JSON 函数",
          ],
        },
        {
          category: "缓存策略",
          items: ["实现 memo 列表的 Redis 缓存", "对静态资源启用 CDN 缓存", "实现增量更新缓存机制"],
        },
        {
          category: "前端优化",
          items: [
            "实现虚拟滚动处理大量 memo",
            "使用 React.memo 优化组件渲染",
            "实现图片懒加载和压缩",
          ],
        },
      ],
    };

    // 保存报告到文件
    const reportPath = "performance-report.json";
    await (globalThis as any).Bun.write(reportPath, JSON.stringify(report, null, 2));
    console.log(`✅ 报告已保存到: ${reportPath}`);

    return report;
  }

  printMetrics() {
    console.log("\n📊 性能指标汇总:");
    console.log("=".repeat(60));

    this.metrics.forEach((metric) => {
      const statusIcon = {
        good: "✅",
        warning: "⚠️",
        critical: "❌",
      }[metric.status];

      console.log(
        `${statusIcon} ${metric.name.padEnd(25)} ${metric.value.toString().padStart(8)} ${metric.unit}`
      );
    });

    console.log("=".repeat(60));

    const goodCount = this.metrics.filter((m) => m.status === "good").length;
    const warningCount = this.metrics.filter((m) => m.status === "warning").length;
    const criticalCount = this.metrics.filter((m) => m.status === "critical").length;

    console.log(`总计: ${this.metrics.length} 个指标`);
    console.log(`良好: ${goodCount} 个`);
    console.log(`警告: ${warningCount} 个`);
    console.log(`严重: ${criticalCount} 个`);

    if (criticalCount > 0) {
      console.log("\n❌ 发现严重性能问题，建议立即优化");
    } else if (warningCount > 0) {
      console.log("\n⚠️  发现性能警告，建议关注优化");
    } else {
      console.log("\n🎉 性能指标良好！");
    }
  }

  async runOptimization() {
    console.log("🚀 开始 Memo 性能优化分析");
    console.log("=".repeat(60));

    try {
      await this.analyzeDatabase();
      await this.checkIndexes();
      await this.optimizeQueries();
      await this.analyzeContentSize();
      await this.checkCacheStrategy();

      const report = await this.generateOptimizationReport();
      this.printMetrics();

      console.log("\n🎯 优化建议:");
      report.recommendations.forEach((category) => {
        console.log(`\n${category.category}:`);
        category.items.forEach((item) => {
          console.log(`  - ${item}`);
        });
      });
    } catch (error) {
      console.error("❌ 优化分析失败:", error);
      throw error;
    }
  }
}

// 运行优化分析
async function main() {
  const optimizer = new MemoPerformanceOptimizer();
  await optimizer.runOptimization();
}

main().catch((error) => {
  console.error("优化分析过程中发生错误:", error);
  process.exit(1);
});
