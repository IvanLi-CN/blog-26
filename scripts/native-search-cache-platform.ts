import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type NativePlatform = {
  distribution: string;
  release: string;
  architecture: string;
  libc: string;
  compiler: string;
  linker: string;
  runtimeLibraries: Record<string, string>;
};

/** Hosted image build dates are not native ABI inputs. Keep actual build/runtime inputs. */
export function nativePlatformKey(platform: NativePlatform) {
  for (const value of Object.values(platform)) {
    if (typeof value === "string" && !value.trim())
      throw new Error("Missing native platform input");
  }
  if (!Object.keys(platform.runtimeLibraries).length) throw new Error("Missing runtime libraries");
  const identity = {
    distribution: platform.distribution,
    release: platform.release,
    architecture: platform.architecture,
    libc: platform.libc,
    compiler: platform.compiler,
    linker: platform.linker,
    runtimeLibraries: Object.fromEntries(
      Object.entries(platform.runtimeLibraries).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

if (import.meta.main) {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw new Error("Native search CI cache requires Linux x64");
  const command = (file: string, args: string[]) =>
    execFileSync(file, args, { encoding: "utf8" }).trim();
  const osRelease = readFileSync("/etc/os-release", "utf8");
  const field = (key: string) =>
    osRelease.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";
  const runtimeLibraries = Object.fromEntries(
    ["libgcc_s.so.1", "libstdc++.so.6"].map((name) => {
      const path = command("cc", [`-print-file-name=${name}`]);
      if (!path.startsWith("/")) throw new Error(`Cannot resolve native runtime library ${name}`);
      return [name, createHash("sha256").update(readFileSync(path)).digest("hex")];
    })
  );
  const platform: NativePlatform = {
    distribution: field("ID"),
    release: field("VERSION_ID"),
    architecture: process.arch,
    libc: command("getconf", ["GNU_LIBC_VERSION"]),
    compiler: command("cc", ["--version"]),
    linker: command("ld", ["--version"]),
    runtimeLibraries,
  };
  console.log(`Native search platform: ${JSON.stringify(platform)}`);
  console.log(`platform=${nativePlatformKey(platform)}`);
}
