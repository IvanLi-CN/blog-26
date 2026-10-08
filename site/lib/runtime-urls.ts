export {
  getPublicApiBaseUrl,
  getPublicSiteBasePath,
  getPublicSiteUrl,
  toPublicApiUrl,
  toPublicAssetUrl,
} from "@/lib/public-runtime-url";

import { toPublicSitePath as resolvePublicSitePath } from "@/lib/public-runtime-url";
export function toPublicSitePath(path: string): string;
export function toPublicSitePath(path: string | null | undefined): string | undefined;
export function toPublicSitePath(path: string | null | undefined) {
  return resolvePublicSitePath(path) ?? undefined;
}
