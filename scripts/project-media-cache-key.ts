import { appendFile, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { digest, projectMediaRecipe } from "./project-media-cache";

export async function projectMediaCacheKey() {
  const root = resolve(import.meta.dir, "..");
  const recipe = digest(
    JSON.stringify(await Promise.all([projectMediaRecipe("posters"), projectMediaRecipe("social")]))
  );
  const sources = [];
  for (const directory of ["posters-source", "social-source"]) {
    const path = join(root, "site/assets/projects", directory);
    for (const name of (await readdir(path)).filter((name) => name.endsWith(".png")).sort()) {
      sources.push([directory, name, digest(await readFile(join(path, name)))]);
    }
  }
  const prefix = `project-media-v1-${recipe}-`;
  return { key: `${prefix}${digest(JSON.stringify(sources))}`, prefix };
}
if (import.meta.main) {
  const { key, prefix } = await projectMediaCacheKey();
  const text = `key=${key}\nprefix=${prefix}\n`;
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, text);
  else process.stdout.write(text);
}
