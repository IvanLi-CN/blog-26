export function splitPathCandidates(envValue: string | undefined): string[] {
  if (!envValue || typeof envValue !== "string") {
    return [];
  }

  const trimmedValue = envValue.trim();
  if (trimmedValue.length === 0) {
    return [];
  }

  const paths: string[] = [];
  let currentPath = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < envValue.length; i++) {
    const char = envValue[i];

    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = "";
    } else if (!inQuotes && char === ",") {
      const trimmedPath = currentPath.trim();
      if (trimmedPath) {
        paths.push(trimmedPath);
      }
      currentPath = "";
    } else {
      currentPath += char;
    }
  }

  const trimmedPath = currentPath.trim();
  if (trimmedPath) {
    paths.push(trimmedPath);
  }

  return paths.map((path) => path.trim()).filter((path) => path.length > 0);
}

export function parsePathsFromEnv(envValue: string | undefined): string[] {
  const validPaths = splitPathCandidates(envValue).map((path) => {
    if (!path.startsWith("/")) {
      throw new Error(`路径必须以 '/' 开头: ${path}`);
    }
    return path;
  });

  return validPaths.length > 0 ? validPaths : [];
}

export function getPrimaryPathFromEnv(envValue: string | undefined, fallback: string): string {
  const paths = splitPathCandidates(envValue).map((path) =>
    path.startsWith("/") ? path : `/${path}`
  );
  return paths[0] || fallback;
}
