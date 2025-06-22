import fs from 'node:fs/promises';
import path from 'node:path';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    // Resolve the path to mermaid.min.js within node_modules
    const mermaidPath = path.resolve(process.cwd(), 'node_modules/mermaid/dist/mermaid.min.js');

    // Read the file content
    const mermaidScript = await fs.readFile(mermaidPath, 'utf-8');

    return new Response(mermaidScript, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        // Add caching headers for better performance
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Failed to serve mermaid.min.js:', error);
    return new Response('Internal Server Error: Could not load mermaid.min.js', {
      status: 500,
    });
  }
};
