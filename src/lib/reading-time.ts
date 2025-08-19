/**
 * 计算文章阅读时间
 * @param text 文章内容
 * @param wordsPerMinute 每分钟阅读字数，中文默认300字/分钟
 * @returns 阅读时间（分钟）
 */
export function calculateReadingTime(text: string, wordsPerMinute: number = 300): number {
  if (!text) return 0;

  // 移除 HTML 标签
  const cleanText = text.replace(/<[^>]*>/g, "");

  // 计算中文字符数
  const chineseChars = (cleanText.match(/[\u4e00-\u9fff]/g) || []).length;

  // 计算英文单词数
  const englishWords = cleanText
    .replace(/[\u4e00-\u9fff]/g, "") // 移除中文字符
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

  // 中文字符按字计算，英文按单词计算
  // 假设英文单词平均长度为5个字符
  const totalChars = chineseChars + englishWords * 5;

  // 计算阅读时间（分钟）
  const readingTime = Math.ceil(totalChars / wordsPerMinute);

  return Math.max(1, readingTime); // 最少1分钟
}

/**
 * 格式化阅读时间显示
 * @param minutes 阅读时间（分钟）
 * @returns 格式化的阅读时间字符串
 */
export function formatReadingTime(minutes: number): string {
  if (minutes < 1) return "1 分钟阅读";
  if (minutes === 1) return "1 分钟阅读";
  return `${minutes} 分钟阅读`;
}
