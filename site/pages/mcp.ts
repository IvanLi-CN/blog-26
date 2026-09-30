export const prerender = process.env.CONSOLE_RUNTIME !== "true";

export async function ALL({ request }: { request: Request }) {
  if (process.env.CONSOLE_RUNTIME !== "true") {
    return new Response("Not Found", { status: 404 });
  }
  const { handleMcpHttpRequest } = await import("@/server/mcp-http");
  return handleMcpHttpRequest(request);
}
