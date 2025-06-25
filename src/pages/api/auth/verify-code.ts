import type { APIRoute } from 'astro';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db, initializeDB } from '~/lib/db';
import { signJwt } from '~/lib/jwt';
import { emailVerificationCodes, users } from '~/lib/schema';

export const prerender = false;

const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Verification code must be 6 digits.'),
});

export const POST: APIRoute = async ({ request, cookies: astroCookies }) => {
  await initializeDB();

  const body = await request.json();
  const validation = verifyCodeSchema.safeParse(body);

  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { email, code } = validation.data;

  try {
    const verificationRecord = await db
      .select()
      .from(emailVerificationCodes)
      .where(
        and(
          eq(emailVerificationCodes.email, email),
          eq(emailVerificationCodes.code, code),
          gt(emailVerificationCodes.expiresAt, Date.now())
        )
      )
      .get();

    if (!verificationRecord) {
      return new Response(JSON.stringify({ error: 'Invalid or expired verification code.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let newJwt: string | undefined;

    await db.transaction(async (tx) => {
      const user = await tx
        .select({
          id: users.id,
          nickname: users.nickname,
          email: users.email,
        })
        .from(users)
        .where(eq(users.email, email))
        .get();

      if (!user) {
        // This case should not happen if send-code logic is correct (as it only sends to existing users)
        // For now, we will throw an error to be safe. In the future, you might want to handle this more gracefully.
        throw new Error('User not found after verification.');
      }

      // Invalidate the code
      await tx.delete(emailVerificationCodes).where(eq(emailVerificationCodes.id, verificationRecord.id));

      // Sign a new JWT
      newJwt = await signJwt({ sub: user.id, nickname: user.nickname, email: user.email });
    });

    if (newJwt) {
      astroCookies.set('token', newJwt, {
        httpOnly: true,
        path: '/',
        maxAge: 31536000, // 1 year
        secure: import.meta.env.PROD,
        sameSite: 'lax',
      });
      return new Response(JSON.stringify({ message: 'Email verified successfully.' }), { status: 200 });
    }

    // Fallback error if JWT was not generated
    throw new Error('Failed to generate session token.');
  } catch (error) {
    console.error('Failed to verify code:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
