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
