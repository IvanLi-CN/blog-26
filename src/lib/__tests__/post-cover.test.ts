import { describe, expect, it } from "bun:test";
import {
  extractPostCoverCandidate,
  getPostCoverCandidates,
  normalizeWikiImageTarget,
} from "../post-cover";

describe("post-cover helpers", () => {
  it("prefers frontmatter image over metadata and body images", () => {
    const record = {
      image: "./covers/frontmatter.png",
      metadata: {
        images: ["./covers/metadata.png"],
      },
      body: "![body](./covers/body.png)\n\n![[wiki-cover.png]]",
    };

    expect(extractPostCoverCandidate(record)).toBe("./covers/frontmatter.png");
  });

  it("falls back to metadata images before body images", () => {
    const record = {
      image: null,
      metadata: {
        images: ["./covers/metadata.png", "./covers/metadata-2.png"],
      },
      body: "![body](./covers/body.png)",
    };

    expect(getPostCoverCandidates(record)).toEqual([
      "./covers/metadata.png",
      "./covers/metadata-2.png",
      "./covers/body.png",
    ]);
    expect(extractPostCoverCandidate(record)).toBe("./covers/metadata.png");
  });

  it("falls back to the first markdown image when frontmatter is missing", () => {
    const record = {
      image: null,
      metadata: {},
      body: "intro\n\n![cover](./assets/fallback.png)\n\n![second](./assets/second.png)",
    };

    expect(extractPostCoverCandidate(record)).toBe("./assets/fallback.png");
  });

  it("normalizes wiki image targets", () => {
    const record = {
      image: null,
      metadata: {},
      body: "text before\n\n![[。/assets/wiki-cover.png|1200]]",
    };

    expect(normalizeWikiImageTarget("。/assets/wiki-cover.png|1200")).toBe(
      "./assets/wiki-cover.png"
    );
    expect(extractPostCoverCandidate(record)).toBe("./assets/wiki-cover.png");
  });

  it("allows external images for posts list fallback", () => {
    const record = {
      image: null,
      metadata: {},
      body: "![cover](https://example.com/cover.png)",
    };

    expect(extractPostCoverCandidate(record, { allowExternal: true })).toBe(
      "https://example.com/cover.png"
    );
  });

  it("can skip external candidates when a caller disables them", () => {
    const record = {
      image: "https://example.com/frontmatter-cover.png",
      metadata: {
        images: ["https://example.com/metadata-cover.png"],
      },
      body: "![cover](./assets/local-cover.png)",
    };

    expect(extractPostCoverCandidate(record, { allowExternal: false })).toBe(
      "./assets/local-cover.png"
    );
  });
});
