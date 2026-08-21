import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { generateProjectSocialPreviewAssets } from "../../scripts/generate-project-social-preview-assets";
import { verifyProjectSocialPreviewAssets } from "../../scripts/verify-project-social-preview-assets";

test("project social preview generator emits responsive assets and intrinsic dimensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-social-preview-assets-"));
  const sourceDir = join(root, "source");
  const outputDir = join(root, "public/projects/social");
  const manifestPath = join(root, "site/generated/project-social-preview-assets.ts");

  try {
    await mkdir(sourceDir, { recursive: true });
    await Promise.all(
      ["loadlynx-light", "loadlynx-dark", "octo-rill"].map((stem, index) =>
        sharp({
          create: {
            width: 1280,
            height: 640,
            channels: 3,
            background: { r: 24 + index * 20, g: 52, b: 74 },
          },
        })
          .png()
          .toFile(join(sourceDir, `${stem}.png`))
      )
    );

    const generated = await generateProjectSocialPreviewAssets({
      sourceDir,
      outputDir,
      manifestPath,
    });
    const [files, manifest] = await Promise.all([
      readdir(outputDir),
      readFile(manifestPath, "utf8"),
    ]);

    expect(generated.sources).toHaveLength(3);
    expect(files).toHaveLength(12);
    expect(files.some((file) => file.endsWith(".png"))).toBe(false);
    expect(manifest).toContain("data:image/webp;base64,");
    expect(manifest).toContain('"width": 1280');
    expect(manifest).toContain("loadlynx");

    const verification = await verifyProjectSocialPreviewAssets({
      sourceDir,
      publicDir: outputDir,
      distDir: null,
    });
    expect(verification.variants).toHaveLength(12);
    expect(verification.variants.every((variant) => variant.size > 0)).toBe(true);

    const leakedPngDir = join(outputDir, "legacy");
    await mkdir(leakedPngDir, { recursive: true });
    await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toFile(join(leakedPngDir, "source.PNG"));

    await expect(
      verifyProjectSocialPreviewAssets({ sourceDir, publicDir: outputDir, distDir: null })
    ).rejects.toThrow(/Raw PNG social preview/);
    await expect(
      generateProjectSocialPreviewAssets({ sourceDir, outputDir, manifestPath })
    ).rejects.toThrow(/Raw PNG social preview/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
