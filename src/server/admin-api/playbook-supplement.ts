import { timingSafeEqual } from "node:crypto";
import { ZodError, z } from "zod";
import { getRuntimePlaybookStore, type PlaybookStore } from "@/lib/playbook/cache";
import { parseJson } from "@/lib/playbook/manifest";
import { PLAYBOOK_MAX_BUNDLE_BYTES, sourceSchema } from "@/lib/playbook/schema";
import { samePlaybookSource, validatePlaybookSupplement } from "@/lib/playbook/supplement";

// The receiver carries the parsed projection and base64 copies of both package files.
const MAX_REQUEST_BYTES = PLAYBOOK_MAX_BUNDLE_BYTES * 3;
const supplementFilesSchema = z
  .object({
    catalog: z.string(),
    search: z.string(),
  })
  .strict();
const inputSchema = z
  .object({
    source: sourceSchema,
    supplement: z.unknown().nullable(),
    supplementFiles: supplementFilesSchema.optional(),
    supplementStatus: z.literal("invalid").optional(),
    rollback: z.boolean().optional(),
  })
  .strict();

function json(data: unknown, status: number) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function hasSyncToken(request: Request) {
  const expected = process.env.PLAYBOOK_SUPPLEMENT_SYNC_TOKEN?.trim();
  if (!expected) return false;
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const actual = Buffer.from(authorization.slice("Bearer ".length));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function decodeSupplementFiles(value: z.infer<typeof supplementFilesSchema>) {
  const decode = (encoded: string, path: string) => {
    const bytes = Buffer.from(encoded, "base64");
    if (!encoded || bytes.toString("base64") !== encoded)
      throw new Error(`Invalid supplement file encoding: ${path}`);
    return bytes;
  };
  return new Map<string, Uint8Array>([
    ["catalog.json", decode(value.catalog, "catalog.json")],
    ["search-documents.json", decode(value.search, "search-documents.json")],
  ]);
}

async function readJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES)
    throw new Error("Playbook supplement request is too large");
  if (!request.body) throw new Error("Playbook supplement request has no body");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) throw new Error("Playbook supplement request is too large");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    return parseJson(new TextDecoder().decode(Buffer.concat(parts)));
  } catch (error) {
    throw new SyntaxError(error instanceof Error ? error.message : "Invalid JSON");
  }
}

export async function handlePlaybookSupplementSyncRequest(
  request: Request,
  store: PlaybookStore = getRuntimePlaybookStore()
) {
  if (request.method !== "PUT")
    return json({ error: { code: "METHOD_NOT_SUPPORTED", message: "Method PUT required" } }, 405);
  if (!process.env.PLAYBOOK_SUPPLEMENT_SYNC_TOKEN?.trim())
    return json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Playbook supplement sync is disabled" } },
      503
    );
  if (!hasSyncToken(request))
    return json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
  if (!(request.headers.get("content-type") || "").includes("application/json"))
    return json(
      { error: { code: "BAD_REQUEST", message: "Content-Type must be application/json" } },
      400
    );

  try {
    const input = inputSchema.parse(await readJson(request));
    let rawFiles: Map<string, Uint8Array> | undefined;
    let supplement: ReturnType<typeof validatePlaybookSupplement> | undefined;
    if (input.supplement !== null) {
      try {
        rawFiles = input.supplementFiles ? decodeSupplementFiles(input.supplementFiles) : undefined;
        if (!rawFiles) throw new Error("Supplement file bytes are required");
        supplement = validatePlaybookSupplement(input.supplement, rawFiles);
      } catch (error) {
        try {
          await store.updateSupplement(input.source, undefined, undefined, {
            allowRollback: input.rollback === true,
            allowSameSourceRetry: true,
          });
        } catch (cleanupError) {
          console.warn(
            `Could not persist invalid Playbook supplement tombstone: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
          );
        }
        throw error;
      }
    }
    if (input.supplement !== null && input.supplementStatus !== undefined)
      throw new Error("Supplement status is only valid when supplement is absent");
    await store.load();
    const result = await store.updateSupplement(input.source, supplement, rawFiles, {
      allowRollback: input.rollback === true,
      allowSameSourceRetry: input.supplementStatus === "invalid",
    });
    const current = store.current?.edition.source;
    return json(
      {
        accepted: true,
        source: result.source,
        supplementAvailable: result.supplementAvailable,
        currentSource: current ?? null,
        currentSourceMatches: current ? samePlaybookSource(current, result.source) : false,
      },
      200
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError)
      return json({ error: { code: "BAD_REQUEST", message: "Invalid supplement payload" } }, 400);
    if (error instanceof Error && error.message.includes("too large"))
      return json({ error: { code: "PAYLOAD_TOO_LARGE", message: error.message } }, 413);
    return json(
      { error: { code: "BAD_REQUEST", message: "Supplement could not be accepted" } },
      400
    );
  }
}
