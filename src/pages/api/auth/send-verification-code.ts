import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db, initializeDB } from '~/lib/db';
import { emailVerificationCodes, users } from '~/lib/schema';

export const prerender = false;

const sendCodeSchema = z.object({
  email: z.string().email(),
});

export const POST: APIRoute = async ({ request }) => {
  await initializeDB();

  const body = await request.json();
  const validation = sendCodeSchema.safeParse(body);

  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), { status: 400 });
  }

  const { email } = validation.data;

  try {
    // Check if user exists
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      // Per plan, we only send codes to existing users.
      // Silently succeed to not reveal if an email is registered.
      return new Response(JSON.stringify({ message: 'If your email is registered, you will receive a code.' }), {
        status: 200,
      });
    }

    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    await db.insert(emailVerificationCodes).values({
      id: `evc_${uuidv4()}`,
      email,
      code,
      expiresAt,
    });

    // --- Development Only: Log code to console ---
    console.log(`\n--- Email Verification ---`);
    console.log(`Email: ${email}`);
    console.log(`Code: ${code}`);
    console.log(`--------------------------\n`);
    // --- End Development Only ---

    // In production, you would send the email here.

    return new Response(JSON.stringify({ message: 'Verification code sent.' }), { status: 200 });
  } catch (error) {
    console.error('Failed to send verification code:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
