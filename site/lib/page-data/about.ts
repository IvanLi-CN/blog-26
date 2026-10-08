import { getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { trimRouteSnapshot } from "../route-data-utils";
export async function loadabout(Astro: PageContext) {
  const snapshot = await getSnapshot();
  const skillGroups = [
    {
      title: "前台与体验",
      accent: "nature-chip-accent",
      items: ["React", "Astro", "TypeScript", "Tailwind CSS", "交互设计"],
    },
    {
      title: "服务端与数据",
      accent: "nature-chip-info",
      items: ["Rust", "Node.js", "SQLite", "OpenAPI"],
    },
    {
      title: "工程化",
      accent: "nature-chip-success",
      items: ["Docker", "GitHub Actions", "CI/CD", "测试自动化", "Linux"],
    },
  ];
  const experienceItems = [
    {
      period: "2022 - 至今",
      title: "高级全栈开发工程师",
      company: "科技公司",
      points: [
        "负责核心产品前后端开发与体验优化。",
        "推动复杂系统模块化和可观测性建设。",
        "建立代码审查与交付规范，降低回归风险。",
      ],
    },
    {
      period: "2020 - 2022",
      title: "全栈开发工程师",
      company: "创业公司",
      points: [
        "从零搭建业务主站与后台能力。",
        "主导技术选型与核心流程设计。",
        "在高速迭代环境下保持稳定发布。",
      ],
    },
  ];
  const recentMoments = [
    { year: "2026", text: "将公开前台迁到 Astro SSG，并继续整理内容生产链路。" },
    { year: "2024", text: "持续写作与沉淀技术笔记，完善个人系统。" },
    { year: "2023", text: "开始稳定整理长期可复用的方法论。 " },
  ];
  return {
    snapshot: trimRouteSnapshot(snapshot, "about", Astro.url.pathname),
    skillGroups,
    experienceItems,
    recentMoments,
  };
}
