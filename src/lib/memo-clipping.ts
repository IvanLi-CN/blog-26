import remarkParse from "remark-parse";
import { unified } from "unified";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

export type ClippingRecognition = {
  enabled: boolean;
  targetUrl: string | null;
  linkLabel: string | null;
  authorTitle: string | null;
  remarks: string;
  error: string | null;
};

export type ClippingStepState = "pending" | "processing" | "completed" | "failed";

export type ClippingReading = {
  targetUrl: string | null;
  sourceUrl: string | null;
  versionId: string | null;
  status: "invalid" | "queued" | "processing" | "completed" | "failed";
  summaryState: ClippingStepState;
  translationState: ClippingStepState;
  error: string | null;
  warning: string | null;
  usingPreviousVersion: boolean;
  sourceTranslationState?: ClippingStepState;
  translatedSegments?: number;
  segmentCount?: number;
};

const parser = unified().use(remarkParse);
const TAG = /(^|\s)#剪藏(?=$|[\s,.!?，。；：！？）)])/gu;

function clippingTagRanges(body: string) {
  const ranges: Array<[number, number]> = [];
  function visit(node: MarkdownNode) {
    if (node.type === "text" && node.position?.start.offset !== undefined) {
      const start = node.position.start.offset;
      const source = body.slice(start, node.position.end.offset);
      for (const match of source.matchAll(TAG)) {
        const offset = start + (match.index ?? 0) + match[1].length;
        ranges.push([offset, offset + "#剪藏".length]);
      }
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(parser.parse(body));
  return ranges;
}

export function recognizeClippingTarget(
  line: string
): { url: string; label: string | null } | null {
  const text = line
    .trim()
    .replace(/^#{1,3}[ \t]+/, "")
    .replace(/[ \t]+#+[ \t]*$/, "");
  let destination: string | undefined;
  let label: string | null = null;
  if (/^https?:\/\/\S+$/i.test(text)) {
    destination = text;
  } else {
    const root = parser.parse(text) as MarkdownNode;
    const paragraph = root.children?.[0];
    const link = paragraph?.children?.[0];
    if (
      root.children?.length !== 1 ||
      paragraph?.type !== "paragraph" ||
      paragraph.children?.length !== 1 ||
      link?.type !== "link"
    ) {
      return null;
    }
    destination = link.url;
    const plainText = (node: MarkdownNode): string =>
      node.value ?? node.children?.map(plainText).join("") ?? "";
    label = plainText(link).trim() || null;
  }
  if (!destination || !/^https?:\/\//i.test(destination)) return null;
  try {
    const url = new URL(destination);
    if (!url.hostname || url.username || url.password) return null;
    return { url: url.href, label: label === destination || label === url.href ? null : label };
  } catch {
    return null;
  }
}

export function recognizeMemoClipping(
  body: string,
  frontmatter: Record<string, unknown>
): ClippingRecognition {
  const ranges = clippingTagRanges(body);
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags
    : typeof frontmatter.tags === "string"
      ? frontmatter.tags.split(/[,，\s]+/)
      : [];
  const enabled = tags.some((tag) => tag === "剪藏" || tag === "#剪藏") || ranges.length > 0;
  const title = typeof frontmatter.title === "string" ? frontmatter.title.trim() : "";
  const titleTarget = title ? recognizeClippingTarget(title) : null;
  const line = /^(?:[^\S\n]*\n)*([^\n]*\S[^\n]*)(?:\n|$)/u.exec(body);
  const bodyTarget = line ? recognizeClippingTarget(line[1]) : null;
  const target = titleTarget ?? bodyTarget;
  const authorTitle = title && !titleTarget ? title : null;
  if (!enabled) {
    return {
      enabled: false,
      targetUrl: null,
      linkLabel: null,
      authorTitle,
      remarks: body,
      error: null,
    };
  }
  if (!target) {
    return {
      enabled: true,
      targetUrl: null,
      linkLabel: null,
      authorTitle,
      remarks: body,
      error: "请将第一条非空正文行改为完整的 HTTP(S) 链接或 Markdown 链接。也可使用纯链接标题。",
    };
  }
  if (!titleTarget && line) {
    const offset = line[0].indexOf(line[1]);
    ranges.push([offset, offset + line[1].length]);
  }
  const merged: Array<[number, number]> = [];
  for (const range of ranges.sort((left, right) => left[0] - right[0])) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push(range);
  }
  let remarks = body;
  for (const [start, end] of merged.reverse()) {
    remarks = remarks.slice(0, start) + remarks.slice(end);
  }
  return {
    enabled: true,
    targetUrl: target.url,
    linkLabel: target.label,
    authorTitle,
    remarks: remarks.trim(),
    error: null,
  };
}

export function composeClippingMemo(remarks: string, summary: string | null) {
  if (!summary) return remarks;
  const generated = `**Agent 摘要**\n\n${summary.trim()}`;
  return remarks.trim() ? `${remarks.trim()}\n\n---\n\n${generated}` : generated;
}
