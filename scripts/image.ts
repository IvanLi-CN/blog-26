import { parseArgs } from "node:util";
import {
  command,
  configurationDigest,
  prepareBundle,
  requireNativePlatform,
  resolveImageDigest,
  verifyBundle,
} from "./runtime-bundle";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    profile: { type: "string", default: "local" },
    output: { type: "string" },
    "source-sha": { type: "string" },
    "config-digest": { type: "string" },
    "runtime-image": { type: "string" },
    "bun-image": { type: "string" },
    "reuse-build": { type: "boolean", default: false },
    portable: { type: "boolean", default: false },
  },
});
const action = positionals[0];
if (
  !values.output ||
  !["ci", "local", "release"].includes(values.profile || "") ||
  !["prepare", "verify"].includes(action || "")
)
  throw new Error(
    "Usage: image.ts prepare|verify --output PATH --profile ci|local|release [--reuse-build]"
  );
const expected = {
  sourceSha: values["source-sha"] || command("git", ["rev-parse", "HEAD"]),
  profile: values.profile as "ci" | "local" | "release",
  configDigest: values["config-digest"] || configurationDigest(),
};
if (action === "prepare") {
  if (values.portable) throw new Error("Native preparation cannot be portable");
  await requireNativePlatform();
  await prepareBundle({
    ...expected,
    output: values.output,
    reuseBuild: values["reuse-build"],
    baseImages: {
      runtime: values["runtime-image"] || resolveImageDigest("ubuntu:24.04"),
      bun: values["bun-image"] || resolveImageDigest("oven/bun:1.4.2"),
    },
  });
} else {
  const manifest = await verifyBundle(values.output, expected, !values.portable);
  console.log(
    JSON.stringify({
      event: "runtime-bundle-verified",
      sourceSha: manifest.sourceSha,
      profile: manifest.profile,
      configDigest: manifest.configDigest,
      baseImages: manifest.baseImages,
    })
  );
}
