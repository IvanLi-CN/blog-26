export type AdminFileContentKind = "markdown" | "text" | "unsupported";

export const ADMIN_TEXT_FILE_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"]);
const TEXT_EXTENSIONS = new Set([
  "",
  "txt",
  "json",
  "yml",
  "yaml",
  "toml",
  "ini",
  "cfg",
  "csv",
  "log",
  "xml",
  "js",
  "ts",
  "css",
  "html",
]);

function getFileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? normalized;
}

export function getAdminFileExtension(filePath: string) {
  const fileName = getFileName(filePath);
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return "";
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function getAdminFileContentKind(filePath: string): AdminFileContentKind {
  const extension = getAdminFileExtension(filePath);
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return "markdown";
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  return "unsupported";
}

export function isAdminMarkdownFile(filePath: string) {
  return getAdminFileContentKind(filePath) === "markdown";
}

export function isAdminTextFile(filePath: string) {
  const kind = getAdminFileContentKind(filePath);
  return kind === "markdown" || kind === "text";
}
