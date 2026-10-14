import { describe, expect, it } from "bun:test";
import { createEdgeoneCacheConfig, findEdgeoneCacheRule } from "./prepare-edgeone-pwa-config";

describe("prepare-edgeone-pwa-config", () => {
  it("covers same-edition Playbook reading HTML routes", () => {
    const pathname =
      "playbook/editions/v2.4.3/412441399/9458769438d9c58c2816983178731eaf103598b3281673af82d04dfb71998aec/policies/worktree-bootstrap/index.html";
    const config = createEdgeoneCacheConfig("", [pathname]);
    const matched = findEdgeoneCacheRule(config, `/${pathname.slice(0, -"index.html".length)}`);

    expect(matched?.headers).toEqual([
      { key: "Cache-Control", value: "public, max-age=60, must-revalidate" },
    ]);
  });
});
