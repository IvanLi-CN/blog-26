import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type NativePlatform, nativePlatformKey } from "../../scripts/native-search-cache-platform";

const platform: NativePlatform = {
  distribution: "ubuntu",
  release: "24.04",
  architecture: "x64",
  libc: "glibc 2.39",
  compiler: "gcc 13.3.0",
  linker: "GNU ld 2.42",
  runtimeLibraries: { "libgcc_s.so.1": "gcc-digest", "libstdc++.so.6": "cpp-digest" },
};

test("irrelevant hosted image changes do not alter native platform identity", () => {
  const oldImage = { ...platform, ImageVersion: "20261101.1" };
  const newImage = { ...platform, ImageVersion: "20261108.1" };
  expect(nativePlatformKey(oldImage)).toBe(nativePlatformKey(newImage));
  expect(
    nativePlatformKey({
      ...platform,
      runtimeLibraries: { "libstdc++.so.6": "cpp-digest", "libgcc_s.so.1": "gcc-digest" },
    })
  ).toBe(nativePlatformKey(platform));
});

test("every compatibility input invalidates reuse", () => {
  for (const key of [
    "distribution",
    "release",
    "architecture",
    "libc",
    "compiler",
    "linker",
  ] as const)
    expect(nativePlatformKey({ ...platform, [key]: `${platform[key]}-changed` })).not.toBe(
      nativePlatformKey(platform)
    );
  expect(
    nativePlatformKey({ ...platform, runtimeLibraries: { "libgcc_s.so.1": "new-digest" } })
  ).not.toBe(nativePlatformKey(platform));
  expect(() => nativePlatformKey({ ...platform, libc: "" })).toThrow();
  expect(() => nativePlatformKey({ ...platform, runtimeLibraries: {} })).toThrow();
});

test("action uses exact recipe keys and verifies both cold and cached modules", () => {
  const action = readFileSync(".github/actions/setup-native-search/action.yml", "utf8");
  expect(action).not.toContain("ImageVersion");
  expect(action).not.toContain("restore-keys:");
  expect(action).toContain("'scripts/native-search-cache-platform.ts'");
  expect(action).toContain("native-search-v2-");
  expect(action).toContain("if: steps.native.outputs.cache-hit != 'true'");
  expect(action.trim().endsWith("run: bun run search:native:verify")).toBe(true);
});
