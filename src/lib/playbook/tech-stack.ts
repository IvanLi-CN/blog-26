export const TECH_STACK_MAX_VISIBLE_ITEMS = 8;

export type TechStackGroupId = "runtime" | "dependencies" | "quality" | "other";

export type TechStackScalar = string | number | boolean;

export type TechStackNode =
  | { kind: "scalar"; value: TechStackScalar }
  | { kind: "list"; items: TechStackNode[] }
  | { kind: "record"; entries: TechStackEntry[] };

export interface TechStackEntry {
  key: string;
  label: string;
  value: TechStackNode;
}

export interface TechStackGroup {
  id: TechStackGroupId;
  label: string;
  entries: TechStackEntry[];
}

const groupDefinitions: Array<Pick<TechStackGroup, "id" | "label"> & { keys: string[] }> = [
  {
    id: "runtime",
    label: "运行与交付",
    keys: [
      "markers_present",
      "ci_workflows",
      "runtime",
      "framework",
      "language",
      "platform",
      "deployment",
    ],
  },
  {
    id: "dependencies",
    label: "依赖与工具",
    keys: ["package_json", "dependencies", "dev_dependencies", "deps_dev", "deps_prod", "tools"],
  },
  {
    id: "quality",
    label: "配置与质量",
    keys: ["configs_root", "scripts", "testing", "quality", "checks"],
  },
  { id: "other", label: "其他信息", keys: [] },
];

const fieldLabels: Record<string, string> = {
  markers_present: "能力标记",
  ci_workflows: "CI 工作流",
  configs_root: "配置文件",
  package_json: "package.json",
  deps_dev: "开发依赖",
  deps_prod: "生产依赖",
  dev_dependencies: "开发依赖",
  dependencies: "生产依赖",
  scripts: "项目脚本",
  runtime: "运行时",
  framework: "框架",
  language: "语言",
  platform: "平台",
  deployment: "部署方式",
  release_channel: "发布渠道",
  tools: "工具",
  testing: "测试",
  quality: "质量检查",
  checks: "检查项",
};

// These keys describe publishing and agent-maintenance state rather than the
// technology a visitor needs to understand.
const maintenanceKeys = new Set([
  "confidence",
  "created_at",
  "evidence_policy",
  "evidence_window",
  "generated_at",
  "group",
  "kind",
  "last_verified",
  "match",
  "primary_projects",
  "release_tag",
  "edition_digest",
  "source_commit",
  "bundle_digest",
  "renderer_commit",
  "content_snapshot_identity",
  "routing",
  "schema_version",
  "slug",
  "source",
  "status",
  "updated_at",
  "visibility",
]);

const keyForLookup = (key: string) =>
  key
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .replace(/[\s.-]+/gu, "_");

function humanizeKey(key: string) {
  const lookupKey = keyForLookup(key);
  const known = fieldLabels[lookupKey];
  if (known) return known;
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_.-]+/gu, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function parseJsonString(value: string): unknown {
  const trimmed = value.trim();
  const looksLikeJson =
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    /^(?:true|false|null|-?\d(?:[\d.e+-]*))$/u.test(trimmed);
  if (!trimmed || !looksLikeJson) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function normalizeNode(value: unknown, seen: WeakSet<object>): TechStackNode | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    if (parsed !== value) return normalizeNode(parsed, seen);
    return value.trim() ? { kind: "scalar", value } : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { kind: "scalar", value };
  }
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeNode(item, seen))
      .filter((item): item is TechStackNode => Boolean(item));
    seen.delete(value);
    return items.length > 0 ? { kind: "list", items } : undefined;
  }
  const entries = Object.entries(value)
    .filter(([key]) => !maintenanceKeys.has(keyForLookup(key)))
    .map(([key, item]) => {
      const normalized = normalizeNode(item, seen);
      return normalized ? { key, label: humanizeKey(key), value: normalized } : undefined;
    })
    .filter((entry): entry is TechStackEntry => Boolean(entry));
  seen.delete(value);
  return entries.length > 0 ? { kind: "record", entries } : undefined;
}

function toRawValue(node: TechStackNode): unknown {
  if (node.kind === "scalar") return node.value;
  if (node.kind === "list") return node.items.map(toRawValue);
  return Object.fromEntries(node.entries.map((entry) => [entry.key, toRawValue(entry.value)]));
}

export function parsePlaybookTechStack(value: unknown): TechStackGroup[] {
  const normalized = normalizeNode(value, new WeakSet<object>());
  if (!normalized) return [];
  const rootEntries =
    normalized.kind === "record"
      ? normalized.entries
      : [{ key: "stack", label: "技术栈", value: normalized }];
  const groups = groupDefinitions.map(({ id, label }) => ({
    id,
    label,
    entries: [] as TechStackEntry[],
  }));
  for (const entry of rootEntries) {
    const lookupKey = keyForLookup(entry.key);
    const group =
      groupDefinitions.find((definition) => definition.keys.includes(lookupKey))?.id ?? "other";
    groups.find((item) => item.id === group)?.entries.push(entry);
  }
  return groups.filter((group) => group.entries.length > 0);
}

export function techStackArrayMode(items: TechStackNode[]) {
  if (items.length === 0 || items.some((item) => item.kind !== "scalar")) {
    return "list" as const;
  }
  return "chips" as const;
}

export function shouldCollapseTechStackList(_key: string, itemCount: number) {
  return itemCount > TECH_STACK_MAX_VISIBLE_ITEMS;
}

export function fitTechStackChips(
  widths: number[],
  availableWidth: number,
  gap: number,
  overflowWidths: number[]
) {
  if (widths.length === 0) return 0;
  const totalWidth = widths.reduce((total, width) => total + width, 0);
  if (totalWidth + gap * (widths.length - 1) <= availableWidth) return widths.length;

  let usedWidth = 0;
  let visibleCount = 0;
  for (let count = 1; count < widths.length; count++) {
    usedWidth += widths[count - 1] ?? 0;
    const remaining = widths.length - count;
    const overflowWidth = overflowWidths[String(remaining).length - 1] ?? 0;
    if (usedWidth + gap * count + overflowWidth <= availableWidth) visibleCount = count;
  }
  // Keep the first value readable with ellipsis when even one complete chip cannot fit.
  return Math.max(1, visibleCount);
}

export function formatTechStackRaw(value: unknown) {
  try {
    const normalized = normalizeNode(value, new WeakSet<object>());
    const json = JSON.stringify(normalized ? toRawValue(normalized) : undefined, null, 2);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}
