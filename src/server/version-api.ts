export interface ProductVersionInfo {
  productVersion: string | null;
  buildVersion: string;
  sourceSha: string;
}

export async function readRuntimeVersionInfo(
  file: URL,
  production: boolean
): Promise<ProductVersionInfo> {
  try {
    const metadata = z
      .object({
        productVersion: z
          .string()
          .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
          .nullable(),
        buildVersion: z.string().min(1),
        sourceSha: z.string().min(1),
      })
      .parse(JSON.parse(await readFile(file, "utf8")));
    if (production && (!metadata.productVersion || !/^[a-f0-9]{40}$/.test(metadata.sourceSha)))
      throw new Error("Production version metadata is incomplete");
    return metadata;
  } catch (error) {
    if (
      !production &&
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return { productVersion: null, buildVersion: "dev-local", sourceSha: "unknown" };
    throw error;
  }
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

import { readFile } from "node:fs/promises";
import { z } from "zod";
