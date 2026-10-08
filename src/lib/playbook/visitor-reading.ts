import type { PlaybookDocMetadataField } from "./types";

const statusNotices = new Map([
  ["stale", "内容已过时"],
  ["outdated", "内容已过时"],
  ["deprecated", "内容已废弃"],
  ["superseded", "已有替代内容"],
]);

function mapStatusNotice(value: string) {
  return statusNotices.get(value.trim().toLocaleLowerCase());
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function getPlaybookStatusNotice(
  fields: readonly PlaybookDocMetadataField[] | undefined
): string | undefined {
  const statuses = new Set(
    (fields ?? [])
      .filter((field) => normalizeKey(field.key) === "status")
      .map((field) => mapStatusNotice(field.value))
      .filter((notice): notice is string => Boolean(notice))
  );
  if (statuses.size !== 1) return undefined;
  return [...statuses][0];
}
