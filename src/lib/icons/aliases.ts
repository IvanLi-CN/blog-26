// 不使用本地硬编码映射，保持最小归一化工具集

export function normalizeKeyword(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/\s+/g, "");
  s = s.replace(/\./g, "dot");
  s = s.replace(/\+/g, "plus");
  s = s.replace(/#/g, "sharp");
  s = s.replace(/_/g, "");
  return s;
}

export function expandAliases(input: string): string[] {
  // 按你的要求，不做本地别名映射，仅返回原词与归一化形态
  const base = normalizeKeyword(input);
  return Array.from(new Set([input, base]));
}

// 仅使用“单色/非彩色”的品牌/技术/概念类图标集（默认允许列表）
export const ALLOWED_PREFIXES_DEFAULT = [
  // 品牌类（单色）
  "simple-icons",
  "cib",
  "fa6-brands",
  "bxl",
  // 概念/动作/通用 UI（线性/单色）
  "tabler",
  "line-md",
  "carbon",
  // 追加：Material Symbols 与 Game Icons（单色）
  "material-symbols",
  "game-icons",
];

export function getAllowedPrefixes(): string[] {
  const env = process.env.ICONIFY_ALLOWED_PREFIXES;
  if (!env) return ALLOWED_PREFIXES_DEFAULT;
  return env
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function isValidIconId(id: string): boolean {
  return /^[a-z0-9-]+:[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(id);
}
