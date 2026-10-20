import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  request as httpRequest,
  type IncomingMessage,
  type RequestOptions as NodeRequestOptions,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { Readability } from "@mozilla/readability";
import ipaddr from "ipaddr.js";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export class ClippingFetchError extends Error {
  constructor(
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "ClippingFetchError";
  }
}

export type ArticleMaterial = {
  markdown: string;
  title: string | null;
  url: string;
  warning: string | null;
  resources?: ArticleResource[];
};
export type ArticleResource = {
  id: string;
  originalUrl: string;
  finalUrl: string | null;
  path: string | null;
  mimeType: string | null;
  bytes: number;
  status: "captured" | "failed";
  error: string | null;
  body?: Buffer;
};
type Destination = { address: string; family: number };
type PageResponse = {
  status: number;
  location?: string;
  contentType?: string;
  body: Buffer;
};
type ExtractDependencies = {
  resolve: (hostname: string) => Promise<Destination[]>;
  request: (
    url: URL,
    destination: Destination,
    signal: AbortSignal,
    limit: number,
    options?: ArticleRequestOptions
  ) => Promise<PageResponse>;
};
type ArticleRequestOptions = {
  kind?: "html" | "resource";
  accept?: string;
  referer?: string;
};

export function isPublicAddress(address: string) {
  if (!isIP(address) || address.includes("%")) return false;
  const parsed = ipaddr.process(address);
  if (parsed.range() !== "unicast") return false;
  // Global IPv6 allocation; reject unassigned space and the newer documentation prefix.
  return (
    parsed.kind() === "ipv4" ||
    (parsed.match(ipaddr.parse("2000::"), 3) && !parsed.match(ipaddr.parse("3fff::"), 20))
  );
}

export function validateArticleUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ClippingFetchError("网页地址无效。");
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) {
    throw new ClippingFetchError("仅支持不含登录信息的公开 HTTP(S) 网页。");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) && !isPublicAddress(hostname))
    throw new ClippingFetchError("禁止抓取非公网地址。");
  url.hash = "";
  return url;
}

async function resolvePublicDestination(
  url: URL,
  resolveAddresses: ExtractDependencies["resolve"]
) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolveAddresses(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new ClippingFetchError("网页域名解析到了非公网地址，已停止抓取。");
  }
  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}

/** A single HTTP request, pinned to the validated address with original Host and TLS name. */
async function requestPage(
  url: URL,
  destination: Destination,
  signal: AbortSignal,
  limit: number,
  options: ArticleRequestOptions = {}
): Promise<PageResponse> {
  return new Promise((resolveResponse, reject) => {
    const connection: NodeRequestOptions & { autoSelectFamily: boolean } = {
      signal,
      agent: false,
      autoSelectFamily: false,
      family: destination.family,
      lookup: (_hostname, _options, callback) =>
        callback(null, destination.address, destination.family),
      headers: {
        "User-Agent": "Blog26-Clipping/1.0",
        Accept: options.accept ?? "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip, deflate, br",
        ...(options.referer ? { Referer: options.referer } : {}),
      },
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      connection,
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        const contentType = response.headers["content-type"];
        if ((status >= 300 && status < 400) || status !== 200) {
          response.destroy();
          resolveResponse({ status, location, contentType, body: Buffer.alloc(0) });
          return;
        }
        const isHtml = /^\s*(text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(
          contentType ?? ""
        );
        if (options.kind !== "resource" && !isHtml) {
          response.destroy();
          reject(new ClippingFetchError("该地址不是 HTML 网页；暂不支持 PDF、图片和其他文件。"));
          return;
        }
        if (options.kind === "resource" && isHtml) {
          response.destroy();
          reject(new ClippingFetchError("资源地址返回了 HTML，而不是媒体文件。"));
          return;
        }
        let encodedBytes = 0;
        response.on("data", (chunk: Buffer) => {
          encodedBytes += chunk.length;
          if (encodedBytes > limit) response.destroy(new ClippingFetchError("网页超过大小限制。"));
        });
        const encoding = response.headers["content-encoding"]?.toLowerCase();
        const decoder =
          encoding === "gzip"
            ? createGunzip()
            : encoding === "deflate"
              ? createInflate()
              : encoding === "br"
                ? createBrotliDecompress()
                : null;
        if (encoding && encoding !== "identity" && !decoder) {
          response.destroy();
          reject(new ClippingFetchError("网页使用了不支持的压缩格式。"));
          return;
        }
        const stream = decoder ? response.pipe(decoder) : response;
        response.on("error", (error) => {
          decoder?.destroy(error);
          reject(error);
        });
        const chunks: Buffer[] = [];
        let bytes = 0;
        stream.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > limit) {
            const error = new ClippingFetchError("网页解压后超过大小限制。");
            stream.destroy(error);
            response.destroy();
          } else chunks.push(chunk);
        });
        stream.on("error", reject);
        stream.on("end", () =>
          resolveResponse({ status, contentType, body: Buffer.concat(chunks) })
        );
      }
    );
    request.on("error", reject);
    request.end();
  });
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

