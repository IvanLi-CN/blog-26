import type { ClippingReading } from "@/lib/memo-clipping";
import { createEmptyPublicMediaCollection } from "@/lib/public-media";
import type { PublicMemoRecord } from "@/public-site/snapshot";
import { getClippingWebDemoArticle } from "./clipping-web-demo";
import type { WebDemoPersona, WebDemoState } from "./web-demo-runtime";

export const CONSOLE_WEB_DEMO_SLUGS = {
  private: "console-demo-private-release-notes",
  draft: "console-demo-draft-reading-list",
  clipping: "console-demo-clipping-durable-workflows",
  public: "console-demo-public-weekly-notes",
} as const;

export type ConsoleWebDemoMemo = PublicMemoRecord & {
  canDiscuss?: boolean;
  authoredContent?: string;
  authoredTitle?: string;
  source?: string;
  draft?: boolean;
};

export type ConsoleWebDemoPublicMemo = Omit<
  ConsoleWebDemoMemo,
  "authoredContent" | "authoredTitle" | "source" | "draft" | "dataSource" | "filePath" | "media"
>;

const fixtureTime = Date.UTC(2026, 9, 13, 8);

function makeMemo(
  slug: string,
  title: string,
  content: string,
  options: {
    isPublic: boolean;
    draft?: boolean;
    tags: string[];
    createdOffsetHours: number;
    clipping?: ClippingReading;
  }
): ConsoleWebDemoMemo {
  const createdAt = new Date(
    fixtureTime - options.createdOffsetHours * 60 * 60 * 1000
  ).toISOString();
  return {
    id: slug,
    slug,
    title,
    excerpt: content
      .replace(/^#\s+[^\n]+\n*/u, "")
      .trim()
      .slice(0, 180),
    content,
    clipping: options.clipping,
    tags: options.tags,
    inlineTags: [],
    isPublic: options.isPublic,
    createdAt,
    publishedAt: options.isPublic && !options.draft ? createdAt : null,
    updatedAt: createdAt,
    dataSource: "console-web-demo",
    filePath: `demo/console-memos/${slug}.md`,
    image: null,
    media: createEmptyPublicMediaCollection(),
    authoredContent: content,
    authoredTitle: title,
    source: "local",
    draft: options.draft ?? !options.isPublic,
  };
}

const clippingArticle = getClippingWebDemoArticle({
  scene: "clipping-ready",
  persona: "admin",
  network: "healthy",
  data: "fixture",
});

const seedMemos: ConsoleWebDemoMemo[] = [
  makeMemo(
    CONSOLE_WEB_DEMO_SLUGS.private,
    "发布窗口后的内部复盘",
    "# 发布窗口后的内部复盘\n\n这是一条当前 Console 内容：管理员可以在详情首屏看到尚未进入公开快照的正文。\n\n## 检查结果\n\n- 私有媒体仍使用管理员可读的资源边界。\n- 保存正文后停留在当前详情地址。\n- 公开站仍只显示最近发布的快照。\n\n![管理员可见的发布记录](/site-assets/favicon.svg)",
    {
      isPublic: false,
      tags: ["发布", "内部复盘"],
      createdOffsetHours: 1,
    }
  ),
  makeMemo(
    CONSOLE_WEB_DEMO_SLUGS.draft,
    "待确认的阅读清单",
    "# 待确认的阅读清单\n\n这条草稿用于验证管理员详情可以读取尚未公开的当前内容。\n\n下一步是确认来源、翻译和讨论权限，再决定是否公开。",
    {
      isPublic: false,
      draft: true,
      tags: ["草稿", "阅读"],
      createdOffsetHours: 3,
    }
  ),
  makeMemo(
    CONSOLE_WEB_DEMO_SLUGS.clipping,
    clippingArticle.title ?? "可恢复的文章工作流",
    "# 可恢复的文章工作流\n\n这是一条剪藏 Memo。详情同时展示作者摘要、原文、译文和管理员讨论入口。",
    {
      isPublic: true,
      tags: ["剪藏", "工作流"],
      createdOffsetHours: 5,
      clipping: clippingArticle.reading,
    }
  ),
  makeMemo(
    CONSOLE_WEB_DEMO_SLUGS.public,
    "本周公开笔记",
    "# 本周公开笔记\n\n公开 Memo 的当前正文和公开快照都可以从详情边界观察。管理员保存后不会强制同步发布快照。\n\n## 阅读提示\n\n请从管理列表的眼睛按钮进入详情，再使用浏览器返回验证列表位置。",
    {
      isPublic: true,
      tags: ["公开", "周记"],
      createdOffsetHours: 8,
    }
  ),
];

const CONSOLE_WEB_DEMO_STORE_KEY = "console-web-demo-memos-v2";
const CONSOLE_WEB_DEMO_MUTATION_COOKIE = "console_web_demo_mutations_v2";
const CONSOLE_WEB_DEMO_LEGACY_MUTATION_COOKIE = "console_web_demo_mutations_v1";
const CONSOLE_WEB_DEMO_COOKIE_CHUNK_SIZE = 3000;
const CONSOLE_WEB_DEMO_COOKIE_MAX_CHUNKS = 64;

type ConsoleWebDemoMutationUpdate = {
  s: string;
  p: boolean;
  v: string | null;
};

type ConsoleWebDemoMutationJournal = {
  sequence: number;
  deleted: string[];
  updated: ConsoleWebDemoMutationUpdate[];
};

function isConsoleWebDemoMemo(value: unknown): value is ConsoleWebDemoMemo {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { slug?: unknown }).slug === "string" &&
      typeof (value as { content?: unknown }).content === "string" &&
      typeof (value as { isPublic?: unknown }).isPublic === "boolean"
  );
}

