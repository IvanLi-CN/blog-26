import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planNativeQuery } from "../src/lib/search/native-query";

const require = createRequire(import.meta.url);
const { openSearchIndex } = require(
  process.env.SEARCH_NATIVE_PATH ?? join(process.cwd(), "native/search/search.linux-x64.node")
);
const path = mkdtempSync(join(tmpdir(), "blog-native-conformance-"));
let openingTicks = 0;
const openingTimer = setInterval(() => openingTicks++, 1);
const index = await openSearchIndex(path);
clearInterval(openingTimer);
console.log(`PASS asynchronous index opening; timer ticks=${openingTicks}`);
const bodies = [
  "Arch Linux",
  "Arch-Linux",
  "中文Arch中文",
  "archive",
  "search",
  "aarch64",
  "ArchLinux",
  "arch_linux",
  "这篇文章",
  "文隔开章",
  "文。章",
  "文 章",
  "文-章",
  "C",
  "C++",
  "C#",
  "C++17",
  "Node.js",
  "NodeJS",
  "Node js",
  "graph node",
  "SQLite",
  "SQLite3",
  "ESP32-C3",
];
await index.apply(
  JSON.stringify(
    bodies.map((body, id) => ({
      id: String(id),
      version: "1",
      type: "post",
      published: true,
      body,
      slug: `item-${id}`,
      title: "",
      excerpt: "",
      tags: "",
    }))
  )
);
async function ids(q: string) {
  const result = JSON.parse(
    await index.search(
      JSON.stringify({ ast: planNativeQuery(q).ast, limit: 100, published_only: true })
    )
  );
  return result.map((x: { id: string }) => Number(x.id)).sort((a: number, b: number) => a - b);
}
for (const [q, expected] of [
  ["Arch", [0, 1, 2]],
  ["文章", [8]],
  ["C", [13]],
  ["C++", [14]],
  ["C#", [15]],
  ["Node", [17, 18, 19, 20]],
  ["NodeJS", [17, 18]],
  ["Node.js", [17, 18]],
  ["SQLite", [21]],
  ["ESP32", [23]],
  ["sqlite*", [21, 22]],
  ["C++*", [14, 16]],
  ["body:Arch", [0, 1, 2]],
  ["title:Arch", []],
  ["Arch NOT Linux", [2]],
  ["Arch OR SQLite", [0, 1, 2, 21]],
  ['"Node js"', [19]],
] as const) {
  assert.deepEqual(await ids(q), expected, q);
  console.log(`PASS ${q}`);
}
await index.apply(
  JSON.stringify([
    { id: "0", version: "2", deleted: true },
    { id: "3", version: "2", body: "Arch", type: "post", published: true },
  ])
);
assert.deepEqual(await ids("Arch"), [1, 2, 3]);
console.log("PASS committed update/delete and reader reload");
for (let offset = 0; offset < 10_000; offset += 256) {
  await index.apply(
    JSON.stringify(
      Array.from({ length: Math.min(256, 10_000 - offset) }, (_, i) => ({
        id: `event-loop-${String(offset + i).padStart(5, "0")}`,
        version: "1",
        body: "eventloopprobe",
        type: "post",
        published: true,
      }))
    )
  );
}
let ticks = 0;
const timer = setInterval(() => ticks++, 1);
const eventLoopQuery = JSON.stringify({
  ast: planNativeQuery("eventloopprobe").ast,
  limit: 1,
  published_only: true,
});
await Promise.all(Array.from({ length: 32 }, () => index.search(eventLoopQuery)));
clearInterval(timer);
assert.ok(ticks > 0, "native queries allow the event loop to progress");
console.log(`PASS asynchronous search; timer ticks=${ticks}`);
await index.apply(
  JSON.stringify(
    Array.from({ length: 257 }, (_, i) => ({
      id: `tie-${String(i).padStart(3, "0")}`,
      version: "1",
      body: `equalword uniquePrefix${i}`,
      type: "post",
      published: true,
    }))
  )
);
await index.apply(
  JSON.stringify([
    {
      id: "old-date",
      version: "1",
      body: "dateprobe",
      type: "post",
      published: true,
      publish_date: 1,
    },
    {
      id: "new-date",
      version: "1",
      body: "dateprobe",
      type: "post",
      published: true,
      publish_date: 2,
    },
  ])
);
const dateTied = JSON.parse(
  await index.search(
    JSON.stringify({ ast: planNativeQuery("dateprobe").ast, limit: 2, published_only: true })
  )
);
assert.deepEqual(
  dateTied.map((hit: { id: string }) => hit.id),
  ["new-date", "old-date"],
  "same-score ties retain newer-first order for caller truncation"
);
console.log("PASS stable same-score date order survives the native result adapter");
const tied = JSON.parse(
  await index.search(
    JSON.stringify({ ast: planNativeQuery("equalword").ast, limit: 10, published_only: true })
  )
);
assert.deepEqual(
  tied.map((hit: { id: string }) => hit.id),
  Array.from({ length: 10 }, (_, i) => `tie-${String(i).padStart(3, "0")}`)
);
await assert.rejects(
  index.search(JSON.stringify({ ast: planNativeQuery("unique*").ast, limit: 100 })),
  /query budget exceeded/
);
console.log("PASS stable ties before truncation and explicit prefix expansion budget");
console.log(`Conformance index: ${path}`);
