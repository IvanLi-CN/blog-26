import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { verifyCaptcha } from '~/lib/captcha';
import { config } from '~/lib/config';
import { db, initializeDB } from '~/lib/db';
import { generateVerificationEmailHTML, sendEmail } from '~/lib/email';
import { emailVerificationCodes, users } from '~/lib/schema';

export const prerender = false;

const sendCodeSchema = z.object({
  email: z.string().email(),
  captchaResponse: z.string().min(1, '请完成人机验证'),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  await initializeDB();

  const body = await request.json();
  const validation = sendCodeSchema.safeParse(body);

  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { email, captchaResponse } = validation.data;

  // 验证螺丝帽人机验证码
  const isHuman = await verifyCaptcha(captchaResponse);
  if (!isHuman) {
    return new Response('人机验证失败，请重试', {
      status: 400,
    });
  }

  // 检查是否为管理员邮箱
  const { email: adminEmail } = config.admin;
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
          nickname: 'Admin', // 默认昵称
          ipAddress: clientAddress || '127.0.0.1', // 使用客户端IP地址
          createdAt: Date.now(), // UNIX时间戳
        });

        user = await db.select().from(users).where(eq(users.email, email)).get();
      }

      if (!user) {
        throw new Error('Failed to create or find user');
      }

      // 生成6位数字验证码
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10分钟后过期（UNIX时间戳）

      // 删除该邮箱的旧验证码
      await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, email));

      // 插入新的验证码
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
        subject: '管理员登录验证码',
        text: `您的管理员登录验证码是: ${code}`,
        html: emailHTML,
      });
    } else {
      // 非管理员邮箱 - 假装发送验证码，但不实际发送
      // 为了安全，我们延迟一下响应时间，让它看起来像真的在发送邮件
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));
    }

    // 无论是否为管理员邮箱，都返回相同的成功响应
    return new Response(JSON.stringify({ message: '验证码已发送到您的邮箱' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to send verification code:', error);
    return new Response('发送验证码失败，请重试', { status: 500 });
  }
};
