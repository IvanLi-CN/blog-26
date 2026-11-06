import type {
  ConversationCodeSource,
  ConversationImageProps,
  ConversationMessage,
  ConversationMessageStatus,
} from "../components/common/conversation/types";

export type AssistantMarkdownRequirement = `REQ-AMR-${string}`;
export type AssistantMarkdownVerification = `VER-AMR-${string}`;

export interface AssistantMarkdownFixture {
  id: string;
  message: ConversationMessage;
  requirements: readonly AssistantMarkdownRequirement[];
  verification: readonly AssistantMarkdownVerification[];
  /** Semantic expectations for implementation tests, not assertions that the baseline passes. */
  expect: readonly string[];
}

function fixture(
  id: string,
  content: string,
  requirements: AssistantMarkdownFixture["requirements"],
  verification: AssistantMarkdownFixture["verification"],
  expectations: readonly string[]
): AssistantMarkdownFixture {
  return {
    id,
    message: {
      messageId: id,
      presentationId: "audit-full-page",
      role: "assistant",
      content,
      status: "completed",
    },
    requirements,
    verification,
    expect: expectations,
  };
}

export const completeMarkdown = fixture(
  "complete",
  [
    "# 阅读合同",
    "",
    "普通段落包含 **粗体**、*强调*、~~删除~~ 与 `inline_code`。",
    "这是同段软换行。  ",
    "这是双空格硬换行。\\",
    "这是反斜杠硬换行。",
    "",
    "> 引用正文",
    "",
    "---",
    "",
    "7. 第七项",
    "   - 嵌套项",
    "8. 第八项",
    "",
    "- [x] 已完成",
    "- [ ] 未完成",
    "",
    "| 项目 | 说明 |",
    "| --- | --- |",
    "| 长文字 | 普通表格文字允许换行，不强制整行不可折行 |",
    "",
    '[标题链接](/posts/contract "合同标题") 与 <https://example.invalid/read>。',
    "",
    "正文裸编号 [3] 不是来源。脚注见这里[^shared]。",
    "",
    "[^shared]: 本消息的脚注定义。",
  ].join("\n"),
  ["REQ-AMR-001", "REQ-AMR-002", "REQ-AMR-003", "REQ-AMR-008", "REQ-AMR-010"],
  ["VER-AMR-001", "VER-AMR-003", "VER-AMR-005"],
  [
    "Assistant has semantic heading/emphasis/quote/rule; user preserves identical literal source.",
    "Ordered list starts at 7 and has a nested unordered list; task inputs are disabled.",
    "One soft break and two hard breaks; title is retained; bare [3] stays plain text.",
    "Footnote reference, definition and backlink resolve within this message body.",
    "Table wraps ordinary text and scrolls locally only when necessary.",
  ]
);

export const dualRoleMessages: readonly ConversationMessage[] = [
  { ...completeMarkdown.message, messageId: "same-source-user", role: "user" },
  { ...completeMarkdown.message, messageId: "same-source-assistant" },
];

export const escapingAndCurrency = fixture(
  "escaping-currency",
  [
    "\\# 字面标题",
    "",
    "\\*不是强调\\* 与 \\_下划线\\_ 与 \\[不是链接\\]。",
    "",
    "价格 \\$5 与 \\$10；这里不猜测货币：$5 and $10。",
    "",
    "标准公式 $x_1 + y_2$。",
    "",
    "$$",
    "\\frac{a}{b} = c",
    "$$",
    "",
    "无效公式 $\\notARealCommand{x}$ 后仍有正文。",
    "",
    "旧 TeX 分隔符 \\(x\\) 与 \\[y\\] 不做全局转换。",
    "",
    "`$HOME \\$5 \\alpha`",
    "",
    "```text",
    "$HOME \\$5 \\alpha \\*literal\\*",
    "```",
  ].join("\n"),
  ["REQ-AMR-002", "REQ-AMR-004", "REQ-AMR-005"],
  ["VER-AMR-001", "VER-AMR-002"],
  [
    "Escaped punctuation stays literal; escaped dollars are text, never math delimiters.",
    "Unescaped dollars follow the parser, with no currency heuristic.",
    "Valid math has formula DOM; invalid math remains readable without removing adjacent prose.",
    "Code dollars, backslashes and escaped punctuation remain byte-for-byte source text.",
  ]
);

