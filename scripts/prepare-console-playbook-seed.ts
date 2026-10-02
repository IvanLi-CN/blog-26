import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { downloadRetainedEdition, readPublicPointer } from "../src/lib/playbook/artifacts";
import { readPlaybookEdition } from "../src/lib/playbook/bundle";
import { encodeJson } from "../src/lib/playbook/manifest";

if (process.env.PLAYBOOK_USE_DEPLOYED !== "true") process.exit(0);
const url =
  process.env.PLAYBOOK_MANIFEST_URL || "https://ivanli.cc/_content/playbook/manifest.json";
const pointer = await readPublicPointer(url);
const edition = pointer
  ? await downloadRetainedEdition(pointer, url, resolve(".tmp/console-playbook-seed"))
  : process.env.PLAYBOOK_BUNDLE_DIR
    ? await readPlaybookEdition(
        process.env.PLAYBOOK_BUNDLE_DIR,
        process.env.COMMIT_HASH || process.env.GITHUB_SHA || "",
        "{}\n"
      )
    : undefined;
if (!edition) throw new Error("Console requires a fixed public initial seed");
await mkdir(resolve("site/generated"), { recursive: true });
await writeFile(resolve("site/generated/playbook-edition.json"), encodeJson(edition));
