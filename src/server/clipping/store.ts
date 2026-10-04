import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { link, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { getActiveLocalBasePath } from "@/config/paths";
import {
  type ClippingReading,
  composeClippingMemo,
  recognizeMemoClipping,
} from "@/lib/memo-clipping";

const identitySchema = z
  .string()
  .regex(/^(?:[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/);
const stepSchema = z.enum(["pending", "processing", "completed", "failed"]);
export const clippingVersionSchema = z.object({
  id: identitySchema,
  revision: z.number().int().positive(),
  targetUrl: z.string(),
  createdAt: z.number(),
  capturedAt: z.number().nullable().default(null),
  finalUrl: z.string().nullable().default(null),
  sourceHash: z.string().nullable().default(null),
  pageTitle: z.string().nullable().default(null),
  warning: z.string().nullable().default(null),
  modelId: z.string().nullable().default(null),
  promptVersion: z.string().default("memo-clipping/1"),
  jobConversationId: z.string().nullable().default(null),
  status: z.enum(["queued", "processing", "completed", "failed"]).default("queued"),
  summaryState: stepSchema.default("pending"),
  translationState: stepSchema.default("pending"),
  segmentCount: z.number().int().nonnegative().default(0),
  translatedSegments: z.number().int().nonnegative().default(0),
  attempts: z.number().int().nonnegative().default(0),
  error: z.string().nullable().default(null),
});
export type ClippingVersion = z.infer<typeof clippingVersionSchema>;

export const clippingManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: identitySchema,
  memoId: z.string(),
  creatorId: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  deleted: z.boolean().default(false),
  targetUrl: z.string().nullable(),
  conversationId: z.string().nullable(),
  previousConversations: z.array(z.object({ targetUrl: z.string(), conversationId: z.string() })),
  currentVersionId: identitySchema.nullable(),
  activeVersionId: identitySchema.nullable().default(null),
  versions: z.array(clippingVersionSchema),
});
export type ClippingManifest = z.infer<typeof clippingManifestSchema>;

export function clippingStoragePaths() {
  const directory = dirname(resolve(process.env.DB_PATH || "./sqlite.db"));
  return {
    content: resolve(process.env.CLIPPING_CONTENT_BASE_PATH || join(directory, "clippings")),
    runtime: resolve(process.env.PI_DURABLE_DB_PATH || join(directory, "pi-durable.sqlite")),
  };
}

function inside(root: string, path: string) {
  const part = relative(root, path);
  return part === "" || (!part.startsWith("..") && !isAbsolute(part));
}

export async function readAuthoredMemo(memoId: string) {
  const base = getActiveLocalBasePath();
  if (!base) throw new Error("未配置本地内容目录。");
  const root = await realpath(base);
  const path = resolve(root, memoId.replace(/^\/+/, ""));
  if (!inside(root, path)) throw new Error("Invalid memo content path");
  const actual = await realpath(path);
  if (!inside(root, actual)) throw new Error("Invalid memo content symlink");
  const raw = await readFile(actual, "utf8");
  const parsed = matter(raw);
  return {
    path: actual,
    raw,
    body: parsed.content,
    frontmatter: parsed.data as Record<string, unknown>,
  };
}

export function clippingIdForMemo(memoId: string, frontmatter: Record<string, unknown>) {
  const reference = frontmatter.clipping;
  if (reference && typeof reference === "object" && "id" in reference) {
    const parsed = identitySchema.safeParse(reference.id);
    if (parsed.success) return parsed.data;
  }
  return createHash("sha256").update(memoId).digest("hex");
}

/** Only a trusted create call supplies the immutable creator reference. */
export async function attachClippingReference(
  body: string,
  frontmatter: Record<string, unknown>,
  creatorId: string | null,
  memoId: string
) {
  if (recognizeMemoClipping(body, frontmatter).enabled && !frontmatter.clipping) {
    const id = randomUUID();
    const store = new ClippingStore();
    await store.validateBoundary();
    const keyPath = join(store.root, "identity.key");
    const candidate = `${keyPath}.${randomUUID()}.tmp`;
    await writeFile(candidate, randomBytes(32), { flag: "wx", mode: 0o600 });
    try {
      await link(candidate, keyPath);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
        throw error;
    } finally {
      await unlink(candidate);
    }
    const key = await readFile(keyPath);
    const proof = createHmac("sha256", key)
      .update(JSON.stringify([memoId, id, creatorId]))
      .digest("hex");
    frontmatter.clipping = { id, creatorId, proof };
  }
}

export async function clippingCreator(frontmatter: Record<string, unknown>, memoId: string) {
  const reference = frontmatter.clipping;
  if (
    !reference ||
    typeof reference !== "object" ||
    !("creatorId" in reference) ||
    typeof reference.creatorId !== "string" ||
    !("id" in reference) ||
    typeof reference.id !== "string" ||
    !("proof" in reference) ||
    typeof reference.proof !== "string" ||
    !/^[a-f0-9]{64}$/.test(reference.proof)
  )
    return null;
  let key: Buffer;
  try {
    key = await readFile(join(clippingStoragePaths().content, "identity.key"));
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key)
    .update(JSON.stringify([memoId, reference.id, reference.creatorId]))
    .digest();
  return timingSafeEqual(expected, Buffer.from(reference.proof, "hex"))
    ? reference.creatorId
    : null;
}

export class ClippingStore {
  beforePublish?: () => void;
  constructor(readonly root = clippingStoragePaths().content) {}

  private path(id: string, ...parts: string[]) {
    return join(this.root, identitySchema.parse(id), ...parts);
  }

  async validateBoundary() {
    const base = getActiveLocalBasePath();
    await mkdir(this.root, { recursive: true });
    const actual = await realpath(this.root);
    if (base && inside(await realpath(base), actual)) {
      throw new Error("剪藏材料目录必须位于公开内容根目录之外。");
    }
  }

  async manifest(id: string): Promise<ClippingManifest | null> {
    try {
      return clippingManifestSchema.parse(
        JSON.parse(await readFile(this.path(id, "manifest.json"), "utf8"))
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        return null;
      throw new Error("剪藏版本记录无法读取，请检查存储或从备份恢复。", { cause: error });
    }
  }

  async save(manifest: ClippingManifest) {
    await this.atomic(
      this.path(manifest.id, "manifest.json"),
      JSON.stringify(clippingManifestSchema.parse(manifest))
    );
  }

  async read(
    id: string,
    versionId: string,
    artifact: "source" | "summary" | "translation" | number
  ) {
    const name = typeof artifact === "number" ? `segments/${artifact}.md` : `${artifact}.md`;
    if (typeof artifact === "number" && (!Number.isSafeInteger(artifact) || artifact < 0)) {
      throw new Error("Invalid translation segment");
    }
    try {
      return await readFile(this.path(id, identitySchema.parse(versionId), name), "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        return null;
      throw error;
    }
  }

  async write(
    id: string,
    versionId: string,
    artifact: "source" | "summary" | "translation" | number,
    content: string
  ) {
    const name = typeof artifact === "number" ? `segments/${artifact}.md` : `${artifact}.md`;
    if (typeof artifact === "number" && (!Number.isSafeInteger(artifact) || artifact < 0)) {
      throw new Error("Invalid translation segment");
    }
    await this.atomic(this.path(id, identitySchema.parse(versionId), name), content);
  }

  private async atomic(path: string, content: string) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    this.beforePublish?.();
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    this.beforePublish?.();
    await rename(temporary, path);
  }
}

export async function projectClippingMemo(
  memoId: string,
  store = new ClippingStore(),
  includeArticle = false
) {
  const authored = await readAuthoredMemo(memoId);
  const recognition = recognizeMemoClipping(authored.body, authored.frontmatter);
  if (!recognition.enabled) return null;
  const id = clippingIdForMemo(memoId, authored.frontmatter);
  const manifest = await store.manifest(id);
  if (manifest && manifest.memoId !== memoId) throw new Error("剪藏引用不属于当前闪念。");
  const current = manifest?.versions.find((version) => version.id === manifest.currentVersionId);
  const latest =
    manifest?.versions.find((version) => version.id === manifest.activeVersionId) ??
    manifest?.versions.at(-1);
  const pendingTarget = recognition.targetUrl !== manifest?.targetUrl;
  const visible =
    !manifest?.deleted && manifest?.enabled
      ? (current ?? (latest?.sourceHash ? latest : undefined))
      : undefined;
  const summary = visible ? await store.read(id, visible.id, "summary") : null;
  const source = includeArticle && visible ? await store.read(id, visible.id, "source") : null;
  const reading: ClippingReading = {
    targetUrl: recognition.targetUrl,
    sourceUrl: visible?.targetUrl ?? recognition.targetUrl,
    versionId: visible?.id ?? null,
    status: recognition.error ? "invalid" : pendingTarget ? "queued" : (latest?.status ?? "queued"),
    summaryState: pendingTarget ? "pending" : (latest?.summaryState ?? "pending"),
    translationState: latest?.translationState ?? "pending",
    sourceTranslationState: visible?.translationState ?? "pending",
    translatedSegments: latest?.translatedSegments ?? 0,
    segmentCount: latest?.segmentCount ?? 0,
    error: recognition.error ?? (pendingTarget ? null : latest?.error) ?? null,
    warning: visible?.warning ?? null,
    usingPreviousVersion: Boolean(visible && (pendingTarget || visible.id !== latest?.id)),
  };
  return {
    id,
    authored,
    recognition,
    manifest,
    reading,
    content: composeClippingMemo(recognition.remarks, summary),
    title: recognition.authorTitle ?? visible?.pageTitle ?? recognition.linkLabel ?? null,
    source,
    translation: includeArticle && visible ? await store.read(id, visible.id, "translation") : null,
  };
}
