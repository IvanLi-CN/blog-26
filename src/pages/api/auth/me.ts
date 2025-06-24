import type { APIRoute } from 'astro';
import type { UserInfo } from '~/components/comments/types';
import { getAvatarUrl } from '~/lib/avatar';
import { verifyJwt } from '~/lib/jwt';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get('token');

  if (!token?.value) {
    return new Response(null, { status: 401, statusText: 'No token found' });
  }

  try {
    const payload = await verifyJwt(token.value);
    if (payload.sub && typeof payload.nickname === 'string' && typeof payload.email === 'string') {
      const userInfo: UserInfo = {
        id: payload.sub,
        nickname: payload.nickname,
        email: payload.email,
        avatarUrl: getAvatarUrl(payload.email),
      };
      return new Response(JSON.stringify(userInfo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 401, statusText: 'Invalid token payload' });
  } catch {
    return new Response(null, { status: 401, statusText: 'Invalid token' });
  }
};
