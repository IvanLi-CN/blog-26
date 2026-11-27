// Server-rendered for the console; the static build skips it because it has no
// static paths.
export const prerender = process.env.BLOG_BUILD_TARGET !== "console";

export async function ALL({ request }: { request: Request }) {
  if (process.env.BLOG_BUILD_TARGET !== "console") {
    return new Response("Not Found", { status: 404 });
  }
  const { handleMcpHttpRequest } = await import("@/server/mcp-http");
  return handleMcpHttpRequest(request);
}
