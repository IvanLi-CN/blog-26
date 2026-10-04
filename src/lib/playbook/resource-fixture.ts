import type { PlaybookPolicySkillResource } from "./types";

// Authored public examples for the file browser; never exported from private files.
export const publicResourceFixture: PlaybookPolicySkillResource[] = [
  {
    path: "scripts/verify.sh",
    kind: "script",
    content: [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      "# Verify the fixed public input before publishing.",
      `manifest="\${1:-playbook-public-manifest.json}"`,
      `bundle="\${2:-playbook-public.tar.gz}"`,
      "",
      'if [[ ! -f "$manifest" || ! -f "$bundle" ]]; then',
      '  printf "Missing public release assets\\n" >&2',
      "  exit 1",
      "fi",
      "",
      'expected=$(jq -r ".bundle.sha256" "$manifest")',
      'actual=$(sha256sum "$bundle" | cut -d " " -f 1)',
      '[[ "$actual" == "$expected" ]]',
      "",
      'printf "Public bundle verified\\n"',
      "",
    ].join("\n"),
  },
  {
    path: "references/release-guide.md",
    kind: "reference",
    content: [
      "# 发布核对",
      "",
      "先固定输入，再生成同一批页面、数据与资源。",
      "",
      "## 发布前",
      "",
      "- 确认来源版本与提交。",
      "- 检查公开边界和文件摘要。",
      "- 保留上一版公开资源。",
      "",
      "```yaml",
      "release:",
      '  channel: "stable"',
      "  retain_previous: true",
      "```",
      "",
      "使用[校验脚本](../scripts/verify.sh)核对文件，或阅读[失败恢复](advanced/recovery.md)。",
      "",
    ].join("\n"),
  },
  {
    path: "references/advanced/recovery.md",
    kind: "reference",
    content:
      "# 失败恢复\n\n失败时继续提供最后成功版本。\n\n## 重试\n\n重新校验固定输入；未通过时保留当前快照。\n\n[返回发布核对](../release-guide.md)\n",
  },
  {
    path: "config/release.json",
    kind: "config",
    content:
      '{\n  "channel": "stable",\n  "retainPrevious": true,\n  "pollIntervalSeconds": 300\n}\n',
  },
  {
    path: "NOTICE",
    kind: "text",
    content:
      "Public reading fixture\n\nThese files illustrate a Skill directory.\nKeep the relative paths when installing.\n",
  },
];
