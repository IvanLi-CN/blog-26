import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

export const NATIVE_PLATFORM = "ubuntu-24.04-amd64-glibc-2.39";
export const RUNTIME_RECIPE = "native-runtime-v1";
const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSha = z.string().regex(/^[a-f0-9]{40}$/);
const safePath = z
  .string()
  .refine(
    (value) =>
      Boolean(value) &&
      !isAbsolute(value) &&
      !value.includes("\\") &&
      value.split("/").every((part) => part && part !== "." && part !== "..")
  );
export const bundleManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    recipe: z.literal(RUNTIME_RECIPE),
    sourceSha,
    profile: z.enum(["ci", "local", "release"]),
    productVersion: z.string().min(1),
    buildVersion: z.string().min(1),
    configDigest: digest,
    lockDigest: digest,
    platform: z.literal(NATIVE_PLATFORM),
    toolchain: z
      .object({ bun: z.literal("1.4.2"), node: z.literal("v22.23.2"), rust: z.literal("1.91.0") })
      .strict(),
    baseImages: z
      .object({
        runtime: z.string().regex(/^ubuntu@sha256:[a-f0-9]{64}$/),
        bun: z.string().regex(/^oven\/bun@sha256:[a-f0-9]{64}$/),
      })
      .strict(),
    files: z.array(
      z
        .object({
          path: safePath,
          mode: z.number().int().min(0).max(511),
          bytes: z.number().int().nonnegative(),
          sha256: digest,
          link: z.string().optional(),
        })
        .strict()
    ),
  })
  .strict();
export type BundleManifest = z.infer<typeof bundleManifestSchema>;
export type BundleExpectation = Pick<BundleManifest, "sourceSha" | "profile" | "configDigest"> &
  Partial<Pick<BundleManifest, "productVersion" | "buildVersion" | "baseImages">>;

