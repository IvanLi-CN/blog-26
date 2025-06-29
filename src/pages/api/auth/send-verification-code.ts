import type { APIRoute } from 'astro';
// import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db, initializeDB } from '~/lib/db';
import { generateVerificationEmailHTML, sendEmail } from '~/lib/email';
import { emailVerificationCodes } from '~/lib/schema';

export const prerender = false;

const sendCodeSchema = z.object({
  email: z.string().email(),
});

export const POST: APIRoute = async ({ request }) => {
  await initializeDB();

  const body = await request.json();
  const validation = sendCodeSchema.safeParse(body);

  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { email } = validation.data;

  try {
    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    await db.insert(emailVerificationCodes).values({
      id: `evc_${uuidv4()}`,
      email,
      code,
      expiresAt,
    });

    // Send verification email
    const emailHtml = generateVerificationEmailHTML(code);
    await sendEmail({
      to: email,
      subject: '您的登录验证码',
      text: `您的登录验证码是: ${code}`,
      html: emailHtml,
    });

    return new Response(JSON.stringify({ message: 'Verification code sent.' }), { status: 200 });
  } catch (error) {
    console.error('Failed to send verification code:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
