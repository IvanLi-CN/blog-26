/**
 * 内容异常检测工具
 *
 * 用于检测 Markdown/文本内容中的潜在异常数据，例如 base64 内嵌图片等。
 */

export interface ContentAnomalies {
  hasInlineDataImages: boolean;
  inlineImageCount: number;
  largeInlineImageCount: number;
  details: string[];
}

/**
 * 检测内容中的异常数据
 * - base64 内嵌图片：data:image/*;base64,
 * - 大尺寸 base64 图片：阈值默认 ~50KB（base64 长度约 > 68KB）
 */
export function detectContentAnomalies(content: string): ContentAnomalies {
  const result: ContentAnomalies = {
    hasInlineDataImages: false,
    inlineImageCount: 0,
    largeInlineImageCount: 0,
    details: [],
  };

  if (!content?.trim()) return result;

  // 匹配 data:image/*;base64,xxxx
  const dataImageRegex = /data:image\/[a-zA-Z.+-]+;base64,[A-Za-z0-9+/=]+/g;
  const matches = content.match(dataImageRegex) || [];

  if (matches.length > 0) {
    result.hasInlineDataImages = true;
    result.inlineImageCount = matches.length;
    result.details.push(`包含 base64 内嵌图片 ${matches.length} 处`);

    // 粗略估算大小（base64 字符长度 * 3/4）。阈值：50KB
    const LARGE_THRESHOLD_BYTES = 50 * 1024; // 50KB
    for (const m of matches) {
      const base64Part = m.split(",")[1] || "";
      const approxBytes = Math.floor((base64Part.length * 3) / 4);
      if (approxBytes >= LARGE_THRESHOLD_BYTES) {
        result.largeInlineImageCount += 1;
      }
    }

    if (result.largeInlineImageCount > 0) {
      result.details.push(`其中较大（≥50KB）的内嵌图片 ${result.largeInlineImageCount} 处`);
    }
  }

  return result;
}
