#!/usr/bin/env bun

/**
 * 数据库 Seed 脚本
 * 用于填充开发和测试环境的示例数据
 */

import { clearAllTestData, hasTestData, seedDatabase } from '../src/lib/seed';
import type { SeedOptions } from '../src/lib/seed/types';

// 解析命令行参数
function parseArgs(): {
  action: 'seed' | 'clear' | 'check';
  options: SeedOptions;
} {
  const args = process.argv.slice(2);

  let action: 'seed' | 'clear' | 'check' = 'seed';
  const options: SeedOptions = {
    clearExisting: true,
    developmentOnly: true,
    dataTypes: ['posts', 'memos', 'comments', 'users'],
    verbose: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--clear':
      case '-c':
        action = 'clear';
        break;

      case '--check':
        action = 'check';
        break;

      case '--no-clear':
        options.clearExisting = false;
        break;

      case '--production':
        options.developmentOnly = false;
        break;

      case '--quiet':
      case '-q':
        options.verbose = false;
        break;

      case '--types':
      case '-t':
        if (i + 1 < args.length) {
          const types = args[i + 1].split(',').map((t) => t.trim());
          options.dataTypes = types.filter((t) => ['posts', 'memos', 'comments', 'users'].includes(t)) as Array<
            'posts' | 'memos' | 'comments' | 'users'
          >;
          i++; // 跳过下一个参数
        }
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return { action, options };
}

// 打印帮助信息
function printHelp(): void {
  console.log(`
数据库 Seed 脚本

用法:
  bun run seed [选项]

动作:
  (默认)           执行 seed 操作
  --clear, -c      清理所有测试数据
  --check          检查是否存在测试数据

选项:
  --no-clear       不清理现有测试数据（增量添加）
  --production     允许在生产环境运行（危险！）
  --quiet, -q      静默模式，减少输出
  --types, -t      指定要 seed 的数据类型（逗号分隔）
                   可选值: posts,memos,comments,users
  --help, -h       显示此帮助信息

示例:
  bun run seed                           # 执行完整 seed
  bun run seed --clear                   # 清理测试数据
  bun run seed --check                   # 检查测试数据
  bun run seed --types posts,memos       # 只 seed 文章和闪念
  bun run seed --no-clear --quiet        # 增量添加，静默模式

注意:
  - 默认只在开发和测试环境运行
  - 生产环境需要使用 --production 参数（不推荐）
  - 测试数据都有特殊前缀，不会与真实数据冲突
`);
}

// 主函数
async function main(): Promise<void> {
  try {
    const { action, options } = parseArgs();

    switch (action) {
      case 'seed':
        console.log('🌱 开始执行数据库 seed...\n');
        const result = await seedDatabase(options);

        if (result.success) {
          console.log(`\n✅ ${result.message}`);
          if (options.verbose) {
            console.log('\n📊 Seed 统计:');
            console.log(`   文章: ${result.seededCounts.posts}`);
            console.log(`   闪念: ${result.seededCounts.memos}`);
            console.log(`   评论: ${result.seededCounts.comments}`);
            console.log(`   用户: ${result.seededCounts.users}`);
          }
        } else {
          console.error(`\n❌ ${result.message}`);
          if (result.errors) {
            console.error('错误详情:');
            result.errors.forEach((error) => console.error(`   - ${error}`));
          }
          process.exit(1);
        }
        break;

      case 'clear':
        console.log('🧹 清理所有测试数据...\n');
        await clearAllTestData();
        console.log('✅ 测试数据清理完成');
        break;

      case 'check':
        console.log('🔍 检查测试数据...\n');
        const exists = await hasTestData();
        if (exists) {
          console.log('✅ 发现测试数据');
        } else {
          console.log('❌ 未发现测试数据');
        }
        break;
    }
  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  }
}

// 运行脚本
if (import.meta.main) {
  main();
}
