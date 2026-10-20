const CLIPPING_RESOURCE_REFERENCE_RE = /^(?:\.\/)?assets\/([a-f0-9]{64}\.[a-z0-9]+)([?#].*)?$/iu;

/** Build the live/public facade prefix for one immutable clipping version. */
export function buildClippingResourceBaseUrl(slug: string, versionId: string) {
  return `/api/public/memos/${encodeURIComponent(slug)}/clipping/assets/${encodeURIComponent(versionId)}/`;
}

/** Map a version-relative clipping resource reference to its authorized facade. */
export function mapClippingResourceUrl(value: string, resourceBaseUrl: string | null | undefined) {
  if (!resourceBaseUrl) return value;
  const match = CLIPPING_RESOURCE_REFERENCE_RE.exec(value.trim());
  if (!match) return value;
  const base = resourceBaseUrl.endsWith("/") ? resourceBaseUrl : `${resourceBaseUrl}/`;
  return `${base}${encodeURIComponent(match[1])}${match[2] ?? ""}`;
}

export function clippingResourceFilename(value: string) {
  const match = /^([a-f0-9]{64}\.[a-z0-9]+)$/iu.exec(value);
  return match?.[1] ?? null;
}
