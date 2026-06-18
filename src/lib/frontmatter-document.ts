import yaml from "js-yaml";

type ParsedFrontmatterDocument = {
  frontmatter: Record<string, unknown>;
  frontmatterText: string;
  body: string;
  hasFrontmatter: boolean;
};

export type FrontmatterDiagnosticSeverity = "error" | "warning";

export type FrontmatterDiagnostic = {
  severity: FrontmatterDiagnosticSeverity;
  message: string;
  field?: string;
  from?: number;
  to?: number;
};

export type FrontmatterKnownField =
  | "title"
  | "slug"
  | "tags"
  | "draft"
  | "public"
  | "excerpt"
  | "publishDate"
  | "updateDate"
  | "category"
  | "author"
  | "image"
  | "createdVia"
  | "updatedVia";

export type FrontmatterSuggestionSource = {
  tags?: string[];
  categories?: string[];
};

export type FrontmatterFieldDefinition = {
  key: FrontmatterKnownField;
  description: string;
  valueKind: "string" | "boolean" | "date" | "list";
  placeholder: string;
  preferredValues?: string[];
};

export type FrontmatterAnalysis = ParsedFrontmatterDocument & {
  diagnostics: FrontmatterDiagnostic[];
  hasErrors: boolean;
  hasWarnings: boolean;
};

export type FrontmatterStyleDiagnostic = {
  message: string;
  field?: string;
  from?: number;
  to?: number;
};

export type FrontmatterStyleFix = {
  frontmatterText: string;
  fixedFields: string[];
};

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/;

const KNOWN_FRONTMATTER_FIELDS: FrontmatterFieldDefinition[] = [
  {
    key: "title",
    description: "Readable article title",
    valueKind: "string",
    placeholder: "title: Example Post",
  },
  {
    key: "slug",
    description: "URL-safe slug",
    valueKind: "string",
    placeholder: "slug: example-post",
  },
  {
    key: "tags",
    description: "YAML list of tags",
    valueKind: "list",
    placeholder: "tags:\n  - React\n  - Hooks",
  },
  {
    key: "draft",
    description: "Draft visibility flag",
    valueKind: "boolean",
    placeholder: "draft: true",
    preferredValues: ["true", "false"],
  },
  {
    key: "public",
    description: "Public visibility flag",
    valueKind: "boolean",
    placeholder: "public: true",
    preferredValues: ["true", "false"],
  },
  {
    key: "excerpt",
    description: "Summary text",
    valueKind: "string",
    placeholder: "excerpt: |-",
  },
  {
    key: "publishDate",
    description: "Primary publish date",
    valueKind: "date",
    placeholder: "publishDate: 2026-06-17",
  },
  {
    key: "updateDate",
    description: "Last update date",
    valueKind: "date",
    placeholder: "updateDate: 2026-06-17",
  },
  {
    key: "category",
    description: "Content category",
    valueKind: "string",
    placeholder: "category: frontend",
  },
  {
    key: "author",
    description: "Author name",
    valueKind: "string",
    placeholder: "author: Ivan Li",
  },
  {
    key: "image",
    description: "Cover image path",
    valueKind: "string",
    placeholder: "image: ./assets/cover.png",
  },
  {
    key: "createdVia",
    description: "Authoring provenance",
    valueKind: "string",
    placeholder: "createdVia: demo",
    preferredValues: ["demo", "mcp"],
  },
  {
    key: "updatedVia",
    description: "Update provenance",
    valueKind: "string",
    placeholder: "updatedVia: mcp",
    preferredValues: ["demo", "mcp"],
  },
];

const COMPAT_DATE_FIELD = "date";

const KNOWN_FRONTMATTER_FIELD_KEYS = new Set(KNOWN_FRONTMATTER_FIELDS.map((field) => field.key));

function normalizeContent(content: string) {
  return content.replace(/\r\n/g, "\n");
}

function toLineOffsets(input: string) {
  const offsets = [0];
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function locateFieldRange(frontmatterText: string, field: string) {
  const lineOffsets = toLineOffsets(frontmatterText);
  const lines = frontmatterText.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:/);
    if (!match || match[1] !== field) continue;
    let endIndex = index;

    while (endIndex + 1 < lines.length) {
      const nextLine = lines[endIndex + 1];
      if (/^\S/.test(nextLine)) {
        break;
      }
      endIndex += 1;
    }

    return {
      from: lineOffsets[index] ?? 0,
      to: (lineOffsets[endIndex] ?? 0) + (lines[endIndex]?.length ?? 0),
    };
  }

  return undefined;
}