export const maliciousHtml = fixture(
  "malicious-html",
  [
    '前文 <b data-untrusted="true">不是粗体 DOM</b> 后文。',
    "",
    "<script>globalThis.__amrExecuted = true</script>",
    '<img src="https://images.example.invalid/raw.png" onerror="globalThis.__amrExecuted = true">',
    '<iframe src="https://frames.example.invalid/embed"></iframe>',
    '<video src="https://media.example.invalid/movie.mp4" autoplay></video>',
    "",
    "[危险链接](javascript:alert%281%29)",
    "[数据链接](data:text/html,unsafe)",
    "![数据图片](data:image/svg+xml,unsafe)",
    "",
    "[安全链接](https://example.invalid/safe)",
    "",
    "末尾正文仍然可读。",
  ].join("\n"),
  ["REQ-AMR-006", "REQ-AMR-007", "REQ-AMR-008", "REQ-AMR-011"],
  ["VER-AMR-003", "VER-AMR-006"],
  [
    "Raw HTML is literal text, with no script, event handlers, iframe, video or raw image DOM.",
    "Unsafe href/src is not actionable; no unchosen media request is issued.",
    "Safe links and adjacent prose remain readable; body text creates no trusted source record.",
  ]
);

export const externalImages = fixture(
  "external-images",
  [
    "![外部图片 A](https://images.example.invalid/a.png?variant=1)",
    "",
    "![外部图片 B](https://images.example.invalid/b.png)",
    "",
    "![损坏图片](https://images.example.invalid/missing.png)",
    "",
    "![相对路径](./assets/diagram.png)",
    "",
    "![同源不代表授权](/api/files/private/diagram.png)",
    "",
    "图片之外的说明始终可读。",
  ].join("\n"),
  ["REQ-AMR-006", "REQ-AMR-007", "REQ-AMR-010"],
  ["VER-AMR-003", "VER-AMR-005"],
  [
    "Before action there is no external img src/srcset/preload/probe or network request.",
    "Choosing A permits exactly A in this message and presentation, never B or another URL variant.",
    "URL, message or presentation changes reset consent; opening a link grants no load consent.",
    "Relative paths require explicit authorized context; same-origin alone grants no permission.",
    "Failure retains alt text and prose; image completion does not move a history reader.",
  ]
);

/** Trusted test adapters only: synthetic facade bindings do not represent production access. */
export const imageResourceCases: readonly {
  id: string;
  input: ConversationImageProps;
  expectedResolution: string | null;
}[] = [
  {
    id: "authorized-relative",
    input: {
      ...externalImages.message,
      src: "./assets/diagram.png",
      alt: "已授权测试资源",
      resourceContext: {
        resolveAuthorizedImage: (src) =>
          src === "./assets/diagram.png" ? { src: "/api/test-facade/amr/diagram.png" } : null,
      },
    },
    expectedResolution: "/api/test-facade/amr/diagram.png",
  },
  {
    id: "denied-same-origin",
    input: {
      ...externalImages.message,
      src: "/api/files/private/diagram.png",
      alt: "同源未授权",
      resourceContext: { resolveAuthorizedImage: () => null },
    },
    expectedResolution: null,
  },
  {
    id: "relative-without-context",
    input: { ...externalImages.message, src: "./assets/diagram.png", alt: "缺少资源上下文" },
    expectedResolution: null,
  },
];

