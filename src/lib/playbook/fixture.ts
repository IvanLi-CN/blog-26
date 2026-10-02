import type { PlaybookPublicCatalog, PlaybookSearchPayload } from "./types";

// Controlled public samples shared by contract tests and presentation stories.
const project = {
  slug: "sample-project",
  name: "Sample Project",
  description: "公开的项目经验快照。",
  source: "https://github.com/example/public-project",
  tags: ["astro", "交付"],
  snapshot_exists: true,
  visibility: "public",
  created_at: null,
  updated_at: null,
};
const topic = {
  slug: "delivery",
  token: "可靠交付",
  description: "从固定输入构建可追溯的产物。",
  categories: ["工程", "Release"],
  project_count: 1,
  related_projects: [{ slug: project.slug, name: project.name }],
};
export const publicFixtureCatalog: PlaybookPublicCatalog = {
  snapshot: {
    index: { generated_at: "2026-09-01T00:00:00Z", project_count: 1, topic_count: 1 },
    projects: [project],
    topics: [topic],
  },
  project_details: [
    {
      item: project,
      title: "Sample Project 经验快照",
      doc_metadata: [{ key: "范围", value: "公开样例" }],
      stack: { framework: "Astro" },
      sections: [
        {
          id: "architecture",
          title: "架构与选择",
          markdown:
            "以 **Astro** 提供静态阅读，用固定的内容版本保持可重复构建。\n\n参见[可靠交付](/topics/delivery#release)。",
        },
      ],
    },
  ],
  topic_details: [
    {
      item: topic,
      doc_metadata: [],
      sections: [
        {
          id: "release",
          title: "稳定发布",
          markdown:
            "发布前校验内容摘要；部署失败时保留最后可用版本。\n\n```yaml\nconcurrency:\n  cancel-in-progress: false\n```\n\n[项目经验](/projects/sample-project#architecture)与规则共同构成经验库。",
        },
        {
          id: "recovery",
          title: "失败与恢复",
          markdown: "断网时继续提供已经验证的内容，恢复后整体切换新版本。",
        },
      ],
      policy_skills: [
        {
          summary: {
            slug: "safe-release",
            name: "Safe Release",
            description: "发布校验与失败恢复规则。",
            primary_topic: "delivery",
            policy_dependencies: [],
          },
          frontmatter: {
            name: "Safe Release",
            description: "Public release policy",
            visibility: "public",
          },
          instruction_markdown:
            "# 发布规则\n\n校验固定输入，成功后切换公开指针。\n\n使用[校验脚本](scripts/verify.sh)检查结果。",
          resources: [
            {
              path: "scripts/verify.sh",
              kind: "script",
              content:
                "#!/bin/sh\n# Public example; download never executes this file.\necho verify\n",
            },
          ],
        },
      ],
    },
  ],
};
export const publicFixtureSearch: PlaybookSearchPayload = {
  generated_at: "2026-09-01T00:00:00Z",
  documents: [
    {
      id: "topic:delivery",
      kind: "page",
      title: "可靠交付",
      subtitle: "稳定发布与可靠部署",
      body: "Astro 固定版本 静态构建 稳定发布",
      route: "/topics/delivery",
      section_id: null,
      keywords: ["release", "发布"],
      command_id: null,
    },
    {
      id: "project:sample",
      kind: "page",
      title: "Sample Project",
      subtitle: "项目经验",
      body: "Astro static snapshot engineering",
      route: "/projects/sample-project",
      section_id: null,
      keywords: ["Astro"],
      command_id: null,
    },
    {
      id: "section:release",
      kind: "section",
      title: "稳定发布",
      subtitle: "可靠交付",
      body: "校验内容摘要后部署",
      route: "/topics/delivery",
      section_id: "release",
      keywords: ["发布"],
      command_id: null,
    },
  ],
};
