export interface ContentSource {
  type: "local" | "webdav" | "database";
  filePath: string;
}

/**
 * 二元ID架构：统一的文章标识符
 * 所有文章都使用 source + path 作为唯一标识
 */
export interface ArticleIdentifier {
  source: "local" | "webdav" | "database";
  path: string;
}

/**
 * 创建统一的标签页ID：source:path
 */
export function createTabId(identifier: ArticleIdentifier): string {
  return `${identifier.source}:${identifier.path}`;
}

/**
 * 解析标签页ID为二元标识符
 */
export function parseTabId(tabId: string): ArticleIdentifier | null {
  const [source, ...pathParts] = tabId.split(":");
  if (!source || pathParts.length === 0) return null;

  return {
    source: source as ArticleIdentifier["source"],
    path: pathParts.join(":"), // 重新拼接，防止path中包含冒号
  };
}

/**
 * 从旧的ContentSource创建ArticleIdentifier
 * 兼容不同的ContentSource结构
 */
export function contentSourceToIdentifier(contentSource: any): ArticleIdentifier {
  // 兼容不同的字段名：type 或 source
  const sourceType = contentSource.type || contentSource.source;

  return {
    source: sourceType as ArticleIdentifier["source"],
    path: contentSource.filePath,
  };
}

/**
 * 从ArticleIdentifier创建ContentSource
 */
export function identifierToContentSource(identifier: ArticleIdentifier): ContentSource {
  return {
    type: identifier.source,
    filePath: identifier.path,
  };
}

/**
 * URL参数处理：支持两种模式
 * 1. ?slug=hello-world (通过数据库查询获取source+path)
 * 2. ?source=local&path=blog/hello-world.md (直接指定)
 */
export function parseUrlParams(searchParams: URLSearchParams): ArticleIdentifier | null {
  const source = searchParams.get("source");
  const path = searchParams.get("path");
  const slug = searchParams.get("slug");

  // 直接指定source+path模式
  if (source && path) {
    return {
      source: source as ArticleIdentifier["source"],
      path: decodeURIComponent(path),
    };
  }

  // slug模式（需要查询数据库，暂时返回null）
  if (slug) {
    // TODO: 实现通过slug查询数据库获取source+path
    console.log(`[EditorTypes] 需要通过slug查询: ${slug}`);
    return null;
  }

  return null;
}

/**
 * 生成URL参数：优先使用source+path模式
 */
export function generateUrlParams(identifier: ArticleIdentifier): string {
  const params = new URLSearchParams();
  params.set("source", identifier.source);
  params.set("path", encodeURIComponent(identifier.path));
  return params.toString();
}
