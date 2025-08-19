export interface TocItem {
  id: string;
  title: string;
  level: number;
  children?: TocItem[];
}

/**
 * 从 Markdown 内容中提取目录
 * @param content Markdown 内容
 * @returns 目录项数组
 */
export function extractTableOfContents(content: string): TocItem[] {
  if (!content) return [];

  // 匹配 Markdown 标题
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: { level: number; title: string; id: string }[] = [];

  let match: RegExpExecArray | null = headingRegex.exec(content);
  while (match !== null) {
    const level = match[1].length;
    const title = match[2].trim();
    const id = generateHeadingId(title);

    headings.push({ level, title, id });
    match = headingRegex.exec(content);
  }

  // 构建层级结构
  return buildTocTree(headings);
}

/**
 * 生成标题 ID
 * @param title 标题文本
 * @returns 标题 ID
 */
function generateHeadingId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "") // 保留中文、英文、数字、空格、连字符
    .replace(/\s+/g, "-") // 空格替换为连字符
    .replace(/-+/g, "-") // 多个连字符合并为一个
    .replace(/^-|-$/g, ""); // 移除首尾连字符
}

/**
 * 构建目录树结构
 * @param headings 标题数组
 * @returns 目录树
 */
function buildTocTree(headings: { level: number; title: string; id: string }[]): TocItem[] {
  const result: TocItem[] = [];
  const stack: TocItem[] = [];

  for (const heading of headings) {
    const item: TocItem = {
      id: heading.id,
      title: heading.title,
      level: heading.level,
      children: [],
    };

    // 找到合适的父级
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(item);
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(item);
    }

    stack.push(item);
  }

  return result;
}