export async function fetchArticleHtml(
  target: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    maxBytes?: number;
    dependencies?: Partial<ExtractDependencies>;
  } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new ClippingFetchError("抓取网页超时，请稍后重试。", true)),
    options.timeoutMs ?? 30_000
  );
  const externalAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  if (options.signal?.aborted) externalAbort();
  const dependencies: ExtractDependencies = {
    resolve: (hostname) => lookup(hostname, { all: true }),
    request: requestPage,
    ...options.dependencies,
  };
  try {
    let url = validateArticleUrl(target);
    for (let hops = 0; hops <= 5; hops++) {
      const destination = await abortable(
        resolvePublicDestination(url, dependencies.resolve),
        controller.signal
      );
      const result = await abortable(
        dependencies.request(
          url,
          destination,
          controller.signal,
          options.maxBytes ?? 10 * 1024 * 1024
        ),
        controller.signal
      );
      if ([301, 302, 303, 307, 308].includes(result.status)) {
        if (!result.location || hops === 5)
          throw new ClippingFetchError("网页跳转次数超过限制或缺少目标地址。");
        url = validateArticleUrl(new URL(result.location, url).href);
        continue;
      }
      if (result.status !== 200)
        throw new ClippingFetchError(
          `网页返回 HTTP ${result.status}；不支持需要登录或身份验证的页面。`,
          result.status === 429 || result.status >= 500
        );
      if (result.body.length > (options.maxBytes ?? 10 * 1024 * 1024))
        throw new ClippingFetchError("网页解压后超过大小限制。");
      return { url: url.href, html: result.body };
    }
    throw new ClippingFetchError("网页跳转次数超过限制。");
  } catch (error) {
    if (error instanceof ClippingFetchError || controller.signal.aborted)
      throw controller.signal.aborted ? controller.signal.reason : error;
    throw new ClippingFetchError("无法连接网页，请稍后重试。", true);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", externalAbort);
  }
}

export const CLIPPING_RESOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const CLIPPING_RESOURCE_MAX_TOTAL_BYTES = 128 * 1024 * 1024;
export const CLIPPING_RESOURCE_MAX_COUNT = 64;

type PreparedArticle = {
  content: string;
  title: string | null;
  textContent: string;
  url: string;
};

type ArticleFetchOptions = Parameters<typeof fetchArticleHtml>[1] & {
  maxResourceBytes?: number;
  maxResourceTotalBytes?: number;
  maxResourceCount?: number;
};

function resolveSrcset(value: string, baseUrl: string) {
  const candidates: string[] = [];
  for (const rawCandidate of value.split(",")) {
    const match = /^\s*(?:<([^>]+)>|(\S+))(?:\s+(.+?))?\s*$/u.exec(rawCandidate);
    const rawUrl = match?.[1] ?? match?.[2];
    if (!rawUrl) continue;
    try {
      const resolved = validateArticleUrl(new URL(rawUrl, baseUrl).href).href;
      candidates.push(`${resolved}${match?.[3] ? ` ${match[3]}` : ""}`);
    } catch {
      /* Drop unsafe candidates while retaining safe responsive sources. */
    }
  }
  return candidates.join(", ");
}

