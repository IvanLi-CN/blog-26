import type { APIRoute } from 'astro';
import { parseMarkdownToHTML } from '~/utils/markdown';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid content' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const html = await parseMarkdownToHTML(content);

    return new Response(JSON.stringify({ html }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to render markdown:', error);
    return new Response(JSON.stringify({ error: 'Failed to render markdown' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
