import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { encodeJson, parseEditionIdentity, samePlaybookEdition, verifyFile } from "./manifest";
import { validatePlaybookSearchRoute } from "./navigation";
import { assertPublicCatalog, searchSchema } from "./schema";
import type { PlaybookEdition, PlaybookEditionIdentity } from "./types";

export interface PlaybookCacheState {
  current?: PlaybookEdition;
  previous?: PlaybookEdition;
}
export type PlaybookFetcher = (url: string, init?: RequestInit) => Promise<Response>;
export const PLAYBOOK_POLL_INTERVAL_MS = 300_000;
export type PlaybookSchedule = (run: () => void, intervalMs: number) => () => void;
const schedule: PlaybookSchedule = (run, intervalMs) => {
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
};

export function playbookCacheDirectory(dbPath = process.env.DB_PATH || "./data/sqlite.db") {
  return resolve(process.env.PLAYBOOK_CACHE_DIR || join(dirname(dbPath), "playbook-cache"));
}

export function validatePlaybookEdition(value: unknown): PlaybookEdition {
  if (!value || typeof value !== "object") throw new Error("Invalid edition envelope");
  const input = value as Record<string, unknown>;
  const edition = parseEditionIdentity(input.edition);
  const catalog = assertPublicCatalog(input.catalog);
  const search = searchSchema.parse(input.search);
  const ids = new Set<string>();
  for (const document of search.documents) {
    if (ids.has(document.id)) throw new Error("Duplicate search id");
    ids.add(document.id);
    validatePlaybookSearchRoute(catalog, document);
  }
  for (const file of edition.files.filter((entry) => entry.path !== "public-snapshot.json"))
    verifyFile(encodeJson(file.path === "catalog.json" ? catalog : search), file);
  if (input.publicSnapshot !== undefined) {
    if (typeof input.publicSnapshot !== "string" && !(input.publicSnapshot instanceof Uint8Array))
      throw new Error("Invalid article/Memo snapshot");
    const snapshot = edition.files.find((file) => file.path === "public-snapshot.json");
    if (!snapshot) throw new Error("Article/Memo snapshot record is missing");
    verifyFile(input.publicSnapshot, snapshot);
  }
  return { edition, catalog, search };
}

function freezeEdition(edition: PlaybookEdition) {
  const freeze = (value: unknown) => {
    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) freeze(nested);
      Object.freeze(value);
    }
  };
  freeze(edition);
  return edition;
}

export class PlaybookStore {
  private state: PlaybookCacheState = {};
  private loaded?: Promise<void>;
  private flight?: Promise<void>;
  private stopPolling?: () => void;
  private controller?: AbortController;
  private stopped = false;
  constructor(
    public readonly root = playbookCacheDirectory(),
    private readonly fetcher: PlaybookFetcher = fetch,
    private readonly scheduler: PlaybookSchedule = schedule
  ) {}

  get current() {
    return this.state.current;
  }
  getEdition(digest: string, sourceReleaseId: string, sourceTag: string) {
    return [this.state.current, this.state.previous].find(
      (entry) =>
        entry?.edition.editionDigest === digest &&
        entry.edition.source.releaseId === sourceReleaseId &&
        entry.edition.source.tag === sourceTag
    );
  }

  load(seedPath = process.env.PLAYBOOK_SEED_PATH || "site/generated/playbook-edition.json") {
    if (!this.loaded) this.loaded = this.loadState(seedPath);
    return this.loaded;
  }

  private async loadState(seedPath: string) {
    try {
      const raw = JSON.parse(await readFile(join(this.root, "state.json"), "utf8")) as Record<
        string,
        unknown
      >;
      for (const key of ["current", "previous"] as const) {
        try {
          this.state[key] = freezeEdition(validatePlaybookEdition(raw[key]));
        } catch {
          /* An incompatible or incomplete entry cannot replace a compatible one. */
        }
      }
      if (!this.state.current && this.state.previous) this.state.current = this.state.previous;
    } catch {
      /* First boot may have only an image seed. */
    }
    if (!this.state.current) {
      try {
        this.state.current = freezeEdition(
          validatePlaybookEdition(JSON.parse(await readFile(resolve(seedPath), "utf8")))
        );
      } catch {
        /* Other console surfaces remain available without a playbook. */
      }
    }
  }