function normalizeTagsListIndentation(frontmatterText: string): FrontmatterStyleFix {
  const range = locateFieldRange(frontmatterText, "tags");
  if (!range) {
    return {
      frontmatterText,
      fixedFields: [],
    };
  }

  const block = frontmatterText.slice(range.from, range.to);
  const lines = block.split("\n");
  if (lines.length <= 1) {
    return {
      frontmatterText,
      fixedFields: [],
    };
  }

  let changed = false;
  const normalizedLines = lines.map((line, index) => {
    if (index === 0 || !line.trim()) {
      return line;
    }

    const listItemMatch = line.match(/^[ \t]*-\s(.*)$/);
    if (!listItemMatch) {
      return line;
    }

    const normalizedLine = `  - ${listItemMatch[1] ?? ""}`;
    if (normalizedLine !== line) {
      changed = true;
    }
    return normalizedLine;
  });

  if (!changed) {
    return {
      frontmatterText,
      fixedFields: [],
    };
  }

  const normalizedBlock = normalizedLines.join("\n");
  return {
    frontmatterText:
      frontmatterText.slice(0, range.from) + normalizedBlock + frontmatterText.slice(range.to),
    fixedFields: ["tags"],
  };
}

function hasInconsistentTagsListIndentation(frontmatterText: string) {
  const range = locateFieldRange(frontmatterText, "tags");
  if (!range) return false;

  const block = frontmatterText.slice(range.from, range.to);
  const lines = block.split("\n");
  if (lines.length <= 1) return false;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const listItemMatch = line.match(/^[ \t]*-\s(.*)$/);
    if (!listItemMatch) {
      continue;
    }

    if (line !== `  - ${listItemMatch[1] ?? ""}`) {
      return true;
    }
  }

  return false;
}

export function lintFrontmatterStyle(frontmatterText: string): FrontmatterStyleDiagnostic[] {
  if (!frontmatterText.trim()) return [];

  const diagnostics: FrontmatterStyleDiagnostic[] = [];
  const tagsRange = locateFieldRange(frontmatterText, "tags");

  if (tagsRange && hasInconsistentTagsListIndentation(frontmatterText)) {
    diagnostics.push({
      field: "tags",
      message: "tags 列表缩进不一致。当前 YAML 仍可解析，但建议保持同层 `- item` 缩进。",
      from: tagsRange.from,
      to: tagsRange.to,
    });
  }

  return diagnostics;
}

export function autoFixFrontmatterStyle(frontmatterText: string): FrontmatterStyleFix {
  if (!frontmatterText.trim()) {
    return {
      frontmatterText,
      fixedFields: [],
    };
  }

  return normalizeTagsListIndentation(frontmatterText);
}

function isDateLikeField(field: string) {
  return field === "publishDate" || field === "updateDate" || field === COMPAT_DATE_FIELD;
}

function isParsableDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime());
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return false;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

function isValidSlug(value: string) {
  return /^[a-z0-9\u4e00-\u9fa5]+(?:-[a-z0-9\u4e00-\u9fa5]+)*$/.test(value);
}

