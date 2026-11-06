/** Deterministic inputs for the official Web Demo routes; never used by live transport. */
import {
  codeCases,
  completeMarkdown,
  escapingAndCurrency,
  externalImages,
  incrementalSequences,
  maliciousHtml,
} from "../../tests/fixtures/assistant-markdown";
import type { ConversationMessageStatus } from "../components/common/conversation/types";

export const assistantMarkdownSceneNames = [
  "assistant-markdown-complete",
  "assistant-markdown-code",
  "assistant-markdown-safety",
  "assistant-markdown-incremental",
  "assistant-markdown-failed",
  "assistant-markdown-stopped",
  "assistant-markdown-final",
] as const;
export type AssistantMarkdownScene = (typeof assistantMarkdownSceneNames)[number];
export const assistantMarkdownSceneOptions = assistantMarkdownSceneNames.map((value, index) => ({
  value,
  label: `助手格式 · ${["完整与双角色", "代码与公式", "安全与图片", "增量快照", "失败正文", "停止正文", "最终正文"][index]}`,
  description: "固定 audit 样本；增量场景通过 Inspector 模拟保存推进完整快照，不调用模型。",
}));
export const amrCapturedAsset = `assets/${"a".repeat(64)}.png`;
export const amrNonmemberAsset = `assets/${"b".repeat(64)}.png`;
export const amrResourceBase = "/api/public/memos/memo-web-demo-1181/clipping/resources/amr-demo/";
export const amrWideContent = `\n\n| ${Array.from({ length: 40 }, (_, i) => `Column ${i}`).join(" | ")} |\n| ${Array.from({ length: 40 }, () => "---").join(" | ")} |\n| ${Array.from({ length: 40 }, () => "wide_cell_value").join(" | ")} |\n\n\`\`\`text\n${"wide-code-".repeat(80)}\n\`\`\`\n\n$$\n${Array.from({ length: 90 }, () => "x").join("+")}\n$$`;

export function isAssistantMarkdownScene(scene: string): scene is AssistantMarkdownScene {
  return assistantMarkdownSceneNames.includes(scene as AssistantMarkdownScene);
}

export function assistantMarkdownMessages(scene: string) {
  if (!isAssistantMarkdownScene(scene)) return null;
  if (scene === "assistant-markdown-complete")
    return [
      { role: "user" as const, content: completeMarkdown.message.content },
      { role: "assistant" as const, content: completeMarkdown.message.content },
      { role: "assistant" as const, content: completeMarkdown.message.content },
    ];
  if (scene === "assistant-markdown-code")
    return [
      {
        role: "assistant" as const,
        content: [
          ...codeCases.map((c) => c.content),
          escapingAndCurrency.message.content,
          amrWideContent,
        ].join("\n\n"),
      },
    ];
  if (scene === "assistant-markdown-safety")
    return [
      {
        role: "assistant" as const,
        content: [
          Array.from(
            { length: 16 },
            (_, index) =>
              `历史段落 ${index + 1}：保存的正文可继续阅读。图片异步加载不能改变已经选择的阅读位置。`
          ).join("\n\n"),
          maliciousHtml.message.content,
          externalImages.message.content,
          `![捕获图片](${amrCapturedAsset})`,
          `![伪造图片](${amrNonmemberAsset})`,
          "安全场景尾部正文。",
        ].join("\n\n"),
      },
    ];
  if (scene === "assistant-markdown-incremental")
    return [
      { role: "user" as const, content: "保留历史阅读位置，继续下一段。" },
      {
        role: "assistant" as const,
        content: `${Array.from({ length: 3 }, () => completeMarkdown.message.content).join("\n\n")}\n\n${codeCases.find((entry) => entry.id === "long")?.content ?? ""}`,
      },
      { role: "user" as const, content: "请继续生成代码。" },
      { role: "assistant" as const, content: assistantMarkdownSnapshot(scene, 0).content },
    ];
  return [{ role: "assistant" as const, content: assistantMarkdownSnapshot(scene, 0).content }];
}

export const assistantMarkdownFinalStep = 4;

export function assistantMarkdownSnapshot(
  scene: string,
  step: number
): { content: string; status: ConversationMessageStatus } {
  const terminal =
    scene === "assistant-markdown-failed"
      ? "failed"
      : scene === "assistant-markdown-stopped"
        ? "cancelled"
        : "completed";
  const partial = (id: string) =>
    incrementalSequences.find((entry) => entry.id === id)?.snapshots[1]?.content ?? "";
  const closedCode = "```c++\nint x = 1;\n```";
  const stages = [
    `\`\`\`c++\nint`,
    `\`\`\`c++\nint x = 1;\n\`\`\`\n\n[目标](https://example.invalid/pa`,
    `${closedCode}\n\n${partial("partial-table")}`,
    `${closedCode}\n\n${partial("partial-math")}`,
    (incrementalSequences.find((sequence) => sequence.id === "recovered")?.snapshots.at(-1)
      ?.content ?? "") +
      "\n\n```c++\nint x = 1;\n```\n\n[目标](https://example.invalid/path)\n\n" +
      completeMarkdown.message.content +
      "\n\n" +
      (incrementalSequences.find((entry) => entry.id === "partial-math")?.snapshots.at(-1)
        ?.content ?? ""),
  ];
  const final = scene !== "assistant-markdown-incremental";
  return {
    content:
      stages[final ? assistantMarkdownFinalStep : Math.min(step, assistantMarkdownFinalStep)] ?? "",
    status: final || step >= assistantMarkdownFinalStep ? terminal : "streaming",
  };
}