  async adopt(value: PlaybookEdition) {
    const edition = freezeEdition(validatePlaybookEdition(value));
    const next = {
      current: edition,
      previous:
        this.state.current && samePlaybookEdition(this.state.current.edition, edition.edition)
          ? this.state.previous
          : this.state.current,
    };
    await mkdir(this.root, { recursive: true });
    const staging = join(this.root, `.state-${randomUUID()}.tmp`);
    await writeFile(staging, encodeJson(next), { mode: 0o600 });
    await rename(staging, join(this.root, "state.json"));
    this.state = next;
  }

  sync(
    manifestUrl = process.env.PLAYBOOK_MANIFEST_URL ||
      "https://ivanli.cc/_content/playbook/manifest.json"
  ) {
    if (!this.flight)
      this.flight = this.download(manifestUrl).finally(() => {
        this.flight = undefined;
      });
    return this.flight;
  }

  private async download(manifestUrl: string) {
    if (this.stopped) return;
    this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(30_000)]);
    const pointer = parseEditionIdentity(
      JSON.parse(
        Buffer.from(await fetchBounded(this.fetcher, manifestUrl, 64 * 1024, signal)).toString(
          "utf8"
        )
      )
    );
    if (this.current && samePlaybookEdition(pointer, this.current.edition)) return;
    const base = new URL(
      `./${encodeURIComponent(pointer.source.tag)}/${pointer.editionDigest}/`,
      manifestUrl
    );
    const results = await Promise.all(
      pointer.files
        .filter((file) => file.path !== "public-snapshot.json")
        .map(async (file) => {
          const bytes = await fetchBounded(
            this.fetcher,
            new URL(file.path, base).toString(),
            file.size,
            signal
          );
          verifyFile(bytes, file);
          return [file.path, JSON.parse(Buffer.from(bytes).toString("utf8"))] as const;
        })
    );
    const snapshot = pointer.files.find((file) => file.path === "public-snapshot.json");
    if (!snapshot) throw new Error("Article/Memo snapshot record is missing");
    const publicSnapshot = await fetchBounded(
      this.fetcher,
      new URL(snapshot.path, base).toString(),
      snapshot.size,
      signal
    );
    validatePlaybookEdition({
      edition: pointer,
      catalog: new Map(results).get("catalog.json"),
      search: new Map(results).get("search-documents.json"),
      publicSnapshot,
    });
    if (this.stopped) return;
    const files = new Map(results);
    await this.adopt({
      edition: pointer,
      catalog: files.get("catalog.json"),
      search: files.get("search-documents.json"),
    } as PlaybookEdition);
  }

  start(manifestUrl?: string) {
    if (this.stopPolling) return;
    this.stopped = false;
    const run = () => {
      void this.sync(manifestUrl).catch((error) =>
        console.warn(
          "[playbook] keeping last compatible edition:",
          error instanceof Error ? error.message : String(error)
        )
      );
    };
    run();
    this.stopPolling = this.scheduler(run, PLAYBOOK_POLL_INTERVAL_MS);
  }

  stop() {
    this.stopped = true;
    this.stopPolling?.();
    this.stopPolling = undefined;
    this.controller?.abort();
  }
}

export async function fetchBounded(
  fetcher: PlaybookFetcher,
  url: string,
  maxBytes: number,
  signal?: AbortSignal
) {
  const response = await fetcher(url, {
    signal,
    redirect: "error",
    headers: { accept: "application/json" },
  });
  if (!response.ok || !response.body)
    throw new Error(`Playbook download failed: ${response.status}`);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Playbook download exceeds declared size");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(parts);
}

const STORE_KEY = Symbol.for("blog26.playbook-store.v1");
export function getRuntimePlaybookStore() {
  const shared = globalThis as typeof globalThis & { [STORE_KEY]?: PlaybookStore };
  shared[STORE_KEY] ??= new PlaybookStore();
  return shared[STORE_KEY];
}

export function playbookVersionPath(edition: PlaybookEditionIdentity) {
  return `/_content/playbook/${encodeURIComponent(edition.source.tag)}/${edition.editionDigest}/`;
}
