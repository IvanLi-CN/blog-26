import { describe, expect, test } from "bun:test";
import { getPlaybookStatusNotice } from "@/lib/playbook/visitor-reading";

describe("Playbook visitor reading information", () => {
  test("maps only explicit non-current status values to Chinese notices", () => {
    expect(getPlaybookStatusNotice([{ key: "status", value: "stale" }])).toBe("内容已过时");
    expect(getPlaybookStatusNotice([{ key: "status", value: "outdated" }])).toBe("内容已过时");
    expect(getPlaybookStatusNotice([{ key: "status", value: "deprecated" }])).toBe("内容已废弃");
    expect(getPlaybookStatusNotice([{ key: "status", value: "superseded" }])).toBe("已有替代内容");
    expect(getPlaybookStatusNotice([{ key: "status", value: "current" }])).toBeUndefined();
    expect(getPlaybookStatusNotice([{ key: "status", value: "unknown" }])).toBeUndefined();
    expect(
      getPlaybookStatusNotice([
        { key: "status", value: "stale" },
        { key: "status", value: "deprecated" },
      ])
    ).toBeUndefined();
    expect(
      getPlaybookStatusNotice([
        { key: "status", value: "stale" },
        { key: "status", value: "stale" },
      ])
    ).toBe("内容已过时");
    expect(
      getPlaybookStatusNotice([
        { key: "status", value: "stale" },
        { key: "status", value: "outdated" },
      ])
    ).toBe("内容已过时");
  });
});
