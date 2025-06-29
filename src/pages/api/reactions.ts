import type { APIRoute } from 'astro';
import { and, count, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db, initializeDB } from '~/lib/db';
import { verifyJwt } from '~/lib/jwt';
import { reactions } from '~/lib/schema';

export const prerender = false;

// POST request schema for adding/removing a reaction
const postReactionSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string(),
  emoji: z.string().min(1),
  fingerprint: z.string().optional(),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  await initializeDB();

  const body = await request.json();
  const validation = postReactionSchema.safeParse(body);

  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), { status: 400 });
  }

  const { targetType, targetId, emoji, fingerprint } = validation.data;

  // 1. Identify the user
  let userId: string | undefined;
  const token = cookies.get('token')?.value;
  if (token) {
    try {
      const payload = await verifyJwt(token);
      if (typeof payload.sub === 'string') {
        userId = payload.sub;
      }
    } catch {
      // Invalid token, proceed as anonymous
    }
  }

  if (!userId && !fingerprint) {
    return new Response(JSON.stringify({ error: 'User identification is required.' }), { status: 401 });
  }

  // 2. Check if the reaction already exists
  const existingReaction = await db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.targetType, targetType),
        eq(reactions.targetId, targetId),
        eq(reactions.emoji, emoji),
        userId ? eq(reactions.userId, userId) : eq(reactions.fingerprint, fingerprint!)
      )
    )
    .get();

  try {
    if (existingReaction) {
      // 3a. If it exists, delete it (toggle off)
      await db.delete(reactions).where(eq(reactions.id, existingReaction.id));
    } else {
      // 3b. If it doesn't exist, create it (toggle on)
      await db.insert(reactions).values({
        id: `reac_${uuidv4()}`,
        targetType,
        targetId,
        emoji,
        userId,
        fingerprint,
        createdAt: Date.now(),
      });
    }
  } catch (error) {
    console.error('Failed to toggle reaction:', error);
    return new Response(JSON.stringify({ error: 'Database operation failed.' }), { status: 500 });
  }

  // 4. Return the new count for the specific emoji
  const result = await db
    .select({ count: count() })
    .from(reactions)
    .where(and(eq(reactions.targetType, targetType), eq(reactions.targetId, targetId), eq(reactions.emoji, emoji)))
    .get();

  return new Response(
    JSON.stringify({
      reacted: !existingReaction,
      count: result?.count ?? 0,
    }),
    { status: 200 }
  );
};

// GET request schema for fetching reactions
const getReactionsSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string(),
  fingerprint: z.string().optional(),
});

export const GET: APIRoute = async ({ request, cookies }) => {
  await initializeDB();

  const url = new URL(request.url);
  const validation = getReactionsSchema.safeParse({
    targetType: url.searchParams.get('targetType'),
    targetId: url.searchParams.get('targetId'),
    fingerprint: url.searchParams.get('fingerprint'),
  });

  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), { status: 400 });
  }

  const { targetType, targetId, fingerprint } = validation.data;

  // 1. Identify the user
  let userId: string | undefined;
  const token = cookies.get('token')?.value;
  if (token) {
    try {
      const payload = await verifyJwt(token);
      if (typeof payload.sub === 'string') {
        userId = payload.sub;
      }
    } catch {
      // Invalid token
    }
  }

  // 2. Get all reactions for the target, grouped by emoji
  const reactionCounts = await db
    .select({
      emoji: reactions.emoji,
      count: count(),
    })
    .from(reactions)
    .where(and(eq(reactions.targetType, targetType), eq(reactions.targetId, targetId)))
    .groupBy(reactions.emoji);

  // 3. Get the reactions made by the current user
  let userReactions: { emoji: string }[] = [];
  if (userId || fingerprint) {
    userReactions = await db
      .select({ emoji: reactions.emoji })
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, targetType),
          eq(reactions.targetId, targetId),
          userId ? eq(reactions.userId, userId) : eq(reactions.fingerprint, fingerprint!)
        )
      )
      .all();
  }

  const userReactedEmojis = new Set(userReactions.map((r) => r.emoji));

  // 4. Combine the data
  const response = reactionCounts.map((row) => ({
    ...row,
    userReacted: userReactedEmojis.has(row.emoji),
  }));

  return new Response(JSON.stringify({ reactions: response }), { status: 200 });
};