function prepareArticle(html: Buffer, url: string): PreparedArticle {
  // JSDOM executes no scripts and fetches no subresources with these defaults.
  const dom = new JSDOM(html, { url });
  try {
    const document = dom.window.document;
    for (const node of document.querySelectorAll(
      "script,style,iframe,object,embed,form,nav,noscript"
    ))
      node.remove();
    for (const node of document.querySelectorAll("*")) {
      for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name) || attribute.name === "style") {
          node.removeAttribute(attribute.name);
          continue;
        }
        if (attribute.name === "srcset") {
          const resolved = resolveSrcset(attribute.value, url);
          if (resolved) node.setAttribute(attribute.name, resolved);
          else node.removeAttribute(attribute.name);
        }
      }
      for (const attribute of ["href", "src", "poster"]) {
        const value = node.getAttribute(attribute);
        if (!value) continue;
        try {
          const resolved = validateArticleUrl(new URL(value, url).href);
          node.setAttribute(attribute, resolved.href);
        } catch {
          node.removeAttribute(attribute);
        }
      }
    }
    const article = new Readability(document, { charThreshold: 300, keepClasses: true }).parse();
    if (!article?.content || (article.textContent?.trim().length ?? 0) < 100) {
      throw new ClippingFetchError(
        "未找到可阅读的文章正文；页面可能需要登录、JavaScript 或只有导航内容。"
      );
    }
    return {
      content: article.content,
      title: article.title?.trim() || null,
      textContent: article.textContent ?? "",
      url,
    };
  } finally {
    dom.window.close();
  }
}

