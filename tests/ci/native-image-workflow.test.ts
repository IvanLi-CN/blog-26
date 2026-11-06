import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";
import { frozenConfigSchema } from "../../src/lib/release/inputs";

test("all new image producers use native Ubuntu and a packaging-only Dockerfile", () => {
  const ci = z
    .object({
      jobs: z.record(
        z.string(),
        z.object({
          "runs-on": z.string(),
          name: z.string().optional(),
          needs: z.unknown().optional(),
          steps: z.array(
            z.object({
              uses: z.string().optional(),
              name: z.string().optional(),
              run: z.string().optional(),
              with: z.record(z.string(), z.unknown()).optional(),
            })
          ),
        })
      ),
    })
    .parse(load(readFileSync(".github/workflows/ci.yml", "utf8")));
  expect(ci.jobs.docker?.["runs-on"]).toBe("ubuntu-24.04");
  expect(ci.jobs["frozen-product-smoke"]?.["runs-on"]).toBe("ubuntu-24.04");
  expect(ci.jobs.docker?.name).toBe("Build and Push Docker Image");
  expect(ci.jobs.docker?.needs).toBeUndefined();
  const steps = ci.jobs.docker?.steps || [];
  expect(steps.some((step) => step.uses?.includes("setup-qemu"))).toBe(false);
  const prepare = steps.findIndex((step) => step.run?.includes("bun run image:prepare"));
  const pack = steps.findIndex((step) => step.uses?.includes("docker/build-push-action"));
  expect(prepare).toBeGreaterThan(-1);
  expect(pack).toBeGreaterThan(prepare);
  expect(steps[pack]?.with?.context).toBe(`${"${{ runner.temp }}"}/runtime-bundle`);
  expect(String(steps[pack]?.with?.["cache-to"])).toContain("mode=min");
  expect(readFileSync(".github/workflows/product-release.yml", "utf8")).toContain(
    "runs-on: ubuntu-24.04"
  );
  const dockerfile = readFileSync("Dockerfile", "utf8");
  expect(dockerfile).not.toMatch(/RUN[^\n]*(?:bun install|bun run|cargo|generate-project)/);
  expect(dockerfile).not.toContain("COPY . .");
  expect(dockerfile).toContain("FROM runtime AS app-image-built");
  expect(dockerfile).toContain("FROM runtime AS app-image-prebuilt");
  expect(dockerfile).toContain("ARG PUBLIC_ASSISTANT_LAUNCHER_DEFAULT=true");
  expect(dockerfile).toContain(
    "ENV PUBLIC_ASSISTANT_LAUNCHER_DEFAULT=${PUBLIC_ASSISTANT_LAUNCHER_DEFAULT}"
  );
  expect(String(steps[pack]?.with?.["build-args"])).toContain(
    "PUBLIC_ASSISTANT_LAUNCHER_DEFAULT=${{ env.PUBLIC_ASSISTANT_LAUNCHER_DEFAULT }}"
  );
  expect(dockerfile.indexOf("deps/node_modules")).toBeLessThan(dockerfile.indexOf("app/ ./"));
});

test("frozen v1 remains readable while v2 seals the distinct native runtime recipe", () => {
  const v1 = {
    schemaVersion: 1,
    identity: "fixture",
    productVersion: "4.0.0",
    sourceSha: "a".repeat(40),
    buildDate: "2026-11-07T00:00:00Z",
    bunVersion: "1.4.2",
    nodeVersion: "v22.23.2",
    baseImages: {
      build: `oven/bun@sha256:${"b".repeat(64)}`,
      runtime: `oven/bun@sha256:${"c".repeat(64)}`,
    },
    env: {},
  } as const;
  expect(frozenConfigSchema.parse(v1)).toEqual(v1);
  const v2 = {
    ...v1,
    schemaVersion: 2,
    baseImages: { ...v1.baseImages, runtime: `ubuntu@sha256:${"d".repeat(64)}` },
    nativeBuild: {
      platform: "ubuntu-24.04-amd64-glibc-2.39",
      recipe: "native-runtime-v1",
      rustVersion: "1.91.0",
    },
  } as const;
  expect(frozenConfigSchema.parse(v2)).toEqual(v2);
  expect(
    frozenConfigSchema.safeParse({
      ...v2,
      nativeBuild: { ...v2.nativeBuild, platform: "linux-arm64" },
    }).success
  ).toBe(false);
  expect(frozenConfigSchema.safeParse({ ...v2, baseImages: v1.baseImages }).success).toBe(false);
  expect(frozenConfigSchema.safeParse({ ...v1, baseImages: v2.baseImages }).success).toBe(false);
});
