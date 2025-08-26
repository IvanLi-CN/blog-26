import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getAvatarUrl } from "../../lib/avatar";
import { verifyCaptcha } from "../../lib/captcha";
import { db } from "../../lib/db";
import { generateVerificationEmailHTML, sendEmail } from "../../lib/email";
import { emailVerificationCodes, users } from "../../lib/schema";
import {
  createSession,
  deleteSession,
  extractDeviceInfo,
  extractIpAddress,
  SESSION_COOKIE_NAME,
} from "../../lib/session";
import { createTRPCRouter, publicProcedure } from "../trpc";

// 输入验证 schemas
const sendCodeSchema = z.object({
  email: z.string().email(),
});

const adminSendCodeSchema = z.object({
  email: z.string().email(),
  captchaResponse: z.string().min(1, "请完成人机验证"),
});

const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
});

export const authRouter = createTRPCRouter({
  // 获取当前用户信息
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) {
      return null;
    }
    return {
      id: ctx.user.id,
      nickname: ctx.user.nickname,
      email: ctx.user.email,
      avatarUrl: ctx.user.avatarUrl || getAvatarUrl(ctx.user.email),
      isAdmin: ctx.isAdmin,
    };
  }),

  // 登出
  logout: publicProcedure.mutation(async ({ ctx }) => {
    // 从cookie中获取session ID
    const cookieHeader = ctx.req.headers.get("cookie");
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      const sessionId = cookies[SESSION_COOKIE_NAME];

      if (sessionId) {
        // 删除session记录
        await deleteSession(sessionId);
      }
    }

    // 清除 cookie
    ctx.resHeaders.set(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    );

    return {
      success: true,
      message: "Logged out successfully",
    };
  }),

  // 发送验证码（普通用户）
  sendVerificationCode: publicProcedure.input(sendCodeSchema).mutation(async ({ input }) => {
    const { email } = input;

    try {
      // 生成验证码
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60; // 10分钟后过期（UNIX timestamp）

      // 保存验证码到数据库
      await db.insert(emailVerificationCodes).values({
        id: uuidv4(),
        email,
        code,
        expiresAt,
      });

      // 发送邮件
      const emailHTML = generateVerificationEmailHTML(code);
      await sendEmail({
        to: email,
        subject: "邮箱验证码",
        text: `您的验证码是: ${code}`,
        html: emailHTML,
      });

      return {
        success: true,
        message: "验证码已发送到您的邮箱",
      };
    } catch (error) {
      console.error("Send verification code error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "发送验证码失败",
      });
    }
  }),

  // 发送管理员验证码
  sendAdminCode: publicProcedure.input(adminSendCodeSchema).mutation(async ({ input, ctx }) => {
    const { email, captchaResponse } = input;
    const _clientAddress = ctx.clientAddress;

    // 验证人机验证码
    const isHuman = await verifyCaptcha(captchaResponse);
    if (!isHuman) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "人机验证失败，请重试",
      });
    }

    // 检查是否为管理员邮箱
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminEmail = adminEmail && email === adminEmail;

    try {
      if (isAdminEmail) {
        // 真正的管理员邮箱 - 发送真实验证码
        // 检查用户是否存在，如果不存在则创建
        let user = await db.select().from(users).where(eq(users.email, email)).get();

        if (!user) {
          // 为管理员创建用户记录
          const userId = uuidv4();
          await db.insert(users).values({
            id: userId,
            email: email,
            name: "Admin", // 默认名称
            createdAt: Date.now(),
          });

          user = await db.select().from(users).where(eq(users.email, email)).get();
        }

        if (!user) {
          throw new Error("Failed to create or find user");
        }

        // 生成验证码
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60; // 10分钟后过期（UNIX timestamp）

        // 保存验证码
        await db.insert(emailVerificationCodes).values({
          id: uuidv4(),
          email,
          code,
          expiresAt,
        });

        // 发送邮件
        const emailHTML = generateVerificationEmailHTML(code);
        await sendEmail({
          to: email,
          subject: "管理员验证码",
          text: `您的管理员验证码是: ${code}`,
          html: emailHTML,
        });

        return {
          success: true,
          message: "验证码已发送到您的邮箱",
        };
      } else {
        // 非管理员邮箱 - 假装成功（安全考虑）
        return {
          success: true,
          message: "验证码已发送到您的邮箱",
        };
      }
    } catch (error) {
      console.error("Send admin code error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "发送验证码失败",
      });
    }
  }),

  // 验证验证码并登录
  verifyCode: publicProcedure.input(verifyCodeSchema).mutation(async ({ input, ctx }) => {
    const { email, code } = input;

    try {
      // 查找最新的验证码记录
      const verificationRecord = await db
        .select()
        .from(emailVerificationCodes)
        .where(eq(emailVerificationCodes.email, email))
        .orderBy(desc(emailVerificationCodes.expiresAt))
        .get();

      if (!verificationRecord) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "验证码不存在或已过期",
        });
      }

      if (verificationRecord.code !== code) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "验证码错误",
        });
      }

      if (Math.floor(Date.now() / 1000) > verificationRecord.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "验证码已过期",
        });
      }

      // 查找或创建用户
      let user = await db.select().from(users).where(eq(users.email, email)).get();

      if (!user) {
        // 创建新用户
        const userId = uuidv4();
        await db.insert(users).values({
          id: userId,
          email,
          name: email.split("@")[0], // 使用邮箱前缀作为默认名称
          createdAt: Date.now(),
        });

        user = await db.select().from(users).where(eq(users.email, email)).get();
      }

      if (!user) {
        throw new Error("Failed to create or find user");
      }

      // 创建新的session
      const deviceInfo = extractDeviceInfo(ctx.req);
      const ipAddress = extractIpAddress(ctx.req);

      const session = await createSession({
        userId: user.id,
        deviceInfo,
        ipAddress,
      });

      // 设置 session cookie
      ctx.resHeaders.set(
        "Set-Cookie",
        `${SESSION_COOKIE_NAME}=${session.id}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`
      );

      // 删除已使用的验证码
      await db
        .delete(emailVerificationCodes)
        .where(eq(emailVerificationCodes.id, verificationRecord.id));

      return {
        success: true,
        message: "登录成功",
        user: {
          id: user.id,
          nickname: user.name || user.email.split("@")[0],
          email: user.email,
          avatarUrl: getAvatarUrl(user.email),
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("Verify code error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "验证失败",
      });
    }
  }),
});

/**
 * 简单的 Cookie 解析函数
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length > 0) {
      cookies[name] = rest.join("=");
    }
  });

  return cookies;
}
