import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { generateProjectPosterAssets } from "../../scripts/generate-project-poster-assets";
import { verifyProjectPosterAssets } from "../../scripts/verify-project-poster-assets";

test("project poster generator emits responsive assets and an inline preview", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-poster-assets-"));
  const sourceDir = join(root, "source");
  const outputDir = join(root, "public/projects/posters");
  const manifestPath = join(root, "site/generated/project-poster-assets.ts");

  try {
    await mkdir(sourceDir, { recursive: true });
    await Promise.all(
      ["tavily-hikari-light", "tavily-hikari-dark", "kaisoumail", "octo-rill"].map((stem, index) =>
        sharp({
          create: {
            width: 1200,
            height: 1500,
            channels: 3,
            background: { r: 24 + index * 20, g: 52, b: 74 },
          },
        })
          .png()
          .toFile(join(sourceDir, `${stem}.png`))
      )
    );

    const generated = await generateProjectPosterAssets({ sourceDir, outputDir, manifestPath });
    const [files, manifest] = await Promise.all([
      readdir(outputDir),
      readFile(manifestPath, "utf8"),
    ]);

    expect(generated.sources).toHaveLength(4);
    expect(files).toHaveLength(16);
    expect(files.some((file) => file.endsWith(".png"))).toBe(false);
    expect(manifest).toContain("data:image/webp;base64,");
    expect(manifest).toContain("tavily-hikari");

    const verification = await verifyProjectPosterAssets({
      sourceDir,
      publicDir: outputDir,
      distDir: null,
    });
    expect(verification.variants).toHaveLength(16);
    expect(verification.priorityTransfers.avif).toBeLessThanOrEqual(750 * 1024);
    expect(verification.priorityTransfers.webp).toBeLessThanOrEqual(1050 * 1024);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
