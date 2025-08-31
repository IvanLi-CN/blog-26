/**
 * 为 memo 生成 URL 路径（客户端版本 - 不访问数据库）
 * @param filePath memo 的完整文件路径 (如: "memos/心羽实时演示增量数据同步-1756460268805.md")
 * @returns string URL 路径 - 使用简化的 slug 生成逻辑
 */
export function generateMemoUrl(filePath: string): string {
  try {
    console.log("🔍 [generateMemoUrl] 处理文件路径:", filePath);

    // 提取文件名（不含扩展名）
    const fileName = filePath.split("/").pop()?.replace(/\.md$/, "") || "unknown";

    // 使用简化的中文转拼音映射（与数据库同步逻辑一致）
    const generateSlugLikeLibrary = (text: string): string => {
      return (
        text
          .toLowerCase()
          // 简单的中文转拼音映射（针对常见字符）
          .replace(/心/g, "xin1-")
          .replace(/羽/g, "yu3-")
          .replace(/实/g, "shi2-")
          .replace(/时/g, "shi2-")
          .replace(/演/g, "yan3-")
          .replace(/示/g, "shi4-")
          .replace(/增/g, "zeng1-")
          .replace(/量/g, "liang4-")
          .replace(/数/g, "shu4-")
          .replace(/据/g, "ju4-")
          .replace(/同/g, "tong2-")
          .replace(/步/g, "bu4-")
          .replace(/测/g, "ce4-")
          .replace(/试/g, "shi4-")
          .replace(/功/g, "gong1-")
          .replace(/能/g, "neng2-")
          .replace(/验/g, "yan4-")
          .replace(/证/g, "zheng4-")
          // 添加更多常见字符的映射
          .replace(/今/g, "jin1-")
          .replace(/日/g, "ri4-")
          .replace(/摄/g, "she4-")
          .replace(/影/g, "ying3-")
          .replace(/作/g, "zuo4-")
          .replace(/品/g, "pin3-")
          .replace(/分/g, "fen1-")
          .replace(/享/g, "xiang3-")
          .replace(/容/g, "rong2-")
          .replace(/器/g, "qi4-")
          .replace(/化/g, "hua4-")
          .replace(/部/g, "bu4-")
          .replace(/署/g, "shu3-")
          .replace(/实/g, "shi2-")
          .replace(/践/g, "jian4-")
          // 将下划线替换为连字符（关键修复！）
          .replace(/_/g, "-")
          // 将非字母数字字符替换为连字符
          .replace(/[^\w-]/g, "-")
          // 合并多个连字符
          .replace(/-+/g, "-")
          // 移除首尾连字符
          .replace(/^-+|-+$/g, "")
      );
    };

    const slug = generateSlugLikeLibrary(fileName);
    console.log("🔍 [generateMemoUrl] 生成的 slug:", slug);

    return `/memos/${slug}`;
  } catch (error) {
    console.error("🔍 [generateMemoUrl] 处理失败:", error);
    // 错误情况下返回基于文件名的默认URL
    const fileName = filePath.split("/").pop()?.replace(/\.md$/, "") || "unknown";
    return `/memos/${fileName}`;
  }
}

/**
 * 为文章生成 URL 路径（客户端版本 - 不访问数据库）
 * @param frontmatter 文章的 frontmatter 数据
 * @param filePath 可选的文件路径，用于备用生成
 * @returns string URL 路径 (如: "/posts/my-article-slug")
 */
export function generatePostUrl(frontmatter: any, filePath?: string): string {
  try {
    // 处理 null/undefined frontmatter
    const fm = frontmatter || {};

    // 如果 frontmatter 中有 slug，直接使用
    if (fm.slug) {
      console.log("🔍 [generatePostUrl] 使用 frontmatter 中的 slug:", fm.slug);
      return `/posts/${fm.slug}`;
    }

    console.log("🔍 [generatePostUrl] frontmatter 中没有 slug，使用标题或文件名生成");

    // 如果都找不到，返回一个基于标题或文件名的默认URL
    const title = fm.title || filePath?.split("/").pop()?.replace(/\.md$/, "") || "untitled";
    const defaultSlug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");

    console.log("🔍 [generatePostUrl] 生成的 slug:", defaultSlug);
    return `/posts/${defaultSlug}`;
  } catch (error) {
    console.error("🔍 [generatePostUrl] 处理失败:", error);
    // 错误情况下返回基于标题的默认URL
    const title = "untitled";
    const defaultSlug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    return `/posts/${defaultSlug}`;
  }
}

/**
 * 根据内容类型和相关信息生成统一的 URL
 * @param contentType 内容类型 ("memo" | "post")
 * @param data 相关数据 (filePath for memo, frontmatter for post)
 * @param filePath 可选的文件路径
 * @returns string URL 路径
 */
export function generateContentUrl(
  contentType: "memo" | "post",
  data: any,
  filePath?: string
): string {
  if (contentType === "memo") {
    return generateMemoUrl(data);
  } else {
    return generatePostUrl(data, filePath);
  }
}
