import clsx, { type ClassValue } from "clsx";
import type { CSSProperties } from "react";

export function classList(value: ClassValue) {
  return clsx(value);
}

/** Preserve the CSS declarations of migrated Astro templates. */
export function cssStyle(
  value: string | CSSProperties | null | undefined
): CSSProperties | undefined {
  if (typeof value !== "string") return value ?? undefined;
  const declarations: Record<string, string> = {};
  for (const declaration of value.split(/;(?![^()]*\))/)) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim();
    if (!property) continue;
    const key = property.startsWith("--")
      ? property
      : property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    declarations[key] = declaration.slice(colon + 1).trim();
  }
  return declarations;
}
