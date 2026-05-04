import { expect, test } from "bun:test";
import { buildSearchSnippet } from "./search-snippet";

test("buildSearchSnippet prefers matched body content over a generic excerpt", () => {
  const snippet = buildSearchSnippet("React", {
    title: "Hooks notes",
    excerpt: "A short summary without the target word.",
    body: [
      "Introductory setup details that are not useful in the result card.",
      "React Hooks 的依赖数组、闭包和渲染时机决定了组件副作用是否稳定。",
      "Extra notes after the useful match.",
    ].join(" "),
  });

  expect(snippet).toContain("React Hooks");
  expect(snippet).not.toBe("A short summary without the target word.");
});

test("buildSearchSnippet falls back to excerpt when content has no keyword match", () => {
  const snippet = buildSearchSnippet("Arch", {
    title: "Install notes",
    excerpt: "整理一次从分区、引导到桌面环境的安装记录。",
    body: "This body talks about unrelated setup details.",
  });

  expect(snippet).toBe("整理一次从分区、引导到桌面环境的安装记录。");
});

test("buildSearchSnippet removes markdown noise while preserving line breaks", () => {
  const snippet = buildSearchSnippet("arch", {
    body: [
      "# 创建运行 ArchLinux 的 AWS EC2 实例",
      "",
      "<br />",
      "",
      "使用市场里的 AMI 就能拥有 **ArchLinux** 系统了。",
      "",
      "但是由于直接在 AWS 里搜索 \\`arch-linux\\` 和 \\arch linux\\ 不知道为啥特别慢。",
    ].join("\n"),
  });

  expect(snippet).toContain("创建运行 ArchLinux");
  expect(snippet).toContain("\n");
  expect(snippet).toContain("ArchLinux 系统");
  expect(snippet).toContain("arch-linux");
  expect(snippet).toContain("arch linux");
  expect(snippet).not.toContain("<br");
  expect(snippet).not.toContain("\\`");
  expect(snippet).not.toContain("\\arch linux\\");
  expect(snippet).not.toContain("**");
});

test("buildSearchSnippet formats fenced code as an indented snippet block", () => {
  const snippet = buildSearchSnippet("pacman", {
    body: [
      "排查过程：",
      "",
      "```sh",
      "sudo pacman -Syu",
      "  sudo pacman -S archlinux-keyring",
      "```",
      "",
      "_完成后_ 再重试安装。",
    ].join("\n"),
  });

  expect(snippet).toContain("    sudo pacman -Syu");
  expect(snippet).toContain("      sudo pacman -S archlinux-keyring");
  expect(snippet).toContain("\n");
  expect(snippet).not.toContain("```");
  expect(snippet).not.toContain("_完成后_");
});
