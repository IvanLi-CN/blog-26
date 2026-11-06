import assert from "node:assert/strict";
import { appendFile, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { digest } from "./project-media-cache";

// Remote opt-in only; never edits the checkout or publishes images.
const repository = resolve(import.meta.dir, "..");
const root = await realpath(await mkdtemp(join(tmpdir(), "media-docker-proof-")));
async function command(argv: string[], cwd = repository) {
  const child = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const log = stdout + stderr;
  console.log(log);
  assert.equal(code, 0, `${argv.slice(0, 4).join(" ")} failed`);
  return log;
}
function encodingStep(log: string) {
  const step = log.match(
    /^#(\d+) \[project-media[^\n]*RUN bun scripts\/generate-project-poster-assets\.ts[^\n]*/m
  );
  assert(step, "BuildKit must report the actual media encoding step");
  return step[1]!;
}
function cached(log: string) {
  return new RegExp(`^#${encodingStep(log)} CACHED$`, "m").test(log);
}
try {
  // --exclude-from matches the current context exclusions; Docker applies its own rules again.
  await command(["tar", "--exclude-from=.dockerignore", "-cf", join(root, "context.tar"), "."]);
  await command(["tar", "-xf", join(root, "context.tar"), "-C", root]);
  await rm(join(root, "context.tar"));
  const sha = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repository })
    .stdout.toString()
    .trim();
  const common = [
    "docker",
    "buildx",
    "build",
    "--progress=plain",
    "--build-arg",
    "PUBLIC_SITE_URL=https://ivanli.cc",
    "--build-arg",
    "PUBLIC_API_BASE_URL=https://console.ivanli.cc",
    "--build-arg",
    "REPOSITORY_URL=https://github.com/IvanLi-CN/blog-26",
  ];
  const png = (await readdir(join(root, "site/assets/projects/posters-source")))
    .filter((name) => name.endsWith(".png"))
    .sort()[0]!;
  const variant = `public/projects/posters/${png.slice(0, -4)}-480.webp`;
  await appendFile(
    join(root, "Dockerfile"),
    `\nFROM project-media AS project-media-fingerprint\nRUN sha256sum ${variant}\n`
  );
  const fingerprintArgs = [
    "--no-cache-filter",
    "project-media-fingerprint",
    "--target",
    "project-media-fingerprint",
    ".",
  ];
  const baseline = await command([...common, ...fingerprintArgs], root);
  const outputHash = (log: string) => {
    const hash = log.match(/([a-f0-9]{64}) {2}public\/projects\/posters\/[^\s]+-480\.webp/);
    assert(hash, "Generated variant hash must be observable");
    return hash[1]!;
  };
  const sourceFile = (await readdir(join(root, "src/server"))).find((name) => name.endsWith(".ts"));
  assert(sourceFile);
  await appendFile(
    join(root, "src/server", sourceFile),
    "\n// Media cache isolation experiment.\n"
  );
  const alternateSha = digest(`${sha}:media-cache-proof`).slice(0, 40);
  await appendFile(
    join(root, "Dockerfile"),
    `\nFROM builder AS project-media-proof\nRUN test "$(bun -e 'console.log(require("./src/generated/version.json").sourceSha)')" = "${alternateSha}"\n`
  );
  const changed = await command(
    [
      ...common,
      "--target",
      "project-media-proof",
      "--build-arg",
      `COMMIT_HASH=${alternateSha}`,
      "--build-arg",
      `COMMIT_SHORT_HASH=${alternateSha.slice(0, 8)}`,
      "--build-arg",
      "BUILD_DATE=20000101",
      ".",
    ],
    root
  );
  assert(cached(changed), "Unrelated source/build identity must keep the media layer cached");
  const appStep = changed.match(
    /^#(\d+) \[builder[^\n]*RUN bun run prebuild && bun run build:compiled/m
  );
  assert(
    appStep && !new RegExp(`^#${appStep[1]} CACHED$`, "m").test(changed),
    "Application build must execute for changed identity"
  );
  const pngPath = join(root, "site/assets/projects/posters-source", png);
  const altered = await sharp(pngPath).modulate({ brightness: 0.5 }).png().toBuffer();
  await writeFile(pngPath, altered);
  const sourceChanged = await command([...common, ...fingerprintArgs], root);
  assert.notEqual(
    outputHash(sourceChanged),
    outputHash(baseline),
    "Changed source must produce changed encoded bytes"
  );
  assert(!cached(sourceChanged), "Source bytes must invalidate the media layer");
  assert(sourceChanged.includes("[project-media:posters] hits=0 rebuilt="));
  const proof = {
    candidate: sha,
    baselineMediaCached: cached(baseline),
    unrelatedChangeMediaCached: true,
    applicationRebuilt: true,
    buildIdentityVerified: alternateSha,
    sourceChangeMediaCached: false,
    changedEncodedBytes: true,
  };
  console.log(`[project-media-docker-proof] ${JSON.stringify(proof)}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Docker media cache\n\n\`\`\`json\n${JSON.stringify(proof, null, 2)}\n\`\`\`\n`
    );
} finally {
  await rm(root, { recursive: true, force: true });
}
