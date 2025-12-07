/**
 * Markdown 标签解析工具
 *
 * 提供针对闪念内容的标签提取、位置标记与正文清理能力，
 * 支持层级标签（`#parent/child`）并跳过 URL hash 片段。
 */

export interface TagPosition {
  /** 标签在原始内容中的起始字符索引（0-based） */
  start: number;
  /** 标签在原始内容中的结束字符索引（0-based，exclusive） */
  end: number;
  /** 标签所在的行号（1-based） */
  line: number;
  /** 标签在所在行的列号（1-based） */
  column: number;
  /** 标签原始长度（包含 `#` 前缀与层级分隔符） */
  length: number;
}

export interface ParsedTag {
  /** 包含层级信息的标签名称（不含 `#` 前缀） */
  name: string;
  /** 完整的原始匹配（包含 `#` 前缀） */
  raw: string;
  /** 按 `/` 分割的层级数组，便于上层做层级展示 */
  segments: string[];
  /** 位置描述信息 */
  position: TagPosition;
}

export interface ParseTagsResult {
  /** 解析得到的标签列表（去重，按首次出现顺序） */
  tags: ParsedTag[];
  /** 移除标签并清理空行后的正文 */
  cleanedContent: string;
}

// 匹配内联标签，支持层级结构（#parent/child/sub-child）
const TAG_PATTERN = /#([\w\u4e00-\u9fff-]+(?:\/[\w\u4e00-\u9fff-]+)*)/g;

/**
 * 判断当前 `#` 是否位于 URL 的 hash 片段内。
 */
function isPartOfUrlHash(content: string, hashIndex: number): boolean {
  const preview = content.substring(Math.max(0, hashIndex - 200), hashIndex);
  const urlPatterns = [
    /https?:\/\/[^\s<>()]*$/i,
    /(?:^|\s)www\.[^\s<>()]*$/i,
    /(?:^|\s)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s<>()]*$/i,
    /\]\([^\s<>()]*$/,
  ];
  return urlPatterns.some((pattern) => pattern.test(preview));
}

/**
 * 预计算换行符索引，便于快速换算行列。
 */
function collectNewlineIndices(content: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * 基于预计算的换行信息，将字符索引转换为行列号。
 */
function computeLineColumn(
  index: number,
  newlineIndices: number[]
): { line: number; column: number } {
  if (newlineIndices.length === 0) {
    return { line: 1, column: index + 1 };
  }

  let left = 0;
  let right = newlineIndices.length - 1;
  let lastBreakIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const value = newlineIndices[mid];
    if (value < index) {
      lastBreakIndex = value;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  const line = left + 1; // 行号 = 小于当前位置的换行数量 + 1
  const column = index - lastBreakIndex;

  return { line, column };
}

/**
 * 提取 Markdown 内容中的标签详情。
 *
 * @param content 原始 Markdown 正文
 * @returns 标签详情列表（去重）
 */
export function extractInlineTagDetails(content: string): ParsedTag[] {
  if (!content) return [];

  TAG_PATTERN.lastIndex = 0;
  const newlineIndices = collectNewlineIndices(content);
  const seen = new Map<string, ParsedTag>();

  let match: RegExpExecArray | null = TAG_PATTERN.exec(content);
  while (match) {
    const raw = match[0];
    const name = match[1].trim();
    const start = match.index;

    if (!name || isPartOfUrlHash(content, start)) {
      match = TAG_PATTERN.exec(content);
      continue;
    }

    if (!seen.has(name)) {
      const end = start + raw.length;
      const { line, column } = computeLineColumn(start, newlineIndices);
      seen.set(name, {
        name,
        raw,
        segments: name.split("/"),
        position: {
          start,
          end,
          line,
          column,
          length: raw.length,
        },
      });
    }

    match = TAG_PATTERN.exec(content);
  }

  return Array.from(seen.values()).sort((a, b) => a.position.start - b.position.start);
}

/**
 * 移除标签并清理多余空行、空白字符。
 */
function buildCleanContent(content: string, tagDetails: ParsedTag[]): string {
  if (!content || tagDetails.length === 0) {
    return content?.trim() ?? "";
  }

  const segments: string[] = [];
  let cursor = 0;

  for (const tag of tagDetails) {
    // 默认从标签起始位置开始移除
    let removeStart = tag.position.start;

    // 特殊处理形如 "\#Tag" 的情况：
    // 当标签前紧挨着一个反斜杠时，这个反斜杠通常是为了在原文里“转义” #，
    // 对于我们这种“把标签从正文中剥离”的场景，应当把这个反斜杠一并移除，
    // 否则在标签被清理掉后，会残留一行孤立的 "\"。
    if (removeStart > 0 && content[removeStart - 1] === "\\") {
      removeStart -= 1;
    }

    if (cursor < removeStart) {
      segments.push(content.slice(cursor, removeStart));
    }
    cursor = Math.max(cursor, tag.position.end);
  }

  if (cursor < content.length) {
    segments.push(content.slice(cursor));
  }

  let cleaned = segments.join("");

  // 将多余空白压缩，移除行尾空格与冗余空行
  cleaned = cleaned
    .replace(/[ \t]+/g, " ")
    .replace(/ +$/gm, "")
    .replace(/\r\n/g, "\n");

  const lines = cleaned.split("\n");
  const normalized: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      // 避免连续空行
      if (normalized.length === 0 || normalized[normalized.length - 1] === "") {
        continue;
      }
      normalized.push("");
    } else {
      normalized.push(line);
    }
  }

  return normalized.join("\n").trim();
}

/**
 * 解析 Markdown 内容，返回标签信息与清理后的正文。
 */
export function parseContentTags(content: string): ParseTagsResult {
  const tagDetails = extractInlineTagDetails(content);
  const cleanedContent = buildCleanContent(content, tagDetails);

  return {
    tags: tagDetails,
    cleanedContent,
  };
}

/**
 * 简化工具：仅返回清理后的内容。
 */
export function removeInlineTags(content: string): string {
  return parseContentTags(content).cleanedContent;
}
