import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { withoutDeploymentCredentials } from "../playbook/child-env";
import type { ReleaseEntry } from "./ledger";
import { shaSchema, versionSchema } from "./policy";
import { type ProductManifest, verifyProducts } from "./products";

export const publicVersionSchema = z
  .object({ productVersion: versionSchema, buildVersion: z.string().min(1), sourceSha: shaSchema })
  .strict();
export async function unpackStatic(
  entry: ReleaseEntry,
  root: string,
  destination: string
): Promise<ProductManifest> {
  const manifest = await verifyProducts(entry, root);
  const archive = join(root, "frontend.tar.gz");
  const files = execFileSync("tar", ["-tzf", archive], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .trim()
    .split("\n");
  if (
    files.some(
      (path) => path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")
    )
  )
    throw new Error("Static archive contains unsafe paths");
  const listing = execFileSync("tar", ["-tvzf", archive], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (listing.split("\n").some((line) => line && !["-", "d"].includes(line[0] || "")))
    throw new Error("Static archive contains symbolic links or special files");
  await mkdir(destination, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "--no-same-owner", "-C", destination]);
  const version = publicVersionSchema.parse(
    JSON.parse(await readFile(join(destination, "version.json"), "utf8"))
  );
  if (
    version.productVersion !== entry.version ||
    version.sourceSha !== entry.mergeSha ||
    version.buildVersion !== manifest.staticBuildVersion
  )
    throw new Error("Static archive exposes a different version");
  return manifest;
}

export async function verifyProduction(
  entry: ReleaseEntry,
  manifest: ProductManifest,
  siteUrl: string,
  retries = 15
): Promise<void> {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Production verification URL is invalid");
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const options = {
        redirect: "error" as const,
        cache: "no-store" as const,
        signal: AbortSignal.timeout(30_000),
      };
      const [versionResponse, pointerResponse] = await Promise.all([
        fetch(new URL("version.json", url), options),
        fetch(new URL("_content/playbook/manifest.json", url), options),
      ]);
      if (versionResponse.ok && pointerResponse.ok) {
        const version = publicVersionSchema.parse(await versionResponse.json());
        const pointer = z
          .object({ editionDigest: z.string(), rendererCommit: shaSchema })
          .parse(await pointerResponse.json());
        if (
          version.productVersion === entry.version &&
          version.sourceSha === entry.mergeSha &&
          version.buildVersion === manifest.staticBuildVersion &&
          pointer.editionDigest === manifest.playbookEdition &&
          pointer.rendererCommit === entry.mergeSha
        )
          return;
      }
    } catch {
      /* Retry only bounded propagation checks; never alter expected identity. */
    }
    if (attempt + 1 < retries) await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error(
    "Production version/source/Playbook pointer did not match the frozen static product"
  );
}

export async function deployStatic(
  entry: ReleaseEntry,
  root: string
): Promise<NonNullable<ReleaseEntry["deployment"]>> {
  if (!process.env.EDGEONE_API_TOKEN || !process.env.EDGEONE_PROJECT_NAME)
    throw new Error("EdgeOne deployment configuration is missing");
  const destination = resolve(process.env.RUNNER_TEMP || ".tmp", `product-deploy-${entry.id}`);
  const manifest = await unpackStatic(entry, root, destination);
  const child = Bun.spawn(
    [
      "npx",
      "edgeone@1.6.34",
      "makers",
      "deploy",
      destination,
      "-n",
      process.env.EDGEONE_PROJECT_NAME,
      "-t",
      process.env.EDGEONE_API_TOKEN,
      "-e",
      "production",
    ],
    {
      env: {
        ...withoutDeploymentCredentials(process.env),
        EDGEONE_API_TOKEN: process.env.EDGEONE_API_TOKEN,
        EDGEONE_PROJECT_NAME: process.env.EDGEONE_PROJECT_NAME,
      },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  // Keep signed preview URLs and the CLI credential out of logs, including failures.
  await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if ((await child.exited) !== 0)
    throw new Error("EdgeOne deployment failed; retry the original frozen product");
  const url = process.env.PUBLIC_SITE_URL || "https://ivanli.cc/";
  await verifyProduction(entry, manifest, url);
  return {
    url,
    productVersion: entry.version,
    sourceSha: shaSchema.parse(entry.mergeSha),
    staticSha256: manifest.staticSha256,
  };
}
