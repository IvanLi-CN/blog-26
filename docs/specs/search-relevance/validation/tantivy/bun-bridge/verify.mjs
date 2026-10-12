import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const start = performance.now();
const { SearchIndex } = require(resolve(process.env.NATIVE_PROBE ?? "./tantivy_bun_probe.node"));
const coldLoadMs = performance.now() - start;
const path = mkdtempSync(join(tmpdir(), "tantivy-bun-probe-"));
const doc = (hit) => JSON.parse(hit.document);
const throwsControlled = (action) => {
  let error;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error);
  console.log(JSON.stringify({ controlledError: error.name, message: error.message }));
};
try {
  let index = new SearchIndex(path);
  index.upsert("a", "Rust native search", "Tantivy implements inverted index retrieval");
  index.commit();
  assert.equal(doc(index.query("tantivy", 10)[0]).id[0], "a");
  index.upsert("b", "SQLite persistence", "SQLite remains the primary source of truth");
  index.commit();
  assert.equal(doc(index.query("sqlite", 10)[0]).id[0], "b");
  index.upsert("unicode-猫", "心羽の café", "日本語 中文 🐈 unicode roundtrip");
  index.commit();
  const unicodeDocument = doc(index.query("unicode", 10)[0]);
  assert.equal(unicodeDocument.id[0], "unicode-猫");
  assert.equal(unicodeDocument.title[0], "心羽の café");
  assert.equal(unicodeDocument.body[0], "日本語 中文 🐈 unicode roundtrip");
  index.upsert("a", "Changed title", "replacement unicorn content");
  index.commit();
  assert.equal(index.query("tantivy", 10).length, 0);
  assert.equal(doc(index.query("unicorn", 10)[0]).id[0], "a");
  assert.equal(doc(index.query("unicode", 10)[0]).id[0], "unicode-猫");
  throwsControlled(() => index.query('"', 10));
  throwsControlled(() => index.query("sqlite", 0));
  throwsControlled(() => index.upsert("", "", ""));
  throwsControlled(() => index.query({}, 10));
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  const asyncStart = performance.now();
  const asyncHits = await index.queryAsync("sqlite", 10, 20_000);
  clearInterval(timer);
  assert.equal(doc(asyncHits[0]).id[0], "b");
  assert(ticks > 0, "Bun timers must progress during native AsyncTask");
  console.log(JSON.stringify({ asyncMs: performance.now() - asyncStart, timerTicks: ticks }));
  await assert.rejects(index.queryAsync('"', 10, 1));
  index.close();
  throwsControlled(() => index.query("sqlite", 10));
  index = new SearchIndex(path);
  assert.equal(doc(index.query("sqlite", 10)[0]).id[0], "b");
  assert.equal(doc(index.query("unicorn", 10)[0]).id[0], "a");
  index.close();
  console.log(
    JSON.stringify({
      pass: true,
      coldLoadMs,
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      persistedFiles: readdirSync(path),
    })
  );
} finally {
  rmSync(path, { recursive: true, force: true });
}
