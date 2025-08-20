/**
 * Markdown 内容处理工具函数
 */

/**
 * 智能截断 Markdown 内容，保持语法完整性
 * @param content - 原始 Markdown 内容
 * @param maxLength - 最大字符长度（大致）
 * @param maxParagraphs - 最大段落数
 * @returns 截断后的 Markdown 内容
 */
export function smartTruncateMarkdown(
  content: string,
  maxLength: number = 200,
  maxParagraphs: number = 3
): string {
  if (!content?.trim()) return "";

  // 按段落分割内容
  const paragraphs = content
    .split(/\n\s*\n/) // 按空行分割段落
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return "";

  let result = "";
  let currentLength = 0;
  let paragraphCount = 0;

  for (const paragraph of paragraphs) {
    // 检查是否超过段落数限制
    if (paragraphCount >= maxParagraphs) break;

    // 检查添加这个段落是否会超过长度限制
    const potentialLength = currentLength + paragraph.length + (result ? 2 : 0); // +2 for \n\n

    if (potentialLength > maxLength && result) {
      // 如果已经有内容且会超长，就停止
      break;
    }

    // 添加段落
    if (result) {
      result += "\n\n";
      currentLength += 2;
    }
    result += paragraph;
    currentLength += paragraph.length;
    paragraphCount++;
  }

  // 如果截断了内容，添加省略号
  const wasTruncated =
    paragraphCount < paragraphs.length || currentLength < content.replace(/\s+/g, " ").length;

  if (wasTruncated) {
    result += "\n\n...";
  }

  return result;
}

/**
 * 提取 Markdown 内容的纯文本摘要
 * @param content - Markdown 内容
 * @param maxLength - 最大长度
 * @returns 纯文本摘要
 */
export function extractTextSummary(content: string, maxLength: number = 150): string {
  if (!content?.trim()) return "";

  // 移除 Markdown 语法
  let text = content
    // 移除标题标记
    .replace(/^#{1,6}\s+/gm, "")
    // 移除粗体和斜体
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // 移除链接，保留文本
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // 移除图片
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    // 移除代码块
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // 移除引用标记
    .replace(/^>\s+/gm, "")
    // 移除列表标记
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    // 移除多余的空白
    .replace(/\n\s*\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  // 截断到指定长度
  if (text.length > maxLength) {
    text = `${text.substring(0, maxLength).replace(/\s+\S*$/, "")}...`;
  }

  return text;
}

/**
 * 检查 Markdown 内容是否包含特定元素
 * @param content - Markdown 内容
 * @returns 包含的元素类型
 */
export function analyzeMarkdownContent(content: string) {
  if (!content?.trim()) {
    return {
      hasHeadings: false,
      hasLists: false,
      hasLinks: false,
      hasImages: false,
      hasCode: false,
      hasBlockquotes: false,
      hasTables: false,
      wordCount: 0,
      estimatedReadingTime: 0,
    };
  }

  const hasHeadings = /^#{1,6}\s+/m.test(content);
  const hasLists = /^[-*+]\s+|^\d+\.\s+/m.test(content);
  const hasLinks = /\[([^\]]+)\]\([^)]+\)/.test(content);
  const hasImages = /!\[([^\]]*)\]\([^)]+\)/.test(content);
  const hasCode = /```[\s\S]*?```|`[^`]+`/.test(content);
  const hasBlockquotes = /^>\s+/m.test(content);
  const hasTables = /\|.*\|/.test(content);

  // 计算字数（中文字符和英文单词）
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
  const wordCount = chineseChars + englishWords;

  // 估算阅读时间（中文200字/分钟，英文200词/分钟）
  const estimatedReadingTime = Math.ceil(wordCount / 200);

  return {
    hasHeadings,
    hasLists,
    hasLinks,
    hasImages,
    hasCode,
    hasBlockquotes,
    hasTables,
    wordCount,
    estimatedReadingTime,
  };
}

/**
 * 为预览优化 Markdown 内容
 * @param content - 原始内容
 * @param options - 优化选项
 * @returns 优化后的内容
 */
export function optimizeForPreview(
  content: string,
  options: {
    maxLength?: number;
    maxParagraphs?: number;
    removeImages?: boolean;
    simplifyHeadings?: boolean;
  } = {}
): string {
  const {
    maxLength = 200,
    maxParagraphs = 3,
    removeImages = false,
    simplifyHeadings = true,
  } = options;

  if (!content?.trim()) return "";

  let optimized = content;

  // 移除图片（可选）
  if (removeImages) {
    optimized = optimized.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
  }

  // 简化标题层级（可选）
  if (simplifyHeadings) {
    // 将所有标题降级，最高为 h2
    optimized = optimized.replace(/^#{4,6}\s+/gm, "### ");
    optimized = optimized.replace(/^#{3}\s+/gm, "### ");
    optimized = optimized.replace(/^#{2}\s+/gm, "## ");
    optimized = optimized.replace(/^#{1}\s+/gm, "# ");
  }

  // 智能截断
  return smartTruncateMarkdown(optimized, maxLength, maxParagraphs);
}
