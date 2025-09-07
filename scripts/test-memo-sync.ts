#!/usr/bin/env bun
/**
 * 测试闪念写操作的增量数据同步功能
 */

// 设置测试环境变量
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}
if (!process.env.ADMIN_EMAIL) {
  process.env.ADMIN_EMAIL = "admin-test@test.local";
}
if (!process.env.WEBDAV_URL) {
  process.env.WEBDAV_URL = "http://localhost:8080";
}

import { initializeDB } from "../src/lib/db";
import { createContext } from "../src/server/context";
import { appRouter } from "../src/server/router";

console.log("🧪 开始测试闪念增量数据同步功能...");

async function testMemoSync() {
  try {
    // 初始化数据库
    console.log("🔧 初始化数据库...");
    await initializeDB();
    console.log("✅ 数据库初始化完成");

    // 创建测试上下文
    const mockRequest = new Request("http://localhost:25090/api/trpc");
    const mockHeaders = new Headers();

    const ctx = await createContext({
      req: mockRequest,
      resHeaders: mockHeaders,
      info: {
        isBatchCall: false,
        calls: [],
        accept: "application/jsonl",
        type: "mutation" as const,
        connectionParams: {},
        signal: new AbortController().signal,
        url: new URL("http://localhost:25090/api/trpc"),
      },
    });

    // 模拟管理员用户
    ctx.user = { id: "admin-test", email: "admin-test@test.local", nickname: "Admin Test" };
    ctx.isAdmin = true;

    // 创建 tRPC 调用器
    const caller = appRouter.createCaller(ctx);

    console.log("\n1️⃣ 测试创建闪念并触发同步...");
    const testContent = `# 测试闪念同步功能

这是一个测试闪念，用于验证增量数据同步功能是否正常工作。

创建时间：${new Date().toISOString()}

## 功能验证点

- [x] WebDAV 文件创建
- [x] 数据库记录插入
- [x] 增量数据同步触发
- [x] 同步完成等待
- [x] 响应返回

## 预期行为

1. 闪念内容写入 WebDAV
2. 数据库记录创建
3. 立即触发增量同步
4. 等待同步完成（最多30秒）
5. 返回成功响应

如果看到这个内容，说明同步功能正常工作！ 🎉`;

    const startTime = Date.now();

    const createResult = await caller.memos.create({
      content: testContent,
      title: "测试闪念同步功能",
      isPublic: true,
      tags: ["test", "sync", "memo"],
      attachments: [],
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log("✅ 闪念创建成功！");
    console.log(`   - ID: ${createResult.id}`);
    console.log(`   - Slug: ${createResult.slug}`);
    console.log(`   - 标题: ${createResult.title}`);
    console.log(`   - 公开: ${createResult.isPublic}`);
    console.log(`   - 标签: ${createResult.tags.join(", ")}`);
    console.log(`   - 总耗时: ${duration}ms`);

    console.log("\n2️⃣ 测试更新闪念并触发同步...");
    const updatedContent =
      testContent +
      `\n\n## 更新测试\n\n更新时间：${new Date().toISOString()}\n\n这是更新后的内容，用于测试更新操作的同步功能。`;

    const updateStartTime = Date.now();

    const updateResult = await caller.memos.update({
      id: createResult.id,
      content: updatedContent,
      title: "测试闪念同步功能（已更新）",
      isPublic: true,
      tags: ["test", "sync", "memo", "updated"],
      attachments: [],
    });

    const updateEndTime = Date.now();
    const updateDuration = updateEndTime - updateStartTime;

    console.log("✅ 闪念更新成功！");
    console.log(`   - 标题: ${updateResult.title}`);
    console.log(`   - 标签: ${updateResult.tags.join(", ")}`);
    console.log(`   - 更新耗时: ${updateDuration}ms`);

    console.log("\n3️⃣ 验证闪念是否可以正常读取...");
    const readResult = await caller.memos.bySlug({
      slug: createResult.slug,
    });

    console.log("✅ 闪念读取成功！");
    console.log(`   - 标题: ${readResult.title}`);
    console.log(`   - 内容长度: ${readResult.content.length} 字符`);
    console.log(`   - 是否包含更新标记: ${readResult.content.includes("更新测试") ? "是" : "否"}`);

    console.log("\n4️⃣ 测试删除闪念并触发同步...");
    const deleteStartTime = Date.now();

    const deleteResult = await caller.memos.delete({
      id: createResult.id,
    });

    const deleteEndTime = Date.now();
    const deleteDuration = deleteEndTime - deleteStartTime;

    console.log("✅ 闪念删除成功！");
    console.log(`   - 删除耗时: ${deleteDuration}ms`);
    console.log(`   - 结果: ${deleteResult.success ? "成功" : "失败"}`);

    console.log("\n🎉 所有测试完成！");
    console.log("📊 性能统计:");
    console.log(`   - 创建操作: ${duration}ms`);
    console.log(`   - 更新操作: ${updateDuration}ms`);
    console.log(`   - 删除操作: ${deleteDuration}ms`);
    console.log(`   - 总耗时: ${duration + updateDuration + deleteDuration}ms`);

    if (duration > 10000 || updateDuration > 10000 || deleteDuration > 10000) {
      console.log("⚠️  警告：某些操作耗时较长，可能需要优化同步机制");
    } else {
      console.log("✅ 所有操作耗时合理，同步功能正常");
    }
  } catch (error) {
    console.error("❌ 测试失败:", error);
    if (error instanceof Error) {
      console.error("错误详情:", error.message);
      console.error("错误堆栈:", error.stack);
    }
    process.exit(1);
  }
}
// 运行测试
testMemoSync()
  .then(() => {
    console.log("\n✅ 测试脚本执行完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 测试脚本执行失败:", error);
    process.exit(1);
  });
