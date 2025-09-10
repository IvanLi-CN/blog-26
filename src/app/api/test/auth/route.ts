import { extractAuthFromRequest } from "@/lib/auth-utils";

export async function GET(request: Request) {
  const result = await extractAuthFromRequest(request);
  return new Response(JSON.stringify(result, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