function parsePersistedStore(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { memos?: unknown; sequence?: unknown };
    if (!Array.isArray(parsed.memos) || !parsed.memos.every(isConsoleWebDemoMemo)) return null;
    return {
      memos: parsed.memos,
      sequence:
        typeof parsed.sequence === "number" && Number.isSafeInteger(parsed.sequence)
          ? parsed.sequence
          : 0,
    };
  } catch {
    return null;
  }
}

function readRawCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function readCookieValue(cookieHeader: string | undefined, name: string) {
  const raw = readRawCookieValue(cookieHeader, name);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function readPersistedStore(storageKey: string) {
  if (typeof window === "undefined") return null;
  try {
    return parsePersistedStore(window.sessionStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function readMutationJournal(cookieHeader?: string) {
  const cookieSource =
    cookieHeader ?? (typeof document === "undefined" ? undefined : document.cookie);
  const raw =
    readCookieValue(cookieSource, CONSOLE_WEB_DEMO_MUTATION_COOKIE) ??
    (() => {
      const chunks: string[] = [];
      for (let index = 0; index < CONSOLE_WEB_DEMO_COOKIE_MAX_CHUNKS; index += 1) {
        const chunk = readRawCookieValue(
          cookieSource,
          `${CONSOLE_WEB_DEMO_MUTATION_COOKIE}_${index}`
        );
        if (chunk === null) break;
        chunks.push(chunk);
      }
      if (chunks.length === 0) return null;
      if (
        chunks.length === CONSOLE_WEB_DEMO_COOKIE_MAX_CHUNKS &&
        readRawCookieValue(
          cookieSource,
          `${CONSOLE_WEB_DEMO_MUTATION_COOKIE}_${CONSOLE_WEB_DEMO_COOKIE_MAX_CHUNKS}`
        ) !== null
      )
        return null;
      try {
        return decodeURIComponent(chunks.join(""));
      } catch {
        return null;
      }
    })();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsoleWebDemoMutationJournal>;
    if (
      !parsed ||
      !Array.isArray(parsed.deleted) ||
      !parsed.deleted.every((slug) => typeof slug === "string") ||
      !Array.isArray(parsed.updated)
    )
      return null;
    return {
      sequence:
        typeof parsed.sequence === "number" && Number.isSafeInteger(parsed.sequence)
          ? parsed.sequence
          : 0,
      deleted: parsed.deleted,
      updated: parsed.updated.filter((update): update is ConsoleWebDemoMutationUpdate =>
        Boolean(
          update &&
            typeof update === "object" &&
            typeof update.s === "string" &&
            typeof update.p === "boolean" &&
            (typeof update.v === "string" || update.v === null)
        )
      ),
    };
  } catch {
    return null;
  }
}

function applyMutationJournal(seed: ConsoleWebDemoMemo[], journal: ConsoleWebDemoMutationJournal) {
  const deleted = new Set(journal.deleted);
  const updates = new Map(journal.updated.map((update) => [update.s, update]));
  const memos = seed
    .filter((memo) => !deleted.has(memo.slug))
    .map((memo) => {
      const update = updates.get(memo.slug);
      if (!update) return memo;
      return {
        ...memo,
        isPublic: update.p,
        draft: !update.p,
        publishedAt: update.p ? (update.v ?? memo.publishedAt) : null,
      };
    });
  return memos;
}

function buildMutationJournal(memos: ConsoleWebDemoMemo[], sequence: number) {
  const seed = getConsoleWebDemoMemos();
  const seedBySlug = new Map(seed.map((memo) => [memo.slug, memo]));
  const currentBySlug = new Map(memos.map((memo) => [memo.slug, memo]));
  const deleted = seed.filter((memo) => !currentBySlug.has(memo.slug)).map((memo) => memo.slug);
  const updated = memos.flatMap((memo) => {
    const original = seedBySlug.get(memo.slug);
    if (
      !original ||
      (original.isPublic === memo.isPublic && original.publishedAt === memo.publishedAt)
    )
      return [];
    return [
      {
        s: memo.slug,
        p: memo.isPublic,
        v: memo.publishedAt,
      },
    ];
  });
  return { sequence, deleted, updated } satisfies ConsoleWebDemoMutationJournal;
}

function persistStore(storageKey: string, memos: ConsoleWebDemoMemo[], sequence: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ memos, sequence }));
  } catch {
    // Session storage is an optional bridge between the Console and preview bundles.
  }
  try {
    const encoded = encodeURIComponent(JSON.stringify(buildMutationJournal(memos, sequence)));
    const clearCookie = (name: string) => {
      document.cookie = `${name}=; Max-Age=0; Path=/memos/; SameSite=Lax`;
    };
    clearCookie(CONSOLE_WEB_DEMO_MUTATION_COOKIE);
    document.cookie = `${CONSOLE_WEB_DEMO_LEGACY_MUTATION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    for (let index = 0; index < CONSOLE_WEB_DEMO_COOKIE_MAX_CHUNKS; index += 1) {
      clearCookie(`${CONSOLE_WEB_DEMO_MUTATION_COOKIE}_${index}`);
    }
    if (encoded !== encodeURIComponent(JSON.stringify({ sequence, deleted: [], updated: [] }))) {
      const chunkCount = Math.ceil(encoded.length / CONSOLE_WEB_DEMO_COOKIE_CHUNK_SIZE);
      if (chunkCount > CONSOLE_WEB_DEMO_COOKIE_MAX_CHUNKS) return;
      if (encoded.length <= CONSOLE_WEB_DEMO_COOKIE_CHUNK_SIZE) {
        document.cookie = `${CONSOLE_WEB_DEMO_MUTATION_COOKIE}=${encoded}; Max-Age=3600; Path=/memos/; SameSite=Lax`;
      } else {
        for (
          let offset = 0, index = 0;
          offset < encoded.length;
          offset += CONSOLE_WEB_DEMO_COOKIE_CHUNK_SIZE, index += 1
        ) {
          document.cookie = `${CONSOLE_WEB_DEMO_MUTATION_COOKIE}_${index}=${encoded.slice(offset, offset + CONSOLE_WEB_DEMO_COOKIE_CHUNK_SIZE)}; Max-Age=3600; Path=/memos/; SameSite=Lax`;
        }
      }
    }
  } catch {
    // The cookie is an optional SSR bridge for the in-memory Web Demo state.
  }
}

function cloneMemo(memo: ConsoleWebDemoMemo): ConsoleWebDemoMemo {
  return structuredClone(memo);
}

export function getConsoleWebDemoPersona(
  location: Pick<Location, "search"> | Pick<URL, "search">
): WebDemoPersona {
  const persona = new URLSearchParams(location.search).get("d_persona");
  return persona === "user" || persona === "guest" || persona === "admin" ? persona : "admin";
}

export function getConsoleWebDemoMemos(): ConsoleWebDemoMemo[] {
  return seedMemos.map(cloneMemo);
}

export function getConsoleWebDemoPublicMemos(): ConsoleWebDemoPublicMemo[] {
  return seedMemos.filter((memo) => memo.isPublic && !memo.draft).map(toPublicMemo);
}

function toPublicMemo(memo: ConsoleWebDemoMemo): ConsoleWebDemoPublicMemo {
  const {
    authoredContent: _authoredContent,
    authoredTitle: _authoredTitle,
    source: _source,
    draft: _draft,
    dataSource: _dataSource,
    filePath: _filePath,
    media: _media,
    ...publicMemo
  } = cloneMemo(memo);
  return {
    ...publicMemo,
    canDiscuss: false,
  };
}

function toMemoForPersona(
  memo: ConsoleWebDemoMemo,
  persona: WebDemoPersona
): ConsoleWebDemoMemo | ConsoleWebDemoPublicMemo {
  if (persona === "admin") {
    return {
      ...cloneMemo(memo),
      canDiscuss: Boolean(memo.clipping),
    };
  }
  return toPublicMemo(memo);
}

export function getConsoleWebDemoMemo(slug: string, persona: "admin"): ConsoleWebDemoMemo | null;
export function getConsoleWebDemoMemo(
  slug: string,
  persona: Exclude<WebDemoPersona, "admin">
): ConsoleWebDemoPublicMemo | null;
export function getConsoleWebDemoMemo(
  slug: string,
  persona: WebDemoPersona
): ConsoleWebDemoMemo | ConsoleWebDemoPublicMemo | null;
export function getConsoleWebDemoMemo(
  slug: string,
  persona: WebDemoPersona
): ConsoleWebDemoMemo | ConsoleWebDemoPublicMemo | null {
  const memo = seedMemos.find((candidate) => candidate.slug === slug);
  if (!memo) return null;
  if (persona !== "admin" && (!memo.isPublic || memo.draft)) return null;
  return toMemoForPersona(memo, persona);
}

export function getConsoleWebDemoClippingArticle(slug: string, persona: WebDemoPersona) {
  if (slug !== CONSOLE_WEB_DEMO_SLUGS.clipping) return null;
  const article = getClippingWebDemoArticle({
    scene: "clipping-ready",
    persona,
    network: "healthy",
    data: "fixture",
  } satisfies WebDemoState);
  return {
    ...article,
    canDiscuss: persona === "admin",
  };
}

export function createConsoleWebDemoStore(
  options: { storageKey?: string; cookieHeader?: string } = {}
) {
  const storageKey = options.storageKey ?? CONSOLE_WEB_DEMO_STORE_KEY;
  const persisted = readPersistedStore(storageKey);
  const cookieJournal = readMutationJournal(options.cookieHeader);
  let memos =
    persisted?.memos ??
    (cookieJournal
      ? applyMutationJournal(getConsoleWebDemoMemos(), cookieJournal)
      : getConsoleWebDemoMemos());
  let sequence = persisted?.sequence ?? cookieJournal?.sequence ?? 0;

  const visible = (persona: WebDemoPersona) =>
    memos
      .filter((memo) => persona === "admin" || (memo.isPublic && !memo.draft))
      .map((memo) => toMemoForPersona(memo, persona));

  return {
    list(persona: WebDemoPersona) {
      const items = visible(persona);
      return {
        memos: items,
        hasMore: false,
        nextCursor: null,
        hasPrevious: false,
        previousCursor: null,
      };
    },
    get(slug: string, persona: WebDemoPersona) {
      const memo = memos.find((candidate) => candidate.slug === slug);
      if (!memo || (persona !== "admin" && (!memo.isPublic || memo.draft))) return null;
      return toMemoForPersona(memo, persona);
    },
    create(input: { content: string; isPublic: boolean; tags?: string[] }) {
      const slug = `console-demo-created-${++sequence}`;
      const now = new Date().toISOString();
      const title = input.content.match(/^#\s+([^\n]+)/u)?.[1]?.trim() || "未命名 Memo";
      const memo = makeMemo(slug, title, input.content, {
        isPublic: input.isPublic,
        tags: input.tags ?? [],
        createdOffsetHours: 0,
      });
      memo.createdAt = now;
      memo.updatedAt = now;
      memos = [memo, ...memos];
      persistStore(storageKey, memos, sequence);
      return cloneMemo(memo);
    },
    update(slug: string, input: { content: string; isPublic: boolean; tags?: string[] }) {
      const current = memos.find((memo) => memo.slug === slug);
      if (!current) return null;
      const title =
        input.content.match(/^#\s+([^\n]+)/u)?.[1]?.trim() || current.title || "未命名 Memo";
      const now = new Date().toISOString();
      const updated = {
        ...current,
        title,
        authoredTitle: title,
        authoredContent: input.content,
        content: input.content,
        excerpt: input.content
          .replace(/^#\s+[^\n]+\n*/u, "")
          .trim()
          .slice(0, 180),
        isPublic: input.isPublic,
        draft: !input.isPublic,
        tags: input.tags ?? current.tags,
        publishedAt: input.isPublic ? (current.publishedAt ?? now) : null,
        updatedAt: now,
      };
      memos = memos.map((memo) => (memo.slug === slug ? updated : memo));
      persistStore(storageKey, memos, sequence);
      return cloneMemo(updated);
    },
    remove(slug: string) {
      const existed = memos.some((memo) => memo.slug === slug);
      memos = memos.filter((memo) => memo.slug !== slug);
      if (existed) persistStore(storageKey, memos, sequence);
      return existed;
    },
  };
}
