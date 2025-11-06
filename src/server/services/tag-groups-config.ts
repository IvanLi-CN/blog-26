import fs from "node:fs/promises";
import path from "node:path";
import type { TagGroupsConfig } from "@/types/tag-groups";

const CONFIG_PATH = path.join(process.cwd(), "src", "config", "tag-groups.json");
const PUBLIC_PATH = path.join(process.cwd(), "public", "data", "tag-groups.json");

export async function readTagGroupsConfig(): Promise<TagGroupsConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as TagGroupsConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { groups: [] };
    }
    throw error;
  }
}

export function validateTagGroupsConfig(
  config: TagGroupsConfig,
  options?: { knownTags?: string[] }
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  const seenTags = new Set<string>();
  const knownTagsSet = options?.knownTags ? new Set(options.knownTags) : undefined;

  config.groups.forEach((group, idx) => {
    if (!group.key || typeof group.key !== "string") {
      errors.push(`Group at index ${idx} missing key`);
    } else if (seenKeys.has(group.key)) {
      errors.push(`Duplicate group key: ${group.key}`);
    } else {
      seenKeys.add(group.key);
    }

    if (!group.title || typeof group.title !== "string") {
      errors.push(`Group ${group.key || idx} missing title`);
    } else {
      const normalized = group.title.trim();
      if (/(?:^|\s)and(?:\s|$)/i.test(normalized) || normalized.includes("&")) {
        errors.push(
          `Group ${group.key || idx} title contains disallowed conjunction: ${group.title}`
        );
      }
    }

    group.tags.forEach((tag) => {
      if (seenTags.has(tag)) {
        errors.push(`Tag ${tag} assigned multiple times`);
      } else {
        seenTags.add(tag);
      }
      if (knownTagsSet && !knownTagsSet.has(tag)) {
        errors.push(`Tag ${tag} not present in source list`);
      }
    });
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

async function writeJson(targetPath: string, config: TagGroupsConfig) {
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, serialized, "utf8");
}

export async function writeTagGroupsConfig(config: TagGroupsConfig): Promise<void> {
  await writeJson(CONFIG_PATH, config);
  await writeJson(PUBLIC_PATH, config);
}

export async function getCurrentGroupCount(): Promise<number> {
  const cfg = await readTagGroupsConfig();
  return cfg.groups.length || 0;
}
