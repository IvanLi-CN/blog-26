/** Keep the highest ranked hit for each routable content object, retaining tie order. */
export function uniqueRankedContent<T extends { slug: string; type?: string }>(results: T[]): T[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = JSON.stringify([result.type ?? "post", result.slug]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
