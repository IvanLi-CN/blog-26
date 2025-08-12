import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 日期格式化
export const formatter: Intl.DateTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export const getFormattedDate = (date: Date): string => (date ? formatter.format(date) : "");

export const trim = (str = "", ch?: string) => {
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
      value = parseInt(formattedNumber) + "B";
    } else {
      value = formattedNumber + "B";
    }
  } else if (amount >= 1000000) {
    const formattedNumber = (amount / 1000000).toFixed(1);
    if (Number(formattedNumber) === parseInt(formattedNumber)) {
      value = parseInt(formattedNumber) + "M";
    } else {
      value = formattedNumber + "M";
    }
  } else if (amount >= 1000) {
    const formattedNumber = (amount / 1000).toFixed(1);
    if (Number(formattedNumber) === parseInt(formattedNumber)) {
      value = parseInt(formattedNumber) + "K";
    } else {
      value = formattedNumber + "K";
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
 * 从文本中提取所有标签
 * @param content 要解析的文本内容
 * @returns 标签信息数组
 */
export const extractTags = (content: string): TagInfo[] => {
  const tags: TagInfo[] = [];
  const regex = /#([^\s#]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const hashIndex = match.index;

    // 检查是否是URL中的hash部分
    if (isUrlHash(content, hashIndex)) {
      continue;
    }

    tags.push({
      content: match[1],
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return tags;
};

/**
 * 生成随机字符串
 */
export function generateRandomString(length: number = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成数字验证码
 */
export function generateVerificationCode(length: number = 6): string {
  const chars = "0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 安全的 JSON 解析
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * 检查是否为有效的邮箱地址
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
