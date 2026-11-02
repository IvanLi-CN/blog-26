import { z } from "zod";

export const SITE_FEATURE_SCHEMA_VERSION = 1 as const;
export const SITE_FEATURE_SETTINGS_ID = "global";

export const siteFeatureRecordSchema = z
  .object({
    schemaVersion: z.literal(SITE_FEATURE_SCHEMA_VERSION),
    features: z
      .object({
        assistant: z
          .object({
            service: z.object({ enabled: z.boolean() }).strict(),
            launcher: z.object({ enabled: z.boolean() }).strict(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
export type SiteFeatureRecord = z.infer<typeof siteFeatureRecordSchema>;

export const siteFeatureUpdateSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    assistant: z
      .object({
        serviceEnabled: z.boolean(),
        launcherEnabled: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type SiteFeatureUpdate = z.infer<typeof siteFeatureUpdateSchema>;

const publicSiteFeatureShape = z
  .object({
    assistant: z
      .object({
        launcher: z.object({ enabled: z.boolean() }).strict(),
      })
      .strict(),
  })
  .strict();

const publicSiteFeatureDiffShape = z
  .object({
    assistant: z
      .object({
        launcher: z.object({ enabled: z.boolean().optional() }).strict(),
      })
      .strict(),
  })
  .strict();

export const siteFeaturePublicResponseSchema = z.discriminatedUnion("mode", [
  z
    .object({
      schemaVersion: z.literal(SITE_FEATURE_SCHEMA_VERSION),
      mode: z.literal("diff"),
      features: publicSiteFeatureDiffShape,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(SITE_FEATURE_SCHEMA_VERSION),
      mode: z.literal("full"),
      features: publicSiteFeatureShape,
    })
    .strict(),
]);
export type SiteFeaturePublicResponse = z.infer<typeof siteFeaturePublicResponseSchema>;

export type SiteFeaturePublicFeatures = z.infer<typeof publicSiteFeatureShape>;
export type SiteFeaturePublicOverride = z.infer<typeof publicSiteFeatureDiffShape>;

export const DEFAULT_SITE_FEATURE_RECORD: SiteFeatureRecord = {
  schemaVersion: SITE_FEATURE_SCHEMA_VERSION,
  features: {
    assistant: {
      service: { enabled: true },
      launcher: { enabled: true },
    },
  },
};

export function publicSiteFeaturesFor(record: SiteFeatureRecord): SiteFeaturePublicFeatures {
  return {
    assistant: {
      launcher: {
        enabled:
          record.features.assistant.service.enabled && record.features.assistant.launcher.enabled,
      },
    },
  };
}

export function mergeSiteFeaturePublicFeatures(
  base: SiteFeaturePublicFeatures,
  override: SiteFeaturePublicOverride
): SiteFeaturePublicFeatures {
  return {
    assistant: {
      launcher: {
        enabled: override.assistant.launcher.enabled ?? base.assistant.launcher.enabled,
      },
    },
  };
}
