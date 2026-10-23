import { describe, expect, test } from "bun:test";
import { publicFixtureCatalog } from "../../src/lib/playbook/fixture";
import { assertPublicCatalog } from "../../src/lib/playbook/schema";

describe("deployed Playbook compatibility", () => {
  test("strips historical internal doc metadata only with the deployed-read option", () => {
    const catalog = structuredClone(publicFixtureCatalog);
    catalog.project_details[0].doc_metadata.push({
      key: "source_repo",
      value: "IvanLi-CN/internal-checkout",
    });

    expect(() => assertPublicCatalog(catalog)).toThrow("Internal metadata");
    const normalized = assertPublicCatalog(catalog, { stripInternalMetadata: true });
    expect(normalized.project_details[0].doc_metadata).not.toContainEqual({
      key: "source_repo",
      value: "IvanLi-CN/internal-checkout",
    });
  });
});
