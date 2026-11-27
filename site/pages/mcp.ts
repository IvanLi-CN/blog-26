// Server-rendered for the console. A static build cannot opt a fixed-path
// endpoint out of prerendering, so the demo build deletes the resulting
// artifact; the non-console branch below only answers if it is reached.
export const prerender = process.env.BLOG_BUILD_TARGET !== "console";

export async function ALL({ request }: { request: Request }) {
  if (process.env.BLOG_BUILD_TARGET !== "console") {
    return new Response("Not Found", { status: 404 });
  }
  const { handleMcpHttpRequest } = await import("@/server/mcp-http");
  return handleMcpHttpRequest(request);
}
