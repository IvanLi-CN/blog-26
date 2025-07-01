import type { APIRoute } from 'astro';
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const prerender = false;

import { z } from 'zod';
import { getAvatarUrl } from '~/lib/avatar';
import { verifyCaptcha } from '~/lib/captcha';
import { config } from '~/lib/config';
import { db, initializeDB } from '~/lib/db';
import { generateMentionNotificationEmailHTML, generateReplyNotificationEmailHTML, sendEmail } from '~/lib/email';
import { signJwt, verifyJwt } from '~/lib/jwt';
import { comments, users } from '~/lib/schema';

const postCommentSchema = z.object({
  postSlug: z.string(),
  content: z.string().min(1).max(1000),
  parentId: z.string().optional(),
  captchaResponse: z.string().optional(),
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
  let authorNickname: string | undefined;
  let authorEmail: string | undefined;

  // 1. Check for existing JWT from cookie
  const tokenFromCookie = astroCookies.get('token');
  if (tokenFromCookie?.value) {
    try {
      const payload = await verifyJwt(tokenFromCookie.value);
      if (
        typeof payload.sub === 'string' &&
        typeof payload.nickname === 'string' &&
        typeof payload.email === 'string'
      ) {
        userId = payload.sub;
        authorNickname = payload.nickname;
        authorEmail = payload.email;
      }
    } catch (_error) {
      // Invalid or expired token, proceed as a guest.
    }
  }

  // 2. Validate request body
  const body = await request.json();
  const validation = postCommentSchema.safeParse(body);
  if (!validation.success) {
    return new Response(JSON.stringify(validation.error.flatten()), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { postSlug, content, parentId, author, captchaResponse } = validation.data;

  // 3a. Verify Captcha for anonymous users, before any DB transaction
  if (!userId) {
    if (!captchaResponse) {
      return new Response(JSON.stringify({ error: 'Captcha response is required.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const isHuman = await verifyCaptcha(captchaResponse);
    if (!isHuman) {
      return new Response(JSON.stringify({ error: 'Captcha verification failed.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

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
          // If user exists, they must verify via email to log in.
          throw new Error('Email verification required');
        } else {
          // Check for nickname uniqueness
          const nicknameExists = tx.select().from(users).where(eq(users.nickname, author.nickname)).get();
          if (nicknameExists) {
            throw new Error('Nickname is already taken.');
          }
          userId = `user_${uuidv4()}`;
          authorNickname = author.nickname;
          authorEmail = author.email;
          await tx.insert(users).values({
            id: userId,
            nickname: author.nickname,
            email: author.email,
            ipAddress,
            createdAt: Date.now(),
          });
          // Sign a new JWT for the new user
          newJwt = await signJwt({ sub: userId, nickname: authorNickname, email: authorEmail });
        }
      }

      // 4. Insert the comment
      const commentId = `comm_${uuidv4()}`;
      await tx.insert(comments).values({
        id: commentId,
        postSlug,
        content,
        parentId,
        authorId: userId,
        ipAddress,
        status: 'pending',
        createdAt: Date.now(),
      });
    });

    // 5. Send notifications asynchronously
    if (userId && authorNickname) {
      sendNotifications(postSlug, content, parentId, userId, authorNickname);
    }
  } catch (error: any) {
    if (error.message.includes('Email verification required')) {
      return new Response(JSON.stringify({ error: 'Email verification required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (
      error.message.includes('UNIQUE constraint failed: users.nickname') ||
      error.message.includes('Nickname is already taken.')
    ) {
      return new Response(JSON.stringify({ error: 'Nickname is already taken.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('Failed to post comment:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (newJwt) {
    astroCookies.set('token', newJwt, {
      httpOnly: true,
      path: '/',
      maxAge: 31536000, // 1 year
      secure: config.env.isProduction,
      sameSite: 'lax',
    });
  }

  return new Response(JSON.stringify({ message: 'Comment submitted and awaiting approval.' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};

async function sendNotifications(
  postSlug: string,
  content: string,
  parentId: string | undefined,
  authorId: string,
  authorNickname: string
) {
  try {
    const notificationRecipients = new Map<string, { nickname: string; type: 'reply' | 'mention' }>();

    // a. Handle reply notifications
    if (parentId) {
      const parentComment = await db
        .select({
          author: {
            id: users.id,
            nickname: users.nickname,
            email: users.email,
          },
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.id, parentId))
        .get();

      if (parentComment?.author && parentComment.author.id !== authorId) {
        notificationRecipients.set(parentComment.author.email, {
          nickname: parentComment.author.nickname,
          type: 'reply',
        });
      }
    }

    // b. Handle @mention notifications
    const mentionedNicknames = [...content.matchAll(/@(\w+)/g)].map((match) => match[1]);
    if (mentionedNicknames.length > 0) {
      const mentionedUsers = await db
        .select({ nickname: users.nickname, email: users.email })
        .from(users)
        .where(and(inArray(users.nickname, mentionedNicknames), ne(users.id, authorId)))
        .all();

      for (const user of mentionedUsers) {
        if (!notificationRecipients.has(user.email)) {
          notificationRecipients.set(user.email, { nickname: user.nickname, type: 'mention' });
        }
      }
    }

    // c. Send emails
    for (const [email, recipient] of notificationRecipients.entries()) {
      if (recipient.type === 'reply') {
        const html = generateReplyNotificationEmailHTML(recipient.nickname, postSlug, authorNickname, content);
        await sendEmail({
          to: email,
          subject: `您在文章的留言收到了新的回复`,
          text: `${authorNickname} 给您留了个言: ${content}`,
          html,
        });
      } else {
        const html = generateMentionNotificationEmailHTML(recipient.nickname, postSlug, authorNickname, content);
        await sendEmail({
          to: email,
          subject: `有人在留言中提及了您`,
          text: `${authorNickname} 在留言中提及了您: ${content}`,
          html,
        });
      }
    }
  } catch (error) {
    console.error('Failed to send message notifications:', error);
  }
}

const getCommentsSchema = z.object({
  slug: z.string().min(1, { message: 'Slug is required.' }),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CommentWithAuthorAndReplies = Awaited<ReturnType<typeof getComments>>[0];

export async function getComments(slug: string, currentUserId?: string, isAdmin: boolean = false) {
  const whereClauses = [eq(comments.postSlug, slug)];

  if (isAdmin) {
    whereClauses.push(inArray(comments.status, ['approved', 'pending']));
  } else {
    const statusClauses = [eq(comments.status, 'approved')];
    if (currentUserId) {
      const userPending = and(eq(comments.authorId, currentUserId), eq(comments.status, 'pending'));
      if (userPending) {
        statusClauses.push(userPending);
      }
    }
    const finalStatusCondition = or(...statusClauses.filter(Boolean));
    if (finalStatusCondition) {
      whereClauses.push(finalStatusCondition);
    }
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
        email: users.email,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(and(...whereClauses))
    .orderBy(comments.createdAt);

  return allCommentsForPost
    .filter(
      (
        c
      ): c is Omit<typeof c, 'author'> & {
        author: NonNullable<(typeof c)['author']>;
      } => c.author !== null
    )
    .map((c) => {
      const { email, ...authorWithoutEmail } = c.author;
      return {
        ...c,
        author: {
          ...authorWithoutEmail,
          avatarUrl: getAvatarUrl(email),
        },
      };
    });
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
    return new Response(JSON.stringify(validation.error.flatten()), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { slug, page, limit } = validation.data;
  const offset = (page - 1) * limit;

  let currentUserId: string | undefined;
  let isAdmin = false;

  // 首先检查 Traefik SSO 请求头
  const { email: adminEmail, emailHeaderName } = config.admin;
  const emailFromHeader = request.headers.get(emailHeaderName);
  if (adminEmail && emailFromHeader === adminEmail) {
    isAdmin = true;
  }

  // 然后检查 JWT token
  const tokenFromCookie = astroCookies.get('token');
  if (tokenFromCookie?.value) {
    try {
      const payload = await verifyJwt(tokenFromCookie.value);
      if (typeof payload.sub === 'string') {
        currentUserId = payload.sub;
      }
      if (typeof payload.email === 'string' && payload.email === adminEmail) {
        isAdmin = true;
      }
    } catch (_e) {
      // Invalid or expired token. Treat as guest.
    }
  }

  const allComments = await getComments(slug, currentUserId, isAdmin);
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
      isAdmin,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