export const codeCases = [
  {
    id: "no-language",
    language: undefined,
    source: "plain\n  indented\n",
    content: "```\nplain\n  indented\n\n```",
  },
  {
    id: "indented",
    language: undefined,
    source: "indented\nnext",
    content: "    indented\n    next",
  },
  { id: "empty", language: undefined, source: "", content: "```\n```" },
  {
    id: "cpp",
    language: "c++",
    source: "int main() { return 0; }",
    content: "```c++\nint main() { return 0; }\n```",
  },
  {
    id: "objective-c",
    language: "objective-c",
    source: "@interface Example\n@end",
    content: "```objective-c\n@interface Example\n@end\n```",
  },
  {
    id: "unknown",
    language: "amr-unknown+v1",
    source: "<literal> $5 \\alpha",
    content: "```amr-unknown+v1\n<literal> $5 \\alpha\n```",
  },
  {
    id: "diagram-as-code",
    language: "mermaid",
    source: "graph TD; A-->B",
    content: "```mermaid\ngraph TD; A-->B\n```",
  },
  {
    id: "long",
    language: "text",
    source: Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join("\n"),
    content: `\u0060\u0060\u0060text\n${Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join("\n")}\n\u0060\u0060\u0060`,
  },
] as const satisfies readonly (ConversationCodeSource & { id: string; content: string })[];

export const codeFixtures = codeCases.map((entry) =>
  fixture(
    `code-${entry.id}`,
    entry.content,
    ["REQ-AMR-004", "REQ-AMR-010"],
    ["VER-AMR-002", "VER-AMR-005"],
    [
      "Block identity comes from AST/pre, not the presence of a language label.",
      "Copy equals codeCases.source (the parsed code value), preserving whitespace and trailing newline.",
      "Keep the full language token; unknown languages and Mermaid remain readable code.",
      "Initially expanded; only user action folds; content updates preserve the user's choice.",
      "Copy success and failure have distinct accessible feedback.",
    ]
  )
);

export const footnoteInstances: readonly ConversationMessage[] = [
  { ...completeMarkdown.message, messageId: "footnote-a", presentationId: "full-page" },
  { ...completeMarkdown.message, messageId: "footnote-b", presentationId: "full-page" },
  { ...completeMarkdown.message, messageId: "footnote-a", presentationId: "floating-panel" },
];

export interface AssistantMarkdownSequence {
  id: string;
  snapshots: readonly ConversationMessage[];
  requirements: readonly AssistantMarkdownRequirement[];
  verification: readonly AssistantMarkdownVerification[];
  expect: readonly string[];
}

function sequence(
  id: string,
  contents: readonly string[],
  status: ConversationMessageStatus
): AssistantMarkdownSequence {
  return {
    id,
    requirements: ["REQ-AMR-001", "REQ-AMR-009", "REQ-AMR-011"],
    verification: ["VER-AMR-001", "VER-AMR-004", "VER-AMR-006"],
    snapshots: contents.map((content, index) => ({
      messageId: id,
      presentationId: "audit-stream",
      role: "assistant",
      content,
      status: index === contents.length - 1 ? status : index === 0 ? "pending" : "streaming",
    })),
    expect: [
      "Each input is an entire server snapshot, never an append-only token delta.",
      "Do not invent closing syntax or a clickable incomplete URL; received content stays readable.",
      "Latest terminal source wins over stale work; compare with a fresh render of that final source.",
      "No persistence rewrite, new request or cancellation; isolate renderer errors to one message.",
    ],
  };
}

export const incrementalSequences: readonly AssistantMarkdownSequence[] = [
  sequence("partial-fence", ["", "```c++\nint", "```c++\nint x = 1;\n```"], "completed"),
  sequence(
    "partial-link",
    ["", "[目标](https://example.invalid/pa", "[目标](https://example.invalid/path)"],
    "completed"
  ),
  sequence(
    "partial-table",
    ["", "| 项目 | 说明 |\n| ---", "| 项目 | 说明 |\n| --- | --- |\n| A | B |"],
    "completed"
  ),
  sequence("partial-math", ["", "$$\n\\frac{a", "$$\n\\frac{a}{b}\n$$"], "completed"),
  sequence(
    "stopped",
    ["", "已收到 [未闭合](https://example.invalid", "已收到 [未闭合](https://example.invalid"],
    "cancelled"
  ),
  sequence("failed", ["", "已收到 $x_", "已收到 $x_"], "failed"),
  sequence("recovered", ["", "旧快照", "恢复后的服务端终态 **完整正文**"], "completed"),
];

export const assistantMarkdownFixtures: readonly AssistantMarkdownFixture[] = [
  completeMarkdown,
  escapingAndCurrency,
  maliciousHtml,
  externalImages,
  ...codeFixtures,
];
