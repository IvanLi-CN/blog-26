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

type DateLike = Date | number | string | null | undefined;

const RELATIVE_TIME_UNITS: Array<{
  unit: "year" | "month" | "week" | "day" | "hour" | "minute" | "second";
  ms: number;
}> = [
  { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
  { unit: "week", ms: 1000 * 60 * 60 * 24 * 7 },
  { unit: "day", ms: 1000 * 60 * 60 * 24 },
  { unit: "hour", ms: 1000 * 60 * 60 },
  { unit: "minute", ms: 1000 * 60 },
  { unit: "second", ms: 1000 },
];

const RELATIVE_UNIT_LABEL: Record<(typeof RELATIVE_TIME_UNITS)[number]["unit"], string> = {
  year: "年",
  month: "个月",
  week: "周",
  day: "天",
  hour: "小时",
  minute: "分钟",
  second: "秒",
};

function normalizeToMs(input: DateLike): number | null {
  if (!input) return null;

  if (input instanceof Date) {
    const value = input.getTime();
    return Number.isNaN(value) ? null : value;
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    const normalized = toMsTimestamp(input);
    return normalized > 0 ? normalized : null;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const numericValue = Number.parseFloat(trimmed);
      if (!Number.isFinite(numericValue)) return null;
      const normalized = toMsTimestamp(numericValue);
      return normalized > 0 ? normalized : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

export function formatAbsoluteDate(input: DateLike): string | null {
  const ms = normalizeToMs(input);
  if (ms === null) return null;
  const date = new Date(ms);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

export function toDate(input: DateLike): Date | null {
  const ms = normalizeToMs(input);
  if (ms === null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeTime(input: DateLike): string | null {
  const ms = normalizeToMs(input);
  if (ms === null) return null;

  const now = Date.now();
  const diff = ms - now;
  const absDiff = Math.abs(diff);

  if (absDiff < 30 * 1000) {
    return "刚刚";
  }

  for (const { unit, ms: unitMs } of RELATIVE_TIME_UNITS) {
    if (absDiff >= unitMs || unit === "second") {
      const value = Math.round(diff / unitMs);
      if (Math.abs(value) === 0) {
        return "刚刚";
      }

      // 为了更好阅读体验，添加空格（例："20 小时前"）
      const label = RELATIVE_UNIT_LABEL[unit];
      const magnitude = Math.abs(value);
      if (value <= 0) {
        return `${magnitude} ${label}前`;
      }

      return `${magnitude} ${label}后`;
    }
  }

  return null;
}

// 将时间戳统一归一化为毫秒（兼容秒/毫秒两种输入）
export const toMsTimestamp = (timestamp: number): number => {
  if (!timestamp) return 0;
  // 小于 1e12 基本可以判定为秒级时间戳
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
};

// 处理时间戳的日期格式化函数（自动兼容秒/毫秒）
export const getFormattedDateFromTimestamp = (timestamp: number): string => {
  if (!timestamp) return "";
  const date = new Date(toMsTimestamp(timestamp));
  return formatter.format(date);
};

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
    if (Number(formattedNumber) === parseInt(formattedNumber, 10)) {
      value = `${parseInt(formattedNumber, 10)}B`;
    } else {
      value = `${formattedNumber}B`;
    }
  } else if (amount >= 1000000) {
    const formattedNumber = (amount / 1000000).toFixed(1);
    if (Number(formattedNumber) === parseInt(formattedNumber, 10)) {
      value = `${parseInt(formattedNumber, 10)}M`;
    } else {
      value = `${formattedNumber}M`;
    }
  } else if (amount >= 1000) {
    const formattedNumber = (amount / 1000).toFixed(1);
    if (Number(formattedNumber) === parseInt(formattedNumber, 10)) {
      value = `${parseInt(formattedNumber, 10)}K`;
    } else {
      value = `${formattedNumber}K`;
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

  match = regex.exec(content);
  while (match !== null) {
    const hashIndex = match.index;

    // 检查是否是URL中的hash部分
    if (!isUrlHash(content, hashIndex)) {
      tags.push({
        content: match[1],
        fullMatch: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    match = regex.exec(content);
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
  return `${text.substring(0, maxLength)}...`;
}
