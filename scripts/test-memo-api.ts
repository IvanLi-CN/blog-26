#!/usr/bin/env bun

import { createContext } from "../src/server/context";
import { appRouter } from "../src/server/router";

async function testMemoAPI() {
  console.log("🧪 测试 memo API 路由器...");

  try {
    // 创建测试上下文
    const mockRequest = new Request("http://localhost:3000/api/trpc");
    const mockHeaders = new Headers();

    const ctx = await createContext({
      req: mockRequest,
      resHeaders: mockHeaders,
      info: {
        isBatchCall: false,
        calls: [],
        accept: "application/jsonl",
        type: "query" as const,
        connectionParams: {},
        signal: new AbortController().signal,
        url: new URL("http://localhost:3000/api/trpc"),
      },
    });

    // 创建 tRPC 调用器
    const caller = appRouter.createCaller(ctx);

    // 测试获取 memo 列表
    console.log("📋 测试获取 memo 列表...");
    const memosList = await caller.memos.list({
      limit: 5,
      publicOnly: false, // 获取所有 memo（包括私有的）
    });

    console.log(`✅ 获取到 ${memosList.memos.length} 个 memo`);
    console.log("分页信息:", {
      hasMore: memosList.hasMore,
      nextCursor: memosList.nextCursor,
    });

    if (memosList.memos.length > 0) {
      console.log("\n📝 Memo 列表示例:");
      memosList.memos.slice(0, 3).forEach((memo, index) => {
        console.log(`  ${index + 1}. ${memo.title}`);
        console.log(`     ID: ${memo.id}`);
        console.log(`     Slug: ${memo.slug}`);
        console.log(`     Public: ${memo.isPublic}`);
        console.log(`     Source: ${memo.source}`);
        console.log(`     Tags: ${memo.tags.join(", ")}`);
        console.log(`     Created: ${memo.createdAt}`);
      });

      // 测试获取单个 memo
      const firstMemo = memosList.memos[0];
      console.log(`\n🔍 测试获取单个 memo: ${firstMemo.slug}`);

      try {
        const singleMemo = await caller.memos.bySlug({ slug: firstMemo.slug });
        console.log(`✅ 成功获取 memo: ${singleMemo.title}`);
        console.log(`   内容长度: ${singleMemo.content.length} 字符`);
        console.log(`   附件数量: ${singleMemo.attachments.length}`);
      } catch (error) {
        console.error(`❌ 获取单个 memo 失败:`, error);
      }
    }

    // 测试健康检查
    console.log("\n🏥 测试健康检查...");
    const health = await caller.health();
    console.log("✅ 健康检查通过:", health);

    console.log("\n🎉 memo API 测试完成！");
  } catch (error) {
    console.error("❌ 测试失败:", error);
    throw error;
  }
}

// 运行测试
testMemoAPI().catch((error) => {
  console.error("测试过程中发生错误:", error);
  process.exit(1);
});
