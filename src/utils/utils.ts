// 默认 I18N 配置
const DEFAULT_I18N = {
  language: 'en',
  textDirection: 'ltr',
};

// 动态获取 I18N 配置
let I18N = DEFAULT_I18N;
try {
  const config = require('astrowind:config');
  I18N = config.I18N || DEFAULT_I18N;
} catch {
  // 使用默认配置
}

export const formatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(I18N?.language, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  // 移除 timeZone: 'UTC'，使用本地时区
});

export const getFormattedDate = (date: Date): string => (date ? formatter.format(date) : '');

export const trim = (str = '', ch?: string) => {
  let start = 0,
    end = str.length || 0;
  while (start < end && str[start] === ch) ++start;
  while (end > start && str[end - 1] === ch) --end;
  return start > 0 || end < str.length ? str.substring(start, end) : str;
};

// Function to format a number in thousands (K) or millions (M) format depending on its value
export const toUiAmount = (amount: number) => {
  if (!amount) return 0;

  let value: string;

  if (amount >= 1000000000) {
    const formattedNumber = (amount / 1000000000).toFixed(1);
    if (Number(formattedNumber) === parseInt(formattedNumber)) {
      value = parseInt(formattedNumber) + 'B';
    } else {
      value = formattedNumber + 'B';
    }
  } else if (amount >= 1000000) {
    const formattedNumber = (amount / 1000000).toFixed(1);
    if (Number(formattedNumber) === parseInt(formattedNumber)) {
      value = parseInt(formattedNumber) + 'M';
    } else {
      value = formattedNumber + 'M';
    }
  } else if (amount >= 1000) {
    const formattedNumber = (amount / 1000).toFixed(1);
    if (Number(formattedNumber) === parseInt(formattedNumber)) {
      value = parseInt(formattedNumber) + 'K';
    } else {
      value = formattedNumber + 'K';
    }
  } else {
    value = Number(amount).toFixed(0);
  }

  return value;
};

/**
 * 标签信息接口
 */
export interface TagInfo {
  content: string; // 标签内容（不包含 # 符号）
  fullMatch: string; // 完整匹配内容（包含 # 符号）
  startIndex: number; // 在文本中的开始位置
  endIndex: number; // 在文本中的结束位置
}

/**
 * 检查指定位置的#号是否是URL中的hash部分
 * @param content 完整内容
 * @param hashIndex #号的位置
 * @returns 如果是URL中的hash则返回true
 */
const isUrlHash = (content: string, hashIndex: number): boolean => {
  // 获取#号前面的内容，最多检查前200个字符
  const beforeHash = content.substring(Math.max(0, hashIndex - 200), hashIndex);

  // 检查是否是URL的一部分
  // 更精确的URL模式匹配
  const urlPatterns = [
    // 匹配 http:// 或 https:// 开头的URL，确保紧邻#号
    /https?:\/\/[^\s<>()]*$/,
    // 匹配 www. 开头的URL
    /(?:^|\s)www\.[^\s<>()]*$/,
    // 匹配域名格式（至少包含一个点）
    /(?:^|\s)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s<>()]*$/,
    // 匹配Markdown链接中的URL部分 ](url
    /\]\([^\s<>()]*$/,
  ];

  return urlPatterns.some((pattern) => pattern.test(beforeHash));
};

/**
 * 统一的标签解析函数
 * 从正文内容中解析所有标签，返回标签内容和位置信息
 * 注意：标签顺序与正文中出现的顺序一致，不进行去重
 * 会自动过滤掉URL中的hash部分，避免误识别为标签
 *
 * @param content 要解析的正文内容
 * @returns 标签信息数组，按在正文中出现的顺序排列
 */
export const parseTagsFromContent = (content: string): TagInfo[] => {
  const tags: TagInfo[] = [];

  // 使用正则表达式匹配标签：支持中文、英文、数字、下划线、连字符和斜杠
  // 匹配规则：#后跟一个或多个有效字符，直到遇到空白字符、#号或字符串结束
  const tagRegex = /#([a-zA-Z0-9\u4e00-\u9fa5_\-\/]+)/g;

  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(content)) !== null) {
    const fullMatch = match[0]; // 完整匹配，包含 # 符号
    const tagContent = match[1]; // 标签内容，不包含 # 符号
    const startIndex = match.index; // 开始位置
    const endIndex = match.index + fullMatch.length; // 结束位置

    // 检查是否是URL中的hash部分
    if (isUrlHash(content, startIndex)) {
      continue; // 跳过URL中的hash
    }

    // 过滤掉空标签或无效格式
    if (tagContent && tagContent.trim()) {
      tags.push({
        content: tagContent,
        fullMatch,
        startIndex,
        endIndex,
      });
    }
  }

  return tags;
};

/**
 * 从正文内容中移除标签
 * 从文末开始移除，避免位置偏移问题
 *
 * @param content 原始正文内容
 * @param tags 要移除的标签信息数组（可选，如果不提供则重新解析）
 * @returns 移除标签后的正文内容
 */
export const removeTagsFromContent = (content: string, tags?: TagInfo[]): string => {
  if (!tags) {
    tags = parseTagsFromContent(content);
  }

  // 按位置从后往前排序，避免移除时位置偏移
  const sortedTags = [...tags].sort((a, b) => b.startIndex - a.startIndex);

  let result = content;

  for (const tag of sortedTags) {
    // 从指定位置移除标签
    result = result.slice(0, tag.startIndex) + result.slice(tag.endIndex);
  }

  return result;
};
