/**
 * 统一的图片处理工具函数
 *
 * 提供 Base64 内联图片转换功能，支持：
 * - 幂等性检查：防止重复处理已转换的内容
 * - 数据完整性：确保转换过程无损
 * - 多种内容源：支持 local 和 webdav
 * - 灵活的返回格式：相对路径或 API 路径
 */

import { nanoid } from "nanoid";

/**
 * 图片处理选项
 */
export interface ProcessInlineImagesOptions {
  /** 内容源类型 */
  contentSource: "local" | "webdav";
  /** 文章路径，用于生成 slug 和 assets 路径 */
  articlePath: string;
  /** 可选的自定义上传基础路径 */
  uploadBasePath?: string;
  /** 返回格式：相对路径或 API 路径 */
  returnFormat: "relative" | "api";
  /** 是否启用详细日志 */
  enableLogging?: boolean;
  /** 自定义文章 slug，优先于从路径生成的 slug */
  customSlug?: string;
}

/**
 * 图片处理结果
 */
export interface ProcessInlineImagesResult {
  /** 处理后的内容 */
  content: string;
  /** 是否有内容被修改 */
  hasChanges: boolean;
  /** 处理的图片数量 */
  processedCount: number;
  /** 跳过的图片数量（已处理） */
  skippedCount: number;
  /** 错误信息 */
  errors: string[];
}

/**
 * Base64 图片匹配的正则表达式
 */
// const BASE64_IMAGE_REGEX = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;

/**
 * 已处理图片的正则表达式（用于幂等性检查）
 */
// const PROCESSED_IMAGE_PATTERNS = [
//   /!\[([^\]]*)\]\(\.\/assets\/[^)]+\)/g, // 相对路径格式
//   /!\[([^\]]*)\]\(\/api\/files\/[^)]+\)/g, // API 路径格式
//   /!\[([^\]]*)\]\(https?:\/\/[^)]+\)/g, // 外部 URL
// ];

/**
 * 检查内容是否包含 Base64 图片
 */
function hasBase64Images(content: string): boolean {
  // 创建新的正则表达式实例，避免全局正则的状态问题
  const regex = /!\[([^\]]*)\]\s*\(\s*data:image\/([^;]+);base64,([^)]+)\s*\)/;
  return regex.test(content);
}

/**
 * 检查内容是否已经被处理过（幂等性检查）
 */
function hasProcessedImages(content: string): boolean {
  // 创建新的正则表达式实例，避免全局正则的状态问题
  const patterns = [
    /!\[([^\]]*)\]\(\.\/assets\/[^)]+\)/, // 相对路径格式
    /!\[([^\]]*)\]\(\/api\/files\/[^)]+\)/, // API 路径格式
    /!\[([^\]]*)\]\(https?:\/\/[^)]+\)/, // 外部 URL
  ];
  return patterns.some((pattern) => pattern.test(content));
}

/**
 * 反转义 Markdown 语法（处理 Milkdown 编辑器的转义）
 */
function unescapeMarkdown(content: string): string {
  return content
    .replace(/\\!/g, "!") // 反转义 !
    .replace(/\\\[/g, "[") // 反转义 [
    .replace(/\\\]/g, "]") // 反转义 ]
    .replace(/\\\(/g, "(") // 反转义 (
    .replace(/\\\)/g, ")"); // 反转义 )
}

/**
 * 从文章路径生成简单的 slug（仅作为后备方案）
 */
function generateSimpleSlugFromPath(articlePath: string): string {
  if (!articlePath) return "untitled";

  // 移除 __NEW__ 前缀（如果存在）
  const cleanPath = articlePath.startsWith("__NEW__")
    ? articlePath.replace("__NEW__", "")
    : articlePath;

  // 提取文件名（去掉路径和扩展名）
  const pathParts = cleanPath.split("/");
  const fileName = pathParts.pop() || "untitled";
  const fileNameWithoutExt = fileName.replace(/\.(md|markdown)$/i, "");

  // 简单处理：如果文件名为空或太短，返回 untitled
  return fileNameWithoutExt || "untitled";
}

/**
 * 根据文章路径生成对应的 assets 目录路径
 */
function generateAssetsPath(articlePath: string): string {
  // 移除 __NEW__ 前缀（如果存在）
  const cleanPath = articlePath.startsWith("__NEW__")
    ? articlePath.replace("__NEW__", "")
    : articlePath;

  // 提取目录路径（去掉文件名）
  const pathParts = cleanPath.split("/");
  pathParts.pop(); // 移除文件名部分
  const directoryPath = pathParts.join("/");

  // 构建 assets 路径
  if (directoryPath) {
    return `${directoryPath}/assets`;
  } else {
    // 如果文件在根目录，则 assets 也在根目录
    return "assets";
  }
}

/**
 * 验证 Base64 数据的有效性
 */
function validateBase64(base64Data: string): boolean {
  try {
    const normalized = base64Data.replace(/\s+/g, "");
    // 尝试解码 Base64 数据
    const decoded = atob(normalized);
    return decoded.length > 0;
  } catch {
    return false;
  }
}

/**
 * 将 Base64 数据转换为 Blob
 */
function base64ToBlob(base64Data: string, mimeType: string): Blob {
  const normalized = base64Data.replace(/\s+/g, "");
  const byteCharacters = atob(normalized);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: `image/${mimeType}` });
}

/**
 * 上传图片文件
 */
