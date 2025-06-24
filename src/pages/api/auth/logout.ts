import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete('token', { path: '/' });
  return new Response(JSON.stringify({ message: 'Logged out successfully' }), { status: 200 });
};