function convertArticleToMarkdown(content: string) {
  const converter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  converter.use(gfm);
  converter.addRule("articleMedia", {
    filter: (node) => ["PICTURE", "VIDEO", "AUDIO"].includes(node.nodeName),
    replacement: (_content, node) => `\n\n${node.outerHTML}\n\n`,
  });
  converter.addRule("articleCode", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => {
      const code = node.querySelector("code") ?? node;
      const value = code.textContent ?? "";
      const language = /(?:^|\s)language-([\w+-]+)/.exec(code.className)?.[1] ?? "";
      const fence = "`".repeat(
        Math.max(3, ...[...value.matchAll(/`+/g)].map((match) => match[0].length + 1))
      );
      return `\n\n${fence}${language}\n${value.replace(/\n$/, "")}\n${fence}\n\n`;
    },
  });
  const markdown = converter.turndown(content).trim();
  if (!markdown) throw new ClippingFetchError("文章正文提取为空。");
  return markdown;
}

function articleWarning(prepared: PreparedArticle, markdown: string, failedResources: number) {
  const loginOrTruncation =
    /(?:continue reading|subscribe to read|sign in to read|登录后阅读|订阅后阅读|阅读全文需|文章剩余)/i.test(
      prepared.textContent
    );
  const warning = loginOrTruncation
    ? "页面可能只提供部分正文；仅保存并翻译已提取的内容。"
    : markdown.length < 500
      ? "提取正文较短，请对照原文检查是否完整。"
      : null;
  if (!failedResources) return warning;
  const resourceWarning = `有 ${failedResources} 个正文资源未能保存到服务器，已移除失效外链。`;
  return warning ? `${warning} ${resourceWarning}` : resourceWarning;
}

function resourceExtension(resource: { finalUrl: string; mimeType: string | null }) {
  const mimeExtensions: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/ogg": "ogv",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  if (resource.mimeType && mimeExtensions[resource.mimeType])
    return mimeExtensions[resource.mimeType];
  try {
    const extension = new URL(resource.finalUrl).pathname.match(/\.([a-z0-9]{1,8})$/iu)?.[1];
    if (extension) return extension.toLowerCase();
  } catch {
    /* Fall back to a content-addressed binary extension. */
  }
  return "bin";
}

function resourceError(error: unknown) {
  const message = error instanceof Error ? error.message : "资源抓取失败。";
  return message.slice(0, 240);
}

function resourcePlaceholderLabel(node: Element, fallback: string) {
  const label = node
    .getAttribute("alt")
    ?.replace(/https?:\/\/\S+/giu, "")
    .trim();
  return label || fallback;
}

async function fetchArticleResource(
  target: string,
  referer: string,
  options: ArticleFetchOptions,
  dependencies: ExtractDependencies
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new ClippingFetchError("正文资源抓取超时。", true)),
    options.timeoutMs ?? 30_000
  );
  const externalAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  if (options.signal?.aborted) externalAbort();
  try {
    let url = validateArticleUrl(target);
    for (let hops = 0; hops <= 5; hops++) {
      const destination = await abortable(
        resolvePublicDestination(url, dependencies.resolve),
        controller.signal
      );
      const result = await abortable(
        dependencies.request(
          url,
          destination,
          controller.signal,
          options.maxResourceBytes ?? CLIPPING_RESOURCE_MAX_BYTES,
          {
            kind: "resource",
            referer,
            accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,audio/*,application/octet-stream;q=0.8,*/*;q=0.1",
          }
        ),
        controller.signal
      );
      if ([301, 302, 303, 307, 308].includes(result.status)) {
        if (!result.location || hops === 5)
          throw new ClippingFetchError("正文资源跳转次数超过限制或缺少目标地址。");
        url = validateArticleUrl(new URL(result.location, url).href);
        continue;
      }
      if (result.status !== 200)
        throw new ClippingFetchError(
          `正文资源返回 HTTP ${result.status}。`,
          result.status === 429 || result.status >= 500
        );
      if (result.body.length === 0) throw new ClippingFetchError("正文资源为空。");
      const mimeType = result.contentType?.split(";", 1)[0]?.trim().toLowerCase() || null;
      if (mimeType && /^(?:text\/html|application\/xhtml\+xml)$/iu.test(mimeType))
        throw new ClippingFetchError("资源地址返回了 HTML，而不是媒体文件。");
      return { finalUrl: url.href, mimeType, body: result.body };
    }
    throw new ClippingFetchError("正文资源跳转次数超过限制。");
  } catch (error) {
    if (error instanceof ClippingFetchError || controller.signal.aborted)
      throw controller.signal.aborted ? controller.signal.reason : error;
    throw new ClippingFetchError("无法连接正文资源。", true);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", externalAbort);
  }
}

async function localizeArticleResources(
  prepared: PreparedArticle,
  options: ArticleFetchOptions,
  dependencies: ExtractDependencies
) {
  const dom = new JSDOM(`<body>${prepared.content}</body>`, { url: prepared.url });
  try {
    const document = dom.window.document;
    const resources = new Map<string, ArticleResource>();
    let totalBytes = 0;
    const loadResource = async (originalUrl: string): Promise<ArticleResource> => {
      const normalizedUrl = validateArticleUrl(originalUrl).href;
      const existing = resources.get(normalizedUrl);
      if (existing) return existing;
      const id = createHash("sha256").update(normalizedUrl).digest("hex");
      let record: ArticleResource;
      if (resources.size >= (options.maxResourceCount ?? CLIPPING_RESOURCE_MAX_COUNT)) {
        record = {
          id,
          originalUrl: normalizedUrl,
          finalUrl: null,
          path: null,
          mimeType: null,
          bytes: 0,
          status: "failed",
          error: "正文资源数量超过限制。",
        };
      } else {
        try {
          const fetched = await fetchArticleResource(
            normalizedUrl,
            prepared.url,
            options,
            dependencies
          );
          const maxTotal = options.maxResourceTotalBytes ?? CLIPPING_RESOURCE_MAX_TOTAL_BYTES;
          if (totalBytes + fetched.body.length > maxTotal)
            throw new ClippingFetchError("正文资源总大小超过限制。");
          totalBytes += fetched.body.length;
          const extension = resourceExtension(fetched);
          record = {
            id,
            originalUrl: normalizedUrl,
            finalUrl: fetched.finalUrl,
            path: `assets/${id}.${extension}`,
            mimeType: fetched.mimeType,
            bytes: fetched.body.length,
            status: "captured",
            error: null,
            body: fetched.body,
          };
        } catch (error) {
          if (options.signal?.aborted) throw error;
          record = {
            id,
            originalUrl: normalizedUrl,
            finalUrl: null,
            path: null,
            mimeType: null,
            bytes: 0,
            status: "failed",
            error: resourceError(error),
          };
        }
      }
      resources.set(normalizedUrl, record);
      return record;
    };

    for (const node of [...document.querySelectorAll("img,source,video,audio")].reverse()) {
      const directAttributes = ["src", "poster"].filter((attribute) =>
        node.hasAttribute(attribute)
      );
      for (const attribute of directAttributes) {
        const value = node.getAttribute(attribute);
        if (!value) continue;
        const result = await loadResource(value);
        if (result.status === "captured" && result.path)
          node.setAttribute(attribute, `./${result.path}`);
        else node.removeAttribute(attribute);
      }

      const srcset = node.getAttribute("srcset");
      if (srcset) {
        const candidates: string[] = [];
        for (const candidate of srcset.split(",")) {
          const match = /^\s*(?:<([^>]+)>|(\S+))(?:\s+(.+?))?\s*$/u.exec(candidate);
          const candidateUrl = match?.[1] ?? match?.[2];
          if (!candidateUrl) continue;
          const result = await loadResource(candidateUrl);
          if (result.status !== "captured" || !result.path) continue;
          candidates.push(`./${result.path}${match?.[3] ? ` ${match[3]}` : ""}`);
        }
        if (candidates.length) node.setAttribute("srcset", candidates.join(", "));
        else node.removeAttribute("srcset");
      }

      const tagName = node.tagName.toLowerCase();
      if (tagName === "img" && !node.getAttribute("src") && !node.getAttribute("srcset")) {
        node.replaceWith(
          document.createTextNode(`资源抓取失败：${resourcePlaceholderLabel(node, "图片")}`)
        );
      } else if (
        (tagName === "video" || tagName === "audio") &&
        !node.getAttribute("src") &&
        !node.querySelector("source[src],source[srcset]")
      ) {
        node.replaceWith(
          document.createTextNode(`资源抓取失败：${tagName === "video" ? "视频" : "音频"}`)
        );
      } else if (
        tagName === "source" &&
        !node.getAttribute("src") &&
        !node.getAttribute("srcset")
      ) {
        node.remove();
      }
    }

    const markdown = convertArticleToMarkdown(document.body.innerHTML);
    const failedResources = [...resources.values()].filter(
      (resource) => resource.status === "failed"
    );
    return {
      markdown,
      title: prepared.title,
      url: prepared.url,
      warning: articleWarning(prepared, markdown, failedResources.length),
      resources: [...resources.values()],
    } satisfies ArticleMaterial;
  } finally {
    dom.window.close();
  }
}

export function extractArticle(html: Buffer, url: string): ArticleMaterial {
  const prepared = prepareArticle(html, url);
  const markdown = convertArticleToMarkdown(prepared.content);
  return {
    markdown,
    title: prepared.title,
    url,
    warning: articleWarning(prepared, markdown, 0),
    resources: [],
  };
}

export async function fetchArticle(target: string, options: ArticleFetchOptions = {}) {
  const result = await fetchArticleHtml(target, options);
  const dependencies: ExtractDependencies = {
    resolve: (hostname) => lookup(hostname, { all: true }),
    request: requestPage,
    ...options.dependencies,
  };
  return localizeArticleResources(prepareArticle(result.html, result.url), options, dependencies);
}
