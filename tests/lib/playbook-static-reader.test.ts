import { describe, expect, test } from "bun:test";
import { parseStaticPlaybookEdition } from "../../site/lib/playbook";
import { makePublicBundle } from "./playbook-fixture";

describe("static Playbook reader", () => {
  test("strips retained internal metadata before static rendering", () => {
    const bundle = makePublicBundle();
    const edition = structuredClone(bundle.edition);
    edition.catalog.project_details[0]?.doc_metadata.push({
      key: "source_repo",
      value: "IvanLi-CN/internal-checkout",
    });

    const parsed = parseStaticPlaybookEdition(JSON.stringify(edition));

    expect(parsed.catalog.project_details[0]?.doc_metadata).not.toContainEqual({
      key: "source_repo",
      value: "IvanLi-CN/internal-checkout",
    });
  });
});
