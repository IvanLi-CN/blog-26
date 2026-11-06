import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assistantMarkdownMessages,
  assistantMarkdownSceneNames,
} from "../../src/lib/web-demo-scenes";

test("official assistant scenes bundle and preserve messages without the excluded tests directory", async () => {
  const context = await mkdtemp(join(tmpdir(), "assistant-build-context-"));
  try {
    await mkdir(join(context, "src/lib"), { recursive: true });
    for (const file of ["web-demo-scenes.ts", "web-demo-assistant-fixtures.ts"]) {
      await copyFile(join(import.meta.dir, "../../src/lib", file), join(context, "src/lib", file));
    }
    const result = await Bun.build({
      entrypoints: [join(context, "src/lib/web-demo-scenes.ts")],
      target: "browser",
      format: "esm",
    });
    expect(result.success).toBe(true);
    expect(result.logs).toEqual([]);
    const bundlePath = join(context, "scenes.mjs");
    await Bun.write(bundlePath, await result.outputs[0].text());
    const bundled = await import(bundlePath);
    for (const scene of assistantMarkdownSceneNames) {
      expect(bundled.assistantMarkdownMessages(scene)).toEqual(assistantMarkdownMessages(scene));
    }
  } finally {
    await rm(context, { recursive: true, force: true });
  }
});
