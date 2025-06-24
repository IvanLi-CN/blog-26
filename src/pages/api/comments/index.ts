import type { APIRoute } from 'astro';
import { and, eq, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const prerender = false;

import { z } from 'zod';
import { db, initializeDB } from '~/lib/db';
import { signJwt, verifyJwt } from '~/lib/jwt';
import { comments, users } from '~/lib/schema';

const postCommentSchema = z.object({
  postSlug: z.string(),
  content: z.string().min(1).max(1000),
  parentId: z.string().uuid().optional(),
  author: z
    .object({
      nickname: z.string().min(2).max(50),
      email: z.string().email(),
    })
    .optional(),
});

export const POST: APIRoute = async ({ request, clientAddress, cookies: astroCookies }) => {
  await initializeDB();
  const ipAddress = clientAddress;
  let userId: string | undefined;
  let userNickname: string | undefined;

  // 1. Check for existing JWT from cookie
  const tokenFromCookie = astroCookies.get('token');
  if (tokenFromCookie?.value) {
    try {
      const payload = await verifyJwt(tokenFromCookie.value);
      if (typeof payload.sub === 'string') {
        userId = payload.sub;
      }
    } catch (_error) {
      // Invalid or expired token, proceed as a guest.
    }
  }

  // 2. Validate request body
  const body = await request.json();
  const validation = postCommentSchema.safeParse(body);
  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), { status: 400 });
  }
  const { postSlug, content, parentId, author } = validation.data;

  let newJwt: string | undefined;

  try {
    await db.transaction(async (tx) => {
      // 3. Handle user creation/retrieval
      if (!userId) {
        if (!author) {
          throw new Error('Author information is required for anonymous comments.');
        }
        const existingUser = tx.select().from(users).where(eq(users.email, author.email)).get();
        if (existingUser) {
          userId = existingUser.id;
          userNickname = existingUser.nickname;
        } else {
          // Check for nickname uniqueness
          const nicknameExists = tx.select().from(users).where(eq(users.nickname, author.nickname)).get();
          if (nicknameExists) {
            throw new Error('Nickname is already taken.');
          }
          userId = `user_${uuidv4()}`;
          userNickname = author.nickname;
          await tx.insert(users).values({
            id: userId,
            nickname: author.nickname,
            email: author.email,
            ipAddress,
            createdAt: Date.now(),
          });
        }
        // Sign a new JWT for the user
        newJwt = await signJwt({ sub: userId, nickname: userNickname, email: author.email });
      }

      // 4. Insert the comment
      await tx.insert(comments).values({
        id: `comm_${uuidv4()}`,
        postSlug,
        content,
        parentId,
        authorId: userId,
        ipAddress,
        status: 'pending',
        createdAt: Date.now(),
      });
    });
  } catch (error: any) {
    if (
      error.message.includes('UNIQUE constraint failed: users.nickname') ||
      error.message.includes('Nickname is already taken.')
    ) {
      return new Response(JSON.stringify({ error: 'Nickname is already taken.' }), { status: 409 });
    }
    console.error('Failed to post comment:', error);
    return new Response('Internal Server Error', { status: 500 });
  }

  if (newJwt) {
    astroCookies.set('token', newJwt, {
      httpOnly: true,
      path: '/',
      maxAge: 31536000, // 1 year
      secure: import.meta.env.PROD,
      sameSite: 'lax',
    });
  }

  return new Response(JSON.stringify({ message: 'Comment submitted and awaiting approval.' }), { status: 201 });
};

const getCommentsSchema = z.object({
  slug: z.string().min(1, { message: 'Slug is required.' }),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CommentWithAuthorAndReplies = Awaited<ReturnType<typeof getComments>>[0];

export async function getComments(slug: string, currentUserId?: string) {
  const whereClauses = [eq(comments.postSlug, slug)];
  const statusClauses = [eq(comments.status, 'approved')];

  if (currentUserId) {
    statusClauses.push(eq(comments.authorId, currentUserId));
  }

  const statusCondition = or(...statusClauses);
  if (statusCondition) {
    whereClauses.push(statusCondition);
  }

  const allCommentsForPost = await db
    .select({
      id: comments.id,
      content: comments.content,
      parentId: comments.parentId,
      status: comments.status,
      createdAt: comments.createdAt,
      author: {
        id: users.id,
        nickname: users.nickname,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(and(...whereClauses))
    .orderBy(comments.createdAt);

  return allCommentsForPost.filter((c) => c.author !== null) as Array<
    Omit<(typeof allCommentsForPost)[number], 'author'> & {
      author: NonNullable<(typeof allCommentsForPost)[number]['author']>;
    }
  >;
}

export const GET: APIRoute = async ({ request, cookies: astroCookies }) => {
  await initializeDB();

  const requestUrl = new URL(request.url);
  const sp = requestUrl.searchParams;
  const dataToValidate: Record<string, any> = {
    slug: sp.get('slug'),
  };
  if (sp.has('page')) dataToValidate.page = sp.get('page');
  if (sp.has('limit')) dataToValidate.limit = sp.get('limit');

  const validation = getCommentsSchema.safeParse(dataToValidate);

  if (!validation.success) {
    console.error('GET /api/comments validation failed:', validation.error.flatten());
    return new Response(JSON.stringify(validation.error.flatten()), { status: 400 });
  }

  const { slug, page, limit } = validation.data;
  const offset = (page - 1) * limit;

  let currentUserId: string | undefined;
  const tokenFromCookie = astroCookies.get('token');
  if (tokenFromCookie?.value) {
    try {
      const payload = await verifyJwt(tokenFromCookie.value);
      if (typeof payload.sub === 'string') {
        currentUserId = payload.sub;
      }
    } catch (_e) {
      // Invalid or expired token. Treat as guest.
      // To be strict, you could return a 401 here if a token exists but is invalid.
      // For now, we'll just ignore it.
    }
  }

  const allComments = await getComments(slug, currentUserId);
  const topLevelComments = allComments.filter((c) => !c.parentId);

  const paginatedTopLevelComments = topLevelComments.slice(offset, offset + limit);

  const getReplies = (commentId: string): CommentWithAuthorAndReplies[] => {
    return allComments.filter((c) => c.parentId === commentId);
  };

  const finalComments = paginatedTopLevelComments.map((c) => ({
    ...c,
    replies: getReplies(c.id).map((reply) => ({
      ...reply,
      replies: [], // Max 2 levels of nesting
    })),
  }));

  return new Response(
    JSON.stringify({
      comments: finalComments,
      totalPages: Math.ceil(topLevelComments.length / limit),
    }),
    { status: 200 }
  );
};
