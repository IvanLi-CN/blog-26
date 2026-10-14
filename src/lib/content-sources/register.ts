import { SYSTEM_CONFIG } from "@/config/paths";
import { LocalContentSource } from "./local";
import type { getContentSourceManager } from "./manager";

/**
 * 确保内容源已注册
 */
export async function ensureContentSourcesRegistered(
  manager: ReturnType<typeof getContentSourceManager>
) {
  const sources = manager.getSources();

  // 如果没有注册的内容源，自动注册默认的内容源
  if (sources.length === 0) {
    // 仅当存在 LOCAL_CONTENT_BASE_PATH 且非空时注册本地源
    const basePathEnv = process.env.LOCAL_CONTENT_BASE_PATH;
    const configuredBasePath =
      typeof basePathEnv === "string" && basePathEnv.trim().length > 0
        ? basePathEnv.trim()
        : SYSTEM_CONFIG.local.basePath;
    const localEnabled = typeof configuredBasePath === "string" && configuredBasePath.length > 0;

    if (localEnabled) {
      const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
        contentPath: configuredBasePath,
      });
      const localSource = new LocalContentSource(localConfig);
      await manager.registerSource(localSource);
    }
  }
}
