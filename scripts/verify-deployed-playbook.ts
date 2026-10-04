import { readFile } from "node:fs/promises";
import { readPublicPointer } from "../src/lib/playbook/artifacts";
import { parseEditionIdentity, samePlaybookEdition } from "../src/lib/playbook/manifest";

const expected = parseEditionIdentity(
  JSON.parse(await readFile("edgeone-dist/_content/playbook/manifest.json", "utf8"))
);
for (let attempt = 0; attempt < 15; attempt++) {
  const current = await readPublicPointer("https://ivanli.cc/_content/playbook/manifest.json");
  if (current && samePlaybookEdition(current, expected)) {
    console.log(JSON.stringify(current));
    process.exit(0);
  }
  await new Promise((done) => setTimeout(done, 2000));
}
throw new Error("Production pointer does not match the deployed artifact");
