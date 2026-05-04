import { describe, expect, test } from "bun:test";
import { scoreKeywordSearchCandidate } from "./search";

describe("keyword search scoring", () => {
  test("ranks title matches above body-only matches", () => {
    const titleMatch = scoreKeywordSearchCandidate("React Hooks", {
      title: "React Hooks 深度解析",
      body: "A short note.",
    });
    const bodyOnly = scoreKeywordSearchCandidate("React Hooks", {
      title: "Frontend note",
      body: "React Hooks 改变了函数组件的状态管理方式。",
    });

    expect(titleMatch).toBeGreaterThan(bodyOnly);
  });

  test("keeps Arch Linux matches above archive/search false positives", () => {
    const archLinux = scoreKeywordSearchCandidate("Arch", {
      title: "快速在 PVE 全新部署 Arch Linux LXC",
      body: "PVE 提供的 Arch Linux 模板需要更新 pacman keyring。",
    });
    const archive = scoreKeywordSearchCandidate("Arch", {
      title: "MongoDB 在 Docker 中备份和恢复 Archive 格式数据",
      body: "MongoDB archive restore notes.",
    });
    const searchTool = scoreKeywordSearchCandidate("Arch", {
      title: "Augment 提示词",
      body: "Use tavily search to inspect MCP documentation.",
    });

    expect(archLinux).toBeGreaterThan(archive);
    expect(archLinux).toBeGreaterThan(searchTool);
    expect(archive).toBe(0);
    expect(searchTool).toBe(0);
  });
});
