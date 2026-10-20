import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { renameSync } from "node:fs";
import {
  link,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { getActiveLocalBasePath } from "@/config/paths";
import {
  CLIPPING_RESOURCE_MAX_BYTES,
  stripUncapturedClippingMedia,
} from "@/lib/clipping-resources";
import {
  type ClippingReading,
  composeClippingMemo,
  recognizeMemoClipping,
} from "@/lib/memo-clipping";

const identitySchema = z
  .string()
  .regex(/^(?:[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/);
const stepSchema = z.enum(["pending", "processing", "completed", "failed"]);
const clippingResourcePathSchema = z.string().regex(/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/i);
export const clippingResourceSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  originalUrl: z.string().url(),
  finalUrl: z.string().url().nullable().default(null),
  path: clippingResourcePathSchema.nullable().default(null),
  mimeType: z.string().nullable().default(null),
  bytes: z.number().int().nonnegative().default(0),
  status: z.enum(["captured", "failed"]),
  error: z.string().nullable().default(null),
});
export type ClippingResource = z.infer<typeof clippingResourceSchema>;
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
  resourcesCaptured: z.boolean().default(false),
  resources: z.array(clippingResourceSchema).default([]),
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
    const store = new ClippingStore();
    const id = clippingIdForMemo(memoId, frontmatter);
    await store.validateBoundary();
    const existing = await store.manifest(id);
    const effectiveCreatorId = existing ? existing.creatorId : creatorId;
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
      .update(JSON.stringify([memoId, id, effectiveCreatorId]))
      .digest("hex");
    frontmatter.clipping = { id, creatorId: effectiveCreatorId, proof };
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

  async readResource(id: string, versionId: string, resource: ClippingResource) {
    if (resource.status !== "captured" || !resource.path) return null;
    if (!Number.isSafeInteger(resource.bytes) || resource.bytes < 0) return null;
    if (resource.bytes > CLIPPING_RESOURCE_MAX_BYTES) return null;
    const path = this.path(
      id,
      identitySchema.parse(versionId),
      clippingResourcePathSchema.parse(resource.path)
    );
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(path, "r");
      const buffer = Buffer.alloc(resource.bytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
      if (bytesRead !== resource.bytes) return null;
      const body = buffer.subarray(0, bytesRead);
      if (createHash("sha256").update(body).digest("hex") !== resource.id) return null;
      return body;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        return null;
      throw error;
    } finally {
      if (handle) await handle.close().catch(() => undefined);
    }
  }

  async writeResource(id: string, versionId: string, resourcePath: string, content: Uint8Array) {
    await this.atomic(
      this.path(
        id,
        identitySchema.parse(versionId),
        clippingResourcePathSchema.parse(resourcePath)
      ),
      content
    );
  }

  async removeResourceIfUnreferenced(id: string, versionId: string, resourcePath: string) {
    const manifest = await this.manifest(id);
    const version = manifest?.versions.find((candidate) => candidate.id === versionId);
    if (version?.resources.some((resource) => resource.path === resourcePath)) return;
    this.beforePublish?.();
    try {
      await rm(
        this.path(
          id,
          identitySchema.parse(versionId),
          clippingResourcePathSchema.parse(resourcePath)
        ),
        {
          force: true,
        }
      );
    } catch {
      /* Cleanup is best effort after a failed atomic checkpoint. */
    }
  }

  async removeSourceIfUnreferenced(id: string, versionId: string, sourceHash: string) {
    const manifest = await this.manifest(id);
    const version = manifest?.versions.find((candidate) => candidate.id === versionId);
    if (version?.sourceHash === sourceHash) return;
    this.beforePublish?.();
    try {
      await rm(this.path(id, identitySchema.parse(versionId), "source.md"), { force: true });
    } catch {
      /* Cleanup is best effort after a failed atomic checkpoint. */
    }
  }

  async cleanupUnreferencedResources(id: string) {
    const idPath = this.path(id);
    const manifest = await this.manifest(id);
    const referenced = new Set(
      (manifest?.versions ?? []).flatMap((version) =>
        version.resources
          .filter((resource) => resource.status === "captured" && resource.path)
          .map((resource) => `${version.id}/${resource.path}`)
      )
    );
    let versions: import("node:fs").Dirent[];
    try {
      versions = await readdir(idPath, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    for (const versionEntry of versions) {
      if (!versionEntry.isDirectory() || !identitySchema.safeParse(versionEntry.name).success)
        continue;
      const version = manifest?.versions.find((candidate) => candidate.id === versionEntry.name);
      const versionPath = join(idPath, versionEntry.name);
      if (!version) {
        await rm(versionPath, { recursive: true, force: true });
        continue;
      }
      let sourceReferenced = false;
      if (version.sourceHash) {
        try {
          const source = await readFile(join(versionPath, "source.md"));
          sourceReferenced =
            createHash("sha256").update(source).digest("hex") === version.sourceHash;
        } catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
            throw error;
        }
      }
      if (version.sourceHash && !sourceReferenced) {
        await rm(join(versionPath, "source.md"), { force: true });
      }
      let assets: import("node:fs").Dirent[];
      try {
        assets = await readdir(join(versionPath, "assets"), {
          withFileTypes: true,
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
          continue;
        throw error;
      }
      for (const asset of assets) {
        if (!asset.isFile()) continue;
        const resourcePath = `assets/${asset.name}`;
        if (
          !resourcePath.endsWith(".tmp") &&
          !clippingResourcePathSchema.safeParse(resourcePath).success
        )
          continue;
        if (referenced.has(`${versionEntry.name}/${resourcePath}`)) continue;
        await rm(join(versionPath, resourcePath), { force: true });
      }
    }
  }

  async cleanupAllUnreferencedResources() {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries)
      if (entry.isDirectory() && identitySchema.safeParse(entry.name).success)
        await this.cleanupUnreferencedResources(entry.name);
  }

  private async atomic(path: string, content: string | Uint8Array) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    let published = false;
    try {
      this.beforePublish?.();
      await writeFile(
        temporary,
        content,
        typeof content === "string" ? { encoding: "utf8", mode: 0o600 } : { mode: 0o600 }
      );
      this.beforePublish?.();
      // Do not yield between the final ownership check and publication. The runtime
      // transaction still holds the owner-row write lock throughout this rename.
      renameSync(temporary, path);
      published = true;
    } finally {
      if (!published) await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

export async function projectClippingMemo(
  memoId: string,
  store = new ClippingStore(),
  includeArticle = false,
  publicProjection = false
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
  const translation =
    includeArticle && visible ? await store.read(id, visible.id, "translation") : null;
  const sanitizeLegacyMedia = publicProjection && visible && !visible.resourcesCaptured;
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
    warning:
      visible && !visible.resourcesCaptured
        ? (visible.warning ?? "此阅读版本的正文资源仍为外链，请重新处理以保存到服务器。")
        : (visible?.warning ?? null),
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
    source: sanitizeLegacyMedia && source !== null ? stripUncapturedClippingMedia(source) : source,
    translation:
      sanitizeLegacyMedia && translation !== null
        ? stripUncapturedClippingMedia(translation)
        : translation,
    resourcesCaptured: Boolean(visible?.resourcesCaptured),
    resources: visible?.resources ?? [],
  };
}