async function uploadImage(
  blob: Blob,
  uploadPath: string,
  contentSource: "local" | "webdav",
  mimeType: string
): Promise<void> {
  const uploadUrl =
    contentSource === "webdav"
      ? `/api/files/webdav/${uploadPath}`
      : `/api/files/local/${uploadPath}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": `image/${mimeType}`,
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`上传失败: ${response.status} ${response.statusText}`);
  }
}

/**
 * 生成图片的最终路径
 */
function generateImagePath(filename: string, options: ProcessInlineImagesOptions): string {
  if (options.returnFormat === "relative") {
    return `./assets/${filename}`;
  } else {
    // API 路径格式
    const basePath = options.uploadBasePath || generateAssetsPath(options.articlePath);
    return `/api/files/${options.contentSource}/${basePath}/${filename}`;
  }
}

/**
 * 处理内联 Base64 图片转换
 *
 * @param content 要处理的内容
 * @param options 处理选项
 * @returns 处理结果
 */
export async function processInlineImages(
  content: string,
  options: ProcessInlineImagesOptions
): Promise<ProcessInlineImagesResult> {
  const result: ProcessInlineImagesResult = {
    content,
    hasChanges: false,
    processedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  // 输入验证
  if (!content || typeof content !== "string") {
    return result;
  }

  const log = options.enableLogging
    ? console.log
    : () => {
        // 空函数，用于禁用日志输出
      };

  log("🔍 [ImageProcessing] 开始处理内联图片:", {
    contentLength: content.length,
    contentSource: options.contentSource,
    returnFormat: options.returnFormat,
  });

  // 反转义处理
  const unescapedContent = unescapeMarkdown(content);

  log("🔧 [ImageProcessing] 反转义处理完成:", {
    originalLength: content.length,
    unescapedLength: unescapedContent.length,
    hasBase64: hasBase64Images(unescapedContent),
    hasProcessed: hasProcessedImages(unescapedContent),
  });

  // 幂等性检查：如果没有 Base64 图片，直接返回
  if (!hasBase64Images(unescapedContent)) {
    log("✅ [ImageProcessing] 没有发现 Base64 图片，跳过处理");
    return result;
  }

  // 查找所有 Base64 图片
  // 创建新的正则表达式实例，避免全局正则的状态问题
  const base64ImageRegex = /!\[([^\]]*)\]\s*\(\s*data:image\/([^;]+);base64,([^)]+)\s*\)/g;
  const matches = Array.from(unescapedContent.matchAll(base64ImageRegex));

  log("🔍 [ImageProcessing] 发现 Base64 图片:", {
    count: matches.length,
    matches: matches.map((m) => ({
      altText: m[1],
      imageType: m[2],
      base64Length: m[3]?.length || 0,
    })),
  });

  let processedContent = unescapedContent;
  // 如果提供了自定义 slug，直接使用；否则从路径生成简单的 slug
  const articleSlug = options.customSlug || generateSimpleSlugFromPath(options.articlePath);
  const assetsPath = options.uploadBasePath || generateAssetsPath(options.articlePath);

  log("🔧 [ImageProcessing] Slug 生成调试:", {
    customSlug: options.customSlug,
    customSlugType: typeof options.customSlug,
    customSlugLength: options.customSlug?.length,
    articlePath: options.articlePath,
    generatedSlug: generateSimpleSlugFromPath(options.articlePath),
    finalSlug: articleSlug,
    finalSlugLength: articleSlug.length,
  });

  // 处理每个 Base64 图片
  for (const match of matches) {
    const [fullMatch, altText, imageType, base64Data] = match;

    try {
      log("🖼️ [ImageProcessing] 处理图片:", {
        altText,
        imageType,
        base64Length: base64Data.length,
      });

      // 验证 Base64 数据
      if (!validateBase64(base64Data)) {
        const error = `无效的 Base64 数据: ${altText}`;
        result.errors.push(error);
        log(`❌ [ImageProcessing] ${error}`);
        continue;
      }

      // 生成唯一文件名
      const uniqueId = nanoid(8);
      const filename = `${articleSlug}-${uniqueId}.${imageType}`;
      const uploadPath = `${assetsPath}/${filename}`;

      // 转换为 Blob
      const blob = base64ToBlob(base64Data, imageType);

      // 上传文件
      await uploadImage(blob, uploadPath, options.contentSource, imageType);

      // 生成新的图片路径
      const imagePath = generateImagePath(filename, options);
      const newImageMarkdown = `![${altText}](${imagePath})`;

      // 替换原始内容
      processedContent = processedContent.replace(fullMatch, newImageMarkdown);

      result.processedCount++;

      log("✅ [ImageProcessing] 图片处理成功:", {
        filename,
        imagePath,
        newMarkdown: newImageMarkdown,
      });
    } catch (error) {
      const errorMsg = `处理图片失败 (${altText}): ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      log(`❌ [ImageProcessing] ${errorMsg}`);
      // 继续处理其他图片，不中断整个流程
    }
  }

  result.content = processedContent;
  result.hasChanges = result.processedCount > 0;

  log("🎉 [ImageProcessing] 处理完成:", {
    processedCount: result.processedCount,
    skippedCount: result.skippedCount,
    errorCount: result.errors.length,
    hasChanges: result.hasChanges,
  });

  return result;
}

/**
 * 简化的处理函数，保持与现有组件的兼容性
 */
export async function processInlineImagesCompat(
  content: string,
  contentSource: "local" | "webdav",
  articlePath: string,
  returnFormat: "relative" | "api" = "relative",
  customSlug?: string
): Promise<string> {
  const result = await processInlineImages(content, {
    contentSource,
    articlePath,
    returnFormat,
    enableLogging: true,
    customSlug, // 传递自定义 slug
  });

  // 如果有错误，记录但不抛出异常，保持现有行为
  if (result.errors.length > 0) {
    console.warn("⚠️ [ImageProcessing] 处理过程中出现错误:", result.errors);
  }

  return result.content;
}
