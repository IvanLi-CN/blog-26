import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteFeatureSettings } from "@/lib/schema";
import {
  DEFAULT_SITE_FEATURE_RECORD,
  publicSiteFeaturesFor,
  SITE_FEATURE_SETTINGS_ID,
  type SiteFeaturePublicFeatures,
  type SiteFeatureRecord,
  type SiteFeatureUpdate,
  siteFeaturePublicResponseSchema,
  siteFeatureRecordSchema,
  siteFeatureUpdateSchema,
} from "@/lib/site-feature-settings";
import { versionIdentity } from "@/lib/version-info";

const DEFAULT_SERVICE_ENABLED = true;

export class SiteFeatureSettingsConflictError extends Error {
  readonly code = "SITE_FEATURE_SETTINGS_CONFLICT";
  readonly status = 409;

  constructor() {
    super("站点功能配置已被其他请求更新，请刷新后重试。");
    this.name = "SiteFeatureSettingsConflictError";
  }
}

export class SiteFeatureDisabledError extends Error {
  readonly code = "FEATURE_DISABLED";
  readonly status = 404;

  constructor() {
    super("站点助手功能未启用");
    this.name = "SiteFeatureDisabledError";
  }
}

type SiteFeatureSnapshot = {
  record: SiteFeatureRecord;
  revision: number;
  updatedAt: number | null;
};

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function getBuildDefaultSiteFeatures(): SiteFeaturePublicFeatures {
  return {
    assistant: {
      launcher: {
        enabled: parseBooleanEnv(
          process.env.PUBLIC_ASSISTANT_LAUNCHER_DEFAULT,
          DEFAULT_SITE_FEATURE_RECORD.features.assistant.launcher.enabled
        ),
      },
    },
  };
}

function defaultRecord(): SiteFeatureRecord {
  return {
    ...DEFAULT_SITE_FEATURE_RECORD,
    features: {
      assistant: {
        service: {
          enabled: DEFAULT_SERVICE_ENABLED,
        },
        launcher: {
          enabled: getBuildDefaultSiteFeatures().assistant.launcher.enabled,
        },
      },
    },
  };
}

function parseStoredRecord(config: string): SiteFeatureRecord {
  return siteFeatureRecordSchema.parse(JSON.parse(config));
}

async function readSnapshot(): Promise<SiteFeatureSnapshot> {
  const row = await db
    .select({
      config: siteFeatureSettings.config,
      revision: siteFeatureSettings.revision,
      updatedAt: siteFeatureSettings.updatedAt,
    })
    .from(siteFeatureSettings)
    .where(eq(siteFeatureSettings.id, SITE_FEATURE_SETTINGS_ID))
    .get();

  if (!row) return { record: defaultRecord(), revision: 0, updatedAt: null };
  return {
    record: parseStoredRecord(row.config),
    revision: row.revision,
    updatedAt: row.updatedAt,
  };
}

export async function getSiteFeatureSettings() {
  const snapshot = await readSnapshot();
  return {
    revision: snapshot.revision,
    updatedAt: snapshot.updatedAt,
    defaults: getBuildDefaultSiteFeatures(),
    settings: {
      assistant: {
        serviceEnabled: snapshot.record.features.assistant.service.enabled,
        launcherEnabled: snapshot.record.features.assistant.launcher.enabled,
      },
    },
    resolved: {
      assistant: {
        serviceEnabled: snapshot.record.features.assistant.service.enabled,
        launcherEnabled: snapshot.record.features.assistant.launcher.enabled,
        publicLauncherEnabled:
          snapshot.record.features.assistant.service.enabled &&
          snapshot.record.features.assistant.launcher.enabled,
      },
    },
  };
}

export async function updateSiteFeatureSettings(input: unknown) {
  const update: SiteFeatureUpdate = siteFeatureUpdateSchema.parse(input);
  const current = await readSnapshot();
  if (update.expectedRevision !== undefined && update.expectedRevision !== current.revision) {
    throw new SiteFeatureSettingsConflictError();
  }

  const now = Date.now();
  const next: SiteFeatureRecord = {
    schemaVersion: 1,
    features: {
      assistant: {
        service: { enabled: update.assistant.serviceEnabled },
        launcher: { enabled: update.assistant.launcherEnabled },
      },
    },
  };
  const config = JSON.stringify(next);
  const nextRevision = current.revision + 1;

  if (current.revision === 0) {
    const inserted = await db
      .insert(siteFeatureSettings)
      .values({
        id: SITE_FEATURE_SETTINGS_ID,
        config,
        revision: nextRevision,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
    if (inserted.changes !== 1) throw new SiteFeatureSettingsConflictError();
  } else {
    const updated = await db
      .update(siteFeatureSettings)
      .set({ config, revision: nextRevision, updatedAt: now })
      .where(
        and(
          eq(siteFeatureSettings.id, SITE_FEATURE_SETTINGS_ID),
          eq(siteFeatureSettings.revision, current.revision)
        )
      )
      .run();
    if (updated.changes !== 1) throw new SiteFeatureSettingsConflictError();
  }

  return getSiteFeatureSettings();
}

export async function isAssistantServiceEnabled() {
  const snapshot = await readSnapshot();
  return snapshot.record.features.assistant.service.enabled;
}

export async function assertAssistantServiceEnabled() {
  if (!(await isAssistantServiceEnabled())) throw new SiteFeatureDisabledError();
}

function publicConfigEtag(body: string) {
  return `"${createHash("sha256").update(body).digest("hex")}"`;
}

export async function getPublicSiteFeatureConfig(clientVersion: string | null) {
  const snapshot = await readSnapshot();
  const effective: SiteFeaturePublicFeatures = publicSiteFeaturesFor(snapshot.record);
  const sameVersion = clientVersion === versionIdentity;
  const defaults = getBuildDefaultSiteFeatures();
  const features = sameVersion
    ? {
        assistant: {
          launcher:
            effective.assistant.launcher.enabled === defaults.assistant.launcher.enabled
              ? {}
              : { enabled: effective.assistant.launcher.enabled },
        },
      }
    : effective;
  const mode = sameVersion ? "diff" : "full";
  const payload = {
    schemaVersion: 1 as const,
    mode,
    features,
  };
  const parsed = siteFeaturePublicResponseSchema.parse(payload);
  const body = JSON.stringify(parsed);
  return { body, etag: publicConfigEtag(body) };
}
