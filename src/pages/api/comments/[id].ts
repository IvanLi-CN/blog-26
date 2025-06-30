import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '~/lib/config';
import { db, initializeDB } from '~/lib/db';
import { verifyJwt } from '~/lib/jwt';
import { comments } from '~/lib/schema';

export const prerender = false;

const updateCommentSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const commentId = params.id;
  if (!commentId) {
    return new Response(JSON.stringify({ error: 'Comment ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. Authenticate and authorize the user
  const token = cookies.get('token')?.value;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: any;
  try {
    payload = await verifyJwt(token);
  } catch (_err) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userEmail = payload.email;
  const { email: adminEmail } = config.admin;

  if (!adminEmail || userEmail !== adminEmail) {
    return new Response(JSON.stringify({ error: 'Forbidden: User is not an administrator' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Validate the request body
  const body = await request.json();
  const validation = updateCommentSchema.safeParse(body);

  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { status } = validation.data;

  // 3. Update the comment status in the database
  try {
    await initializeDB();
    const updatedComment = await db.update(comments).set({ status }).where(eq(comments.id, commentId)).returning();

    if (updatedComment.length === 0) {
      return new Response(JSON.stringify({ error: 'Comment not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updatedComment[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to update comment status:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