export function command(
  command: string,
  args: string[],
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
) {
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function run(commandName: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const started = performance.now();
  execFileSync(commandName, args, { cwd, env, stdio: "inherit" });
  console.log(
    JSON.stringify({
      event: "native-image-stage",
      command: [commandName, ...args].join(" "),
      milliseconds: Math.round(performance.now() - started),
    })
  );
}

async function stagePhase<T>(phase: string, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let success = false;
  try {
    const result = await work();
    success = true;
    return result;
  } finally {
    console.log(
      JSON.stringify({
        event: "native-image-phase",
        phase,
        success,
        milliseconds: Math.round(performance.now() - started),
      })
    );
  }
}

export async function requireNativePlatform() {
  const os = await readFile("/etc/os-release", "utf8").catch(() => "");
  if (
    process.platform !== "linux" ||
    process.arch !== "x64" ||
    !/^ID=ubuntu$/m.test(os) ||
    !/^VERSION_ID="24\.04"$/m.test(os)
  ) {
    throw new Error(
      `Native preparation requires ${NATIVE_PLATFORM}; provide BUILD_ARTIFACT_DIR from Actions on other platforms`
    );
  }
  if (
    command("getconf", ["GNU_LIBC_VERSION"]) !== "glibc 2.39" ||
    command("bun", ["--version"]) !== "1.4.2" ||
    command("node", ["--version"]) !== "v22.23.2"
  ) {
    throw new Error("Native runtime toolchain or glibc differs from the pinned recipe");
  }
}

const configNames = [
  "PUBLIC_API_BASE_URL",
  "PUBLIC_SITE_URL",
  "PUBLIC_SITE_BASE_PATH",
  "PUBLIC_ASSISTANT_LAUNCHER_DEFAULT",
  "PUBLIC_CONSOLE_URL",
  "PLAYBOOK_REQUIRED",
  "PLAYBOOK_USE_DEPLOYED",
  "PLAYBOOK_RENDERER_COMMIT",
];
export function configurationDigest(env: NodeJS.ProcessEnv = process.env) {
  return sha256(JSON.stringify(configNames.map((key) => [key, env[key] || ""])));
}

/** Resolves a platform digest without pulling the complete donor/runtime filesystem. */
export function resolveImageDigest(tag: string) {
  const result = JSON.parse(command("docker", ["buildx", "imagetools", "inspect", tag, "--raw"]));
  const manifest = result.manifests?.find(
    (entry: { platform?: { os?: string; architecture?: string; variant?: string } }) =>
      entry.platform?.os === "linux" &&
      entry.platform.architecture === "amd64" &&
      !entry.platform.variant
  );
  if (!manifest || !/^sha256:[a-f0-9]{64}$/.test(manifest.digest))
    throw new Error(`No linux/amd64 digest for ${tag}`);
  return `${tag.startsWith("ubuntu:") ? "ubuntu" : "oven/bun"}@${manifest.digest}`;
}

export async function inventory(root: string, directory = ""): Promise<BundleManifest["files"]> {
  const files: BundleManifest["files"] = [];
  for (const name of (await readdir(join(root, directory))).sort()) {
    const path = directory ? `${directory}/${name}` : name;
    if (!directory && path === "manifest.json") continue;
    safePath.parse(path);
    const full = join(root, path);
    const info = await lstat(full);
    if (info.isSymbolicLink()) {
      const link = await readlink(full);
      const target = relative(root, resolve(dirname(full), link));
      if (isAbsolute(link) || target === ".." || target.startsWith(`..${sep}`))
        throw new Error(`Bundle link escapes root: ${path}`);
      // Resolve the entire chain as well: a safe-looking link may point through another link.
      const { realpath } = await import("node:fs/promises");
      const actual = relative(await realpath(root), await realpath(full));
      if (actual === ".." || actual.startsWith(`..${sep}`))
        throw new Error(`Bundle link chain escapes root: ${path}`);
      files.push({
        path,
        mode: info.mode & 0o777,
        bytes: Buffer.byteLength(link),
        sha256: sha256(link),
        link,
      });
    } else if (info.isDirectory()) {
      files.push(...(await inventory(root, path)));
    } else if (info.isFile()) {
      files.push({
        path,
        mode: info.mode & 0o777,
        bytes: info.size,
        sha256: sha256(await readFile(full)),
      });
    } else throw new Error(`Unsupported bundle object: ${path}`);
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Keep the measured bytes; final verification independently scans the published inventory. */
export async function prepareInventory(root: string): Promise<BundleManifest["files"]> {
  const files = await inventory(root);
  for (const file of files) {
    if (file.link !== undefined) continue;
    const mode = file.mode | 0o444;
    await chmod(join(root, file.path), mode);
    file.mode = mode;
  }
  return files;
}

export function verifyElf(bytes: Buffer) {
  if (
    bytes.subarray(0, 4).toString("hex") !== "7f454c46" ||
    bytes[4] !== 2 ||
    bytes[5] !== 1 ||
    bytes.readUInt16LE(18) !== 62
  )
    throw new Error("Native module must be ELF64 little-endian x86-64");
  for (const match of bytes.toString("latin1").matchAll(/GLIBC_(\d+)\.(\d+)(?:\.(\d+))?/g)) {
    if (
      Number(match[1]) > 2 ||
      (Number(match[1]) === 2 &&
        (Number(match[2]) > 39 || (Number(match[2]) === 39 && Number(match[3] || 0) > 0)))
    )
      throw new Error(`Native module requires unsupported ${match[0]}`);
  }
}

async function runtimeProbe(root: string) {
  await requireNativePlatform();
  const modulePath = join(root, "app/native/search/search.linux-x64.node");
  const linked = command("ldd", [modulePath]);
  if (linked.includes("not found")) throw new Error("Native module has missing runtime libraries");
  // A disposable assembly proves resolution against ONLY the production dependency tree.
  const scratch = await mkdtemp(join(tmpdir(), "blog-runtime-probe-"));
  try {
    await cp(join(root, "app"), scratch, { recursive: true, mode: constants.COPYFILE_FICLONE });
    await symlink(join(root, "deps/node_modules"), join(scratch, "node_modules"));
    const probe = `import sharp from "sharp";
      await sharp({create:{width:2,height:2,channels:4,background:"white"}}).webp().toBuffer();
      await import("astro"); await import("tailwind-merge");
      const {openSearchIndex} = require(${JSON.stringify(modulePath)});
      const index = await openSearchIndex(${JSON.stringify(join(scratch, "search-probe"))});
      await index.apply(JSON.stringify([{id:"probe",version:"1",type:"post",published:true,body:"native runtime probe"}]));
      const found = JSON.parse(await index.search(JSON.stringify({ast:{kind:"term",value:"native"},limit:10,published_only:true})));
      if (!found.some(row => row.id === "probe")) throw new Error("Native search probe failed");
      console.log("Production dependencies and native search verified");`;
    await writeFile(join(scratch, "runtime-probe.ts"), probe);
    run("bun", ["--no-install", "runtime-probe.ts"], scratch, process.env);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function verifyBundle(
  directory: string,
  expected: BundleExpectation,
  nativeProbe = true
) {
  const root = resolve(directory);
  if (
    !(await lstat(root)).isDirectory() ||
    (await lstat(join(root, "manifest.json"))).isSymbolicLink()
  )
    throw new Error("Bundle root and manifest must be regular objects");
  const manifest = bundleManifestSchema.parse(
    JSON.parse(await readFile(join(root, "manifest.json"), "utf8"))
  );
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(manifest[key as keyof BundleManifest]) !== JSON.stringify(value))
      throw new Error(`Runtime bundle identity mismatch: ${key}`);
  }
  const files = await stagePhase("verify-inventory", () => inventory(root));
  if (JSON.stringify(files) !== JSON.stringify(manifest.files))
    throw new Error("Runtime bundle inventory differs from manifest");
  for (const required of [
    "Dockerfile",
    "app/package.json",
    "app/bun.lock",
    "app/src/generated/version.json",
    "app/scripts/start-console.ts",
    "app/scripts/migrate.ts",
    "app/native/search/search.linux-x64.node",
    "app/admin-dist/index.html",
    "app/console-dist/server/entry.mjs",
    "app/docker-entrypoint.sh",
    "deps/node_modules/sharp/package.json",
  ]) {
    if (!files.some((file) => file.path === required))
      throw new Error(`Incomplete runtime bundle: ${required}`);
  }
  if (sha256(await readFile(join(root, "app/bun.lock"))) !== manifest.lockDigest)
    throw new Error("Bundle lockfile differs");
  const version = JSON.parse(await readFile(join(root, "app/src/generated/version.json"), "utf8"));
  if (
    version.sourceSha !== manifest.sourceSha ||
    version.productVersion !== manifest.productVersion ||
    version.buildVersion !== manifest.buildVersion
  )
    throw new Error("Runtime version metadata differs from manifest");
  verifyElf(await readFile(join(root, "app/native/search/search.linux-x64.node")));
  if (nativeProbe) await stagePhase("verify-runtime", () => runtimeProbe(root));
  return manifest;
}

export async function prepareBundle(options: {
  output: string;
  profile: BundleManifest["profile"];
  sourceSha: string;
  configDigest: string;
  baseImages: BundleManifest["baseImages"];
  reuseBuild?: boolean;
  env?: NodeJS.ProcessEnv;
}) {
  await requireNativePlatform();
  const root = resolve(options.output);
  const repo = process.cwd();
  if (root === repo || !relative(repo, root) || repo.startsWith(`${root}${sep}`))
    throw new Error("Unsafe bundle output directory");
  const stage = `${root}.tmp-${randomUUID()}`;
  const env = { ...process.env, ...options.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" };
  await mkdir(stage, { recursive: true });
  try {
    if (!options.reuseBuild) {
      run("bun", ["run", "prebuild"], repo, env);
      run("bun", ["run", "build:compiled"], repo, env);
    }
    await stagePhase("copy-application", async () => {
      await cp("backend-dist", join(stage, "app"), { recursive: true });
      for (const path of ["admin-dist", "console-dist"])
        await cp(path, join(stage, "app", path), { recursive: true });
    });
    await mkdir(join(stage, "deps"));
    for (const path of ["package.json", "bun.lock"]) await cp(path, join(stage, "deps", path));
    run(
      "bun",
      ["install", "--production", "--frozen-lockfile", "--ignore-scripts"],
      join(stage, "deps"),
      env
    );
    // The frozen install already verifies the lock; these copies are not runtime inputs.
    await rm(join(stage, "deps/package.json"));
    await rm(join(stage, "deps/bun.lock"));
    await writeFile(
      join(stage, "Dockerfile"),
      (await readFile("Dockerfile", "utf8"))
        .replace(
          "ARG BUN_DONOR_IMAGE=oven/bun:1.4.2",
          `ARG BUN_DONOR_IMAGE=${options.baseImages.bun}`
        )
        .replace(
          "ARG RUNTIME_IMAGE=ubuntu:24.04",
          `ARG RUNTIME_IMAGE=${options.baseImages.runtime}`
        )
    );
    await writeFile(join(stage, ".dockerignore"), "manifest.json\n");
    const files = await stagePhase("prepare-inventory", () => prepareInventory(stage));
    const version = JSON.parse(
      await readFile(join(stage, "app/src/generated/version.json"), "utf8")
    );
    const manifest = bundleManifestSchema.parse({
      schemaVersion: 1,
      recipe: RUNTIME_RECIPE,
      sourceSha: options.sourceSha,
      profile: options.profile,
      productVersion: version.productVersion,
      buildVersion: version.buildVersion,
      configDigest: options.configDigest,
      lockDigest: sha256(await readFile("bun.lock")),
      platform: NATIVE_PLATFORM,
      toolchain: { bun: "1.4.2", node: "v22.23.2", rust: "1.91.0" },
      baseImages: options.baseImages,
      files,
    });
    await writeFile(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`);
    await stagePhase("verify-before-publish", () =>
      verifyBundle(stage, {
        sourceSha: options.sourceSha,
        profile: options.profile,
        configDigest: options.configDigest,
      })
    );
    // Never overwrite an existing candidate or accept a half-published output.
    await rename(stage, root);
    console.log(
      JSON.stringify({
        event: "runtime-bundle-prepared",
        output: root,
        files: manifest.files.length,
        bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
        sourceSha: manifest.sourceSha,
        profile: manifest.profile,
        configDigest: manifest.configDigest,
      })
    );
    return manifest;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
