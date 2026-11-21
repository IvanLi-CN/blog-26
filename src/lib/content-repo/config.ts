export const CONTENT_REPO_DEFAULT_REF = "main";
export const CONTENT_REPO_MAX_POST_FILE_BYTES = 50 * 1024 * 1024;
export const CONTENT_REPO_MAX_MEMO_FILE_BYTES = 20 * 1024 * 1024;
export const CONTENT_REPO_MAX_BATCH_CONTENTS = 200;

const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u;

export interface ContentRepoConfig {
  repository: string;
  ref: string;
  token: string | null;
}

export class ContentRepoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentRepoConfigError";
  }
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function readContentRepoConfig(
  env: Record<string, string | undefined> = process.env
): ContentRepoConfig {
  const repository = env.CONTENT_REPO_REPOSITORY?.trim() ?? "";
  const ref = env.CONTENT_REPO_REF?.trim() || CONTENT_REPO_DEFAULT_REF;
  const token = env.CONTENT_REPO_TOKEN?.trim() || null;

  if (!repository) throw new ContentRepoConfigError("CONTENT_REPO_REPOSITORY is not configured");
  if (!REPOSITORY_PATTERN.test(repository))
    throw new ContentRepoConfigError("CONTENT_REPO_REPOSITORY must be owner/repository");
  if (!ref || ref.length > 255 || /\s/u.test(ref) || hasControlCharacter(ref) || ref.includes(".."))
    throw new ContentRepoConfigError("CONTENT_REPO_REF is invalid");
  if (token && token.length > 512)
    throw new ContentRepoConfigError("CONTENT_REPO_TOKEN is invalid");

  return { repository, ref, token };
}

export function contentRepoConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  try {
    return Boolean(readContentRepoConfig(env).token);
  } catch {
    return false;
  }
}
