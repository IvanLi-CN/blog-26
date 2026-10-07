import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

type Node = {
  type: string;
  url?: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};
const parser = unified().use(remarkParse).use(remarkGfm);
export type ArticleSegment = { content: string; literal: boolean };

/** Split at Markdown block boundaries, keeping code byte-for-byte outside the model. */
export function articleSegments(markdown: string, limit = 6000): ArticleSegment[] {
  const nodes = (parser.parse(markdown) as Node).children ?? [];
  const segments: ArticleSegment[] = [];
  let content = "";
  const flush = () => {
    if (content.trim()) segments.push({ content: content.trim(), literal: false });
    content = "";
  };
  for (const node of nodes) {
    const block = markdown.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);
    if (node.type === "code") {
      flush();
      segments.push({ content: block, literal: true });
      continue;
    }
    if (block.length > 24_000 && ["table", "html"].includes(node.type))
      throw new Error("文章包含过大的表格或 HTML 区块；保留原文，译文尚未完成。");
    if (content.length + block.length > limit) flush();
    if (block.length > limit && !["table", "html"].includes(node.type)) {
      flush();
      let remaining = block;
      while (remaining.length > limit) {
        const breakAt = Math.max(
          remaining.lastIndexOf("\n", limit),
          remaining.lastIndexOf("。", limit),
          remaining.lastIndexOf(". ", limit),
          remaining.lastIndexOf(" ", limit)
        );
        let end = breakAt > limit / 2 ? breakAt + 1 : limit;
        if (/^[\uDC00-\uDFFF]/.test(remaining.slice(end))) end--;
        segments.push({ content: remaining.slice(0, end), literal: false });
        remaining = remaining.slice(end);
      }
      content = remaining;
    } else content += `${content ? "\n\n" : ""}${block}`;
  }
  flush();
  return segments;
}

function links(markdown: string) {
  const destinations: string[] = [];
  const visit = (node: Node) => {
    if (node.url) destinations.push(node.url);
    for (const child of node.children ?? []) visit(child);
  };
  visit(parser.parse(markdown));
  return destinations.sort();
}

export function validateTranslation(source: string, translation: string) {
  if (!translation.trim()) throw new Error("译文区块为空，尚未完成全文翻译。");
  if (JSON.stringify(links(source)) !== JSON.stringify(links(translation)))
    throw new Error("译文未保留原文链接，已停止提交；可重试。");
  const count = (text: string, type: string) => {
    let count = 0;
    const visit = (node: Node) => {
      if (node.type === type) count++;
      for (const child of node.children ?? []) visit(child);
    };
    visit(parser.parse(text));
    return count;
  };
  if (
    count(source, "heading") !== count(translation, "heading") ||
    count(source, "tableRow") !== count(translation, "tableRow")
  ) {
    throw new Error("译文遗漏了章节或表格行，已停止提交；可重试。");
  }
  const plainLength = (markdown: string) => {
    let size = 0;
    const visit = (node: Node & { value?: string }) => {
      if (node.value) size += node.value.replace(/\s/g, "").length;
      for (const child of node.children ?? []) visit(child);
    };
    visit(parser.parse(markdown));
    return size;
  };
  const originalSize = plainLength(source);
  if (originalSize > 300 && plainLength(translation) < originalSize * 0.12)
    throw new Error("译文明显缺少正文；保留原文和已保存的部分译文，请重试。");
}

export function retrievePassages(
  markdown: string,
  query: string,
  language: "原文" | "译文" = "原文"
) {
  const paragraphs = markdown.split(/\n\s*\n/).map((text, index) => ({ text, index: index + 1 }));
  const terms = [
    ...new Set(query.toLowerCase().match(/[a-z\d][a-z\d-]{1,}/g) ?? []),
    ...new Set(
      [...(query.match(/[\u3400-\u9fff]+/g) ?? [])].flatMap((phrase) =>
        phrase.length < 2
          ? [phrase]
          : [...Array(phrase.length - 1)].map((_, i) => phrase.slice(i, i + 2))
      )
    ),
  ];
  const ranked = paragraphs
    .map((passage) => ({
      ...passage,
      score: terms.reduce(
        (sum, term) => sum + Number(passage.text.toLowerCase().includes(term)),
        0
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 6)
    .sort((a, b) => a.index - b.index);
  return ranked
    .map(({ text, index }) => {
      const hits = terms
        .map((term) => text.toLowerCase().indexOf(term))
        .filter((offset) => offset >= 0);
      const start = Math.max(0, (hits.length ? Math.min(...hits) : 0) - 1200);
      return `[${language}段落 ${index}]\n${start ? "（段落节选）" : ""}${text.slice(start, start + 4000)}${start + 4000 < text.length ? "（后文省略）" : ""}`;
    })
    .join("\n\n");
}