function parseFrontmatterYaml(frontmatterText: string) {
  const parsed = yaml.load(frontmatterText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

export function getFrontmatterFieldDefinitions() {
  return KNOWN_FRONTMATTER_FIELDS;
}

export function getRecommendedFrontmatterDateString(input = new Date()) {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, "0");
  const day = `${input.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function splitFrontmatterDiagnosticMessage(message: string) {
  const [summary = "", ...detailLines] = message.split("\n");
  return {
    summary,
    detail: detailLines.join("\n").trimEnd(),
  };
}

export function buildFrontmatterSuggestions(
  source: FrontmatterSuggestionSource = {}
): FrontmatterSuggestionSource {
  return {
    tags: Array.from(
      new Set((source.tags ?? []).map((value) => value.trim()).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, "zh-Hans-CN-u-co-pinyin")),
    categories: Array.from(
      new Set((source.categories ?? []).map((value) => value.trim()).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, "zh-Hans-CN-u-co-pinyin")),
  };
}

export function analyzeFrontmatterDocument(content: string): FrontmatterAnalysis {
  const parsed = parseFrontmatterDocument(content);
  return {
    ...parsed,
    ...validateFrontmatterText(parsed.frontmatterText),
  };
}

export function validateFrontmatterText(
  frontmatterText: string
): Pick<FrontmatterAnalysis, "diagnostics" | "hasErrors" | "hasWarnings"> {
  const diagnostics: FrontmatterDiagnostic[] = [];
  if (!frontmatterText.trim()) {
    return {
      diagnostics,
      hasErrors: false,
      hasWarnings: false,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseFrontmatterYaml(frontmatterText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Frontmatter YAML 解析失败";
    diagnostics.push({
      severity: "error",
      message,
      from: 0,
      to: frontmatterText.length,
    });
    return {
      diagnostics,
      hasErrors: true,
      hasWarnings: false,
    };
  }

  for (const key of Object.keys(parsed)) {
    const range = locateFieldRange(frontmatterText, key);

    if (
      !KNOWN_FRONTMATTER_FIELD_KEYS.has(key as FrontmatterKnownField) &&
      key !== COMPAT_DATE_FIELD
    ) {
      diagnostics.push({
        severity: "warning",
        field: key,
        message: `未知字段 “${key}” 会被保留，但不在首版 frontmatter schema 内。`,
        from: range?.from,
        to: range?.to,
      });
      continue;
    }

    const value = parsed[key];

    if (key === COMPAT_DATE_FIELD) {
      if (!isParsableDate(value)) {
        diagnostics.push({
          severity: "error",
          field: key,
          message: "date 必须是可解析的日期文本。",
          from: range?.from,
          to: range?.to,
        });
      }
      continue;
    }

    if (
      key === "slug" &&
      typeof value === "string" &&
      value.trim().length > 0 &&
      !isValidSlug(value)
    ) {
      diagnostics.push({
        severity: "error",
        field: key,
        message: "slug 只能包含小写字母、数字、中文和连字符，且不能以连字符开头或结尾。",
        from: range?.from,
        to: range?.to,
      });
    }

    if ((key === "draft" || key === "public") && typeof value !== "boolean") {
      diagnostics.push({
        severity: "error",
        field: key,
        message: `${key} 必须是 true 或 false。`,
        from: range?.from,
        to: range?.to,
      });
    }

    if (key === "tags") {
      if (!Array.isArray(value)) {
        diagnostics.push({
          severity: "error",
          field: key,
          message: "tags 必须写成数组：\ntags:\n  - React\n  - Hooks",
          from: range?.from,
          to: range?.to,
        });
      } else if (value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
        diagnostics.push({
          severity: "error",
          field: key,
          message: "tags 列表中的每一项都必须是非空字符串。",
          from: range?.from,
          to: range?.to,
        });
      }
    }

    if (isDateLikeField(key) && !isParsableDate(value)) {
      diagnostics.push({
        severity: "error",
        field: key,
        message: `${key} 必须是可解析的日期文本。`,
        from: range?.from,
        to: range?.to,
      });
    }
  }

  return {
    diagnostics,
    hasErrors: diagnostics.some((item) => item.severity === "error"),
    hasWarnings: diagnostics.some((item) => item.severity === "warning"),
  };
}

export function parseFrontmatterDocument(content: string): ParsedFrontmatterDocument {
  const normalized = normalizeContent(content);
  const match = normalized.match(FRONTMATTER_PATTERN);

  if (!match) {
    return {
      frontmatter: {},
      frontmatterText: "",
      body: normalized,
      hasFrontmatter: false,
    };
  }

  const [, frontmatterText, body = ""] = match;
  try {
    return {
      frontmatter: parseFrontmatterYaml(frontmatterText),
      frontmatterText,
      body,
      hasFrontmatter: true,
    };
  } catch {
    return {
      frontmatter: {},
      frontmatterText,
      body,
      hasFrontmatter: true,
    };
  }
}

export function stringifyFrontmatterDocument(body: string, frontmatterText: string): string {
  const normalizedBody = normalizeContent(body);
  const normalizedFrontmatter = normalizeContent(frontmatterText);

  if (normalizedFrontmatter.length === 0) {
    return normalizedBody;
  }

  const separator = normalizedBody.startsWith("\n") || normalizedBody.length === 0 ? "" : "\n";
  return `---\n${normalizedFrontmatter}\n---\n${separator}${normalizedBody}`;
}

export function updateFrontmatterDocument(
  originalContent: string,
  nextFrontmatterText: string
): string {
  const { body } = parseFrontmatterDocument(originalContent);
  return stringifyFrontmatterDocument(body, nextFrontmatterText);
}

export function updateDocumentBody(originalContent: string, nextBody: string): string {
  const { frontmatterText } = parseFrontmatterDocument(originalContent);
  return stringifyFrontmatterDocument(nextBody, frontmatterText);
}

export function parseFrontmatterMap(content: string): Record<string, string> {
  const { frontmatter } = parseFrontmatterDocument(content);

  return Object.entries(frontmatter).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value === null || value === undefined) return acc;
    if (typeof value === "string") {
      acc[key] = value;
      return acc;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      acc[key] = String(value);
      return acc;
    }
    if (Array.isArray(value)) {
      acc[key] = value.join(", ");
      return acc;
    }
    acc[key] = JSON.stringify(value);
    return acc;
  }, {});
}

export function stripFrontmatter(content: string) {
  return parseFrontmatterDocument(content).body;
}
