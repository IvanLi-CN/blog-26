import {
  mergeSiteFeaturePublicFeatures,
  type SiteFeaturePublicFeatures,
  siteFeaturePublicResponseSchema,
} from "@/lib/site-feature-settings";
import { versionIdentity } from "@/lib/version-info";
import { webDemoFetch } from "@/lib/web-demo-fetch";
import { toPublicApiUrl } from "./runtime-urls";

const BUILD_DEFAULT_ENABLED = import.meta.env.PUBLIC_ASSISTANT_LAUNCHER_DEFAULT !== "false";
const RUNTIME_CONFIG_TIMEOUT_MS = 5000;

export function getBuildDefaultAssistantLauncherEnabled() {
  return BUILD_DEFAULT_ENABLED;
}

export async function readSiteFeatureConfig(): Promise<SiteFeaturePublicFeatures> {
  const endpoint = new URL(toPublicApiUrl("/api/public/runtime-config"), window.location.origin);
  endpoint.searchParams.set("siteVersion", versionIdentity);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), RUNTIME_CONFIG_TIMEOUT_MS);
  try {
    const response = await webDemoFetch(endpoint.toString(), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`站点功能配置请求失败（${response.status}）`);
    const payload = siteFeaturePublicResponseSchema.parse(await response.json());
    const defaults: SiteFeaturePublicFeatures = {
      assistant: {
        launcher: { enabled: BUILD_DEFAULT_ENABLED },
      },
    };
    return payload.mode === "diff"
      ? mergeSiteFeaturePublicFeatures(defaults, payload.features)
      : payload.features;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
