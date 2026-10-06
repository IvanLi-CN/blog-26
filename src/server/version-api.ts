export interface ProductVersionInfo {
  productVersion: string | null;
  buildVersion: string;
  sourceSha: string;
}

export function handleVersionRequest(request: Request, metadata: ProductVersionInfo): Response {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    allow: "GET, HEAD",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    return Response.json({ error: "Method Not Allowed" }, { status: 405, headers });
  }
  const body = JSON.stringify({
    productVersion: metadata.productVersion,
    buildVersion: metadata.buildVersion,
    sourceSha: metadata.sourceSha,
  });
  return new Response(request.method === "HEAD" ? null : body, { headers });
}
