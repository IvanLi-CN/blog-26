export const prerender =
  process.env.BLOG_BUILD_TARGET !== "console" && process.env.WEB_DEMO_BUILD !== "true";

export async function ALL({ request }: { request: Request }) {
  if (process.env.BLOG_BUILD_TARGET !== "console") {
    return new Response("Not Found", { status: 404 });
  }
  const { handleMcpHttpRequest } = await import("@/server/mcp-http");
  return handleMcpHttpRequest(request);
}
