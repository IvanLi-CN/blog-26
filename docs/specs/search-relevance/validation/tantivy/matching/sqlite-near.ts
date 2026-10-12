import { Database } from "bun:sqlite";
import { parseSearchQuery } from "../../../../../../src/lib/search/query";

const db = new Database(":memory:");
db.exec("CREATE VIRTUAL TABLE corpus USING fts5(body, tokenize='trigram')");
const documents = [
  "alpha beta",
  "beta alpha",
  "alpha x beta",
  "alpha enormousgap beta",
  "abcXYZdef",
  "defXYZabc",
  "abc def",
  "abcXdef",
  "abcXXdef",
  "甲乙丙丁戊己",
  "甲乙丙中间丁戊己",
  "丁戊己甲乙丙",
  "中文Arch-中文SQLite",
  "中文Arch......SQLite",
  "Arch中文SQLite",
  "甲乙丙。丁戊己",
];
documents.forEach((body) => {
  db.query("INSERT INTO corpus(body) VALUES (?)").run(body);
});
console.log(
  JSON.stringify({
    bun: Bun.version,
    sqlite: db.query("SELECT sqlite_version() version").get(),
    documents,
  })
);
for (const pair of ["alpha beta", "abc def", "甲乙丙 丁戊己", "Arch SQLite"]) {
  for (const distance of [0, 1, 2, 3, 4, 8, 16]) {
    const raw = `NEAR(${pair}, ${distance})`;
    const plan = parseSearchQuery(raw);
    const rows = db
      .query("SELECT rowid, body FROM corpus WHERE corpus MATCH ? ORDER BY rowid")
      .all(plan.ftsQuery ?? "");
    console.log(JSON.stringify({ raw, mode: plan.mode, ftsQuery: plan.ftsQuery, rows }));
  }
}
db.close();
