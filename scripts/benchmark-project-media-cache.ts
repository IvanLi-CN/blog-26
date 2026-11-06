import assert from "node:assert/strict";
import { appendFile, cp, mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateProjectPosterAssets } from "./generate-project-poster-assets";
import { generateProjectSocialPreviewAssets } from "./generate-project-social-preview-assets";
import { digest, newMediaCacheStats } from "./project-media-cache";

// Opt-in, full-material experiment. It writes only an isolated temporary tree.
const root = await realpath(await mkdtemp(join(tmpdir(), "project-media-benchmark-")));
const repository = resolve(import.meta.dir, "..");
try {
  const kinds = ["posters", "social"] as const;
  for (const kind of kinds)
    await cp(
      join(repository, "site/assets/projects", `${kind}-source`),
      join(root, `${kind}-source`),
      { recursive: true }
    );
  async function run() {
    const started = performance.now();
    const totals = newMediaCacheStats();
    const hashes: string[] = [];
    for (const kind of kinds) {
      const outputDir = join(root, kind);
      const manifestPath = join(root, `${kind}.ts`);
      const stats = newMediaCacheStats();
      const generator =
        kind === "posters" ? generateProjectPosterAssets : generateProjectSocialPreviewAssets;
      await generator({
        sourceDir: join(root, `${kind}-source`),
        outputDir,
        manifestPath,
        cacheDir: join(root, "cache"),
        cacheStats: stats,
      });
      for (const name of (await readdir(outputDir)).sort())
        hashes.push(`${kind}/${name}:${digest(await readFile(join(outputDir, name)))}`);
      hashes.push(digest(await readFile(manifestPath)));
      totals.hits += stats.hits;
      totals.rebuilt += stats.rebuilt;
      totals.unavailable += stats.unavailable;
    }
    return {
      milliseconds: performance.now() - started,
      stats: totals,
      outputDigest: digest(hashes.join("\n")),
    };
  }
  const cold = await run();
  assert(cold.stats.rebuilt > 0 && cold.stats.hits === 0 && cold.stats.unavailable === 0);
  const warm = [];
  for (let index = 0; index < 3; index++) {
    const result = await run();
    assert.equal(result.outputDigest, cold.outputDigest);
    assert.equal(result.stats.rebuilt, 0);
    assert.equal(result.stats.hits, cold.stats.rebuilt);
    warm.push(result);
  }
  const source = (await readdir(join(root, "posters-source")))
    .filter((name) => name.endsWith(".png"))
    .sort()[0]!;
  await appendFile(join(root, "posters-source", source), Buffer.from([0]));
  const partial = await run();
  assert.equal(partial.stats.rebuilt, 1);
  assert.equal(partial.stats.hits, cold.stats.rebuilt - 1);
  const median = warm.map((result) => result.milliseconds).sort((a, b) => a - b)[1]!;
  const proof = {
    candidate: Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repository })
      .stdout.toString()
      .trim(),
    cold,
    warm,
    partial,
    medianWarmMilliseconds: median,
    savedMilliseconds: cold.milliseconds - median,
    reduction: 1 - median / cold.milliseconds,
    note: "Actions restore/save transfer times must additionally be taken from the bound run logs.",
  };
  console.log(`[project-media-benchmark] ${JSON.stringify(proof)}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Project media cache\n\n\`\`\`json\n${JSON.stringify(proof, null, 2)}\n\`\`\`\n`
    );
  assert(
    proof.reduction >= 0.7,
    "Warm image generation must save at least 70% before transfer overhead"
  );
  assert(
    proof.savedMilliseconds >= 45_000,
    "Warm image generation must save at least 45 seconds before transfer overhead"
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
