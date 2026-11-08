import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  bundleManifestSchema,
  configurationDigest,
  inventory,
  NATIVE_PLATFORM,
  prepareInventory,
  RUNTIME_RECIPE,
  verifyBundle,
  verifyElf,
} from "../../scripts/runtime-bundle";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const expected = {
  sourceSha: "a".repeat(40),
  profile: "ci" as const,
  configDigest: "b".repeat(64),
};
function elf() {
  const bytes = Buffer.alloc(64);
  bytes.write("\x7fELF");
  bytes[4] = 2;
  bytes[5] = 1;
  bytes.writeUInt16LE(62, 18);
  return bytes;
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "runtime-bundle-test-"));
  roots.push(root);
  const files = [
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
  ];
  for (const path of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), "fixture");
  }
  await writeFile(
    join(root, "app/src/generated/version.json"),
    JSON.stringify({
      sourceSha: expected.sourceSha,
      productVersion: "4.0.0",
      buildVersion: "candidate-image",
    })
  );
  await writeFile(join(root, "app/native/search/search.linux-x64.node"), elf());
  await seal(root);
  return root;
}
async function seal(root: string, files?: Awaited<ReturnType<typeof inventory>>) {
  const manifest = {
    schemaVersion: 1,
    recipe: RUNTIME_RECIPE,
    ...expected,
    productVersion: "4.0.0",
    buildVersion: "candidate-image",
    lockDigest: hash("fixture"),
    platform: NATIVE_PLATFORM,
    toolchain: { bun: "1.4.2", node: "v22.23.2", rust: "1.91.0" },
    baseImages: {
      runtime: `ubuntu@sha256:${"c".repeat(64)}`,
      bun: `oven/bun@sha256:${"d".repeat(64)}`,
    },
    files: files ?? (await inventory(root)),
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
}
test("prepared inventory preserves bytes, executable bits and internal links after chmod", async () => {
  const root = await fixture();
  const script = join(root, "app/docker-entrypoint.sh");
  const data = join(root, "app/admin-dist/index.html");
  await chmod(script, 0o700);
  await chmod(data, 0o600);
  await symlink("sharp", join(root, "deps/node_modules/linked-sharp"));
  const before = await inventory(root);
  const files = await prepareInventory(root);
  expect(files).toEqual(await inventory(root));
  expect(files.map(({ mode, ...file }) => file)).toEqual(before.map(({ mode, ...file }) => file));
  expect(files.find((file) => file.path === "app/docker-entrypoint.sh")?.mode).toBe(0o755);
  expect(files.find((file) => file.path === "app/admin-dist/index.html")?.mode).toBe(0o644);
  await seal(root, files);
  await expect(verifyBundle(root, expected, false)).resolves.toBeDefined();
});
test("reusing preparation metadata cannot hide changes before final verification", async () => {
  for (const change of ["bytes", "permissions", "missing", "extra", "link"]) {
    const root = await fixture();
    await symlink("sharp", join(root, "deps/node_modules/linked-sharp"));
    const files = await prepareInventory(root);
    const path = join(root, "app/admin-dist/index.html");
    if (change === "bytes") await writeFile(path, "corrupt");
    if (change === "permissions") await chmod(path, 0o700);
    if (change === "missing") await rm(path);
    if (change === "extra") await writeFile(join(root, "app/undeclared"), "unexpected");
    if (change === "link") {
      await rm(join(root, "deps/node_modules/linked-sharp"));
      await symlink("../../../../", join(root, "deps/node_modules/linked-sharp"));
    }
    await seal(root, files);
    await expect(verifyBundle(root, expected, false)).rejects.toThrow();
  }
});
test("portable verification preserves the complete native identity", async () => {
  const root = await fixture();
  const manifest = await verifyBundle(root, expected, false);
  expect(manifest.platform).toBe(NATIVE_PLATFORM);
  for (const field of ["sourceSha", "profile", "configDigest"] as const)
    await expect(
      verifyBundle(
        root,
        {
          ...expected,
          [field]: field === "profile" ? "release" : "0".repeat(field === "sourceSha" ? 40 : 64),
        },
        false
      )
    ).rejects.toThrow("identity mismatch");
});
test("tampered bytes, permissions, missing and undeclared files fail closed", async () => {
  for (const change of ["bytes", "permissions", "missing", "extra"]) {
    const root = await fixture();
    const path = join(root, "app/admin-dist/index.html");
    if (change === "bytes") await writeFile(path, "corrupt");
    if (change === "permissions") await chmod(path, 0o700);
    if (change === "missing") await rm(path);
    if (change === "extra") await writeFile(join(root, "app/undeclared"), "unexpected");
    await expect(verifyBundle(root, expected, false)).rejects.toThrow("inventory");
  }
});
test("a self-consistent incomplete manifest still cannot be packaged", async () => {
  const root = await fixture();
  await rm(join(root, "app/scripts/migrate.ts"));
  await seal(root);
  await expect(verifyBundle(root, expected, false)).rejects.toThrow("Incomplete runtime bundle");
});
test("internal dependency links work; escaping and absolute links are rejected", async () => {
  const root = await fixture();
  await symlink("sharp", join(root, "deps/node_modules/linked-sharp"));
  await seal(root);
  await expect(verifyBundle(root, expected, false)).resolves.toBeDefined();
  await symlink("../../../../", join(root, "deps/node_modules/escape"));
  await expect(inventory(root)).rejects.toThrow("escapes root");
  await rm(join(root, "deps/node_modules/escape"));
  await symlink(root, join(root, "absolute"));
  await expect(inventory(root)).rejects.toThrow("escapes root");
});
test("manifest path traversal and wrong platform cannot enter the trusted inventory", async () => {
  const root = await fixture();
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  expect(bundleManifestSchema.safeParse({ ...manifest, platform: "linux-arm64" }).success).toBe(
    false
  );
  manifest.files[0].path = "../../outside";
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  await expect(verifyBundle(root, expected, false)).rejects.toThrow();
});
test("native ABI rejects other architectures and GLIBC newer than the runtime", () => {
  expect(() => verifyElf(elf())).not.toThrow();
  const arm = elf();
  arm.writeUInt16LE(183, 18);
  expect(() => verifyElf(arm)).toThrow("x86-64");
  expect(() => verifyElf(Buffer.concat([elf(), Buffer.from("GLIBC_2.40\0")]))).toThrow(
    "unsupported"
  );
  expect(() => verifyElf(Buffer.concat([elf(), Buffer.from("GLIBC_2.39\0")]))).not.toThrow();
});
test("configuration identity changes for product inputs, not unrelated credentials", () => {
  expect(configurationDigest({ PUBLIC_API_BASE_URL: "https://a.example" })).not.toBe(
    configurationDigest({ PUBLIC_API_BASE_URL: "https://b.example" })
  );
  expect(configurationDigest({ GH_TOKEN: "ignored" })).toBe(configurationDigest({}));
});
