#!/usr/bin/env bun

/**
 * 获取验证码的临时脚本
 * 仅用于开发环境测试
 */

import { eq } from "drizzle-orm";
import { db, initializeDB } from "./src/lib/db";
import { emailVerificationCodes } from "./src/lib/schema";

async function getVerificationCode(email: string) {
  try {
    // 初始化数据库
    await initializeDB();

    // 查询最新的验证码（按过期时间降序排列）
    const codeRecord = await db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.email, email))
      .orderBy(emailVerificationCodes.expiresAt)
      .all();

    if (!codeRecord || codeRecord.length === 0) {
      console.log(`❌ 未找到邮箱 ${email} 的验证码`);
      return;
    }

    console.log(`📧 邮箱: ${email}`);
    console.log(`📝 找到 ${codeRecord.length} 个验证码记录:`);

    const now = Math.floor(Date.now() / 1000);

    // 显示所有验证码记录，最新的在前
    codeRecord.reverse().forEach((record, index) => {
      const isExpired = now > record.expiresAt;
      console.log(`\n${index + 1}. 验证码: ${record.code}`);
      console.log(`   过期时间: ${new Date(record.expiresAt * 1000).toLocaleString()}`);
      console.log(`   状态: ${isExpired ? "已过期" : "✅ 有效"}`);
    });

    // 返回最新的验证码
    const latestCode = codeRecord[codeRecord.length - 1];
    return latestCode.code;
  } catch (error) {
    console.error("❌ 获取验证码失败:", error);
  }
}

// 从命令行参数获取邮箱地址
const email = process.argv[2] || "ivanli2048@gmail.com";
getVerificationCode(email);
