import type { PublicMemoRecord, PublicPostRecord, PublicSnapshot } from "@/public-site/snapshot";
import { getCanonicalUrl } from "./public-site";

export type ProjectDomain =
  | "ai-agent-observability"
  | "cloud-web-platform"
  | "hardware-product"
  | "device-control-foundation"
  | "self-hosted-infra";

export type ProjectExternalLinkKind = "github" | "docs" | "demo" | "site";

export interface ProjectExternalLink {
  kind: ProjectExternalLinkKind;
  label: string;
  href: string;
}

export interface ProjectRelatedEntry {
  type: "post" | "memo";
  slug: string;
  label?: string;
}

export type ProjectPosterPattern =
  | "signal"
  | "rings"
  | "grid"
  | "beams"
  | "stack"
  | "ports"
  | "nodes";

export interface ProjectPosterDefinition {
  eyebrow: string;
  strapline: string;
  pattern: ProjectPosterPattern;
}

export interface ProjectCatalogItem {
  slug: string;
  title: string;
  domain: ProjectDomain;
  summary: string;
  description: string;
  poster: ProjectPosterDefinition;
  links: ProjectExternalLink[];
  techTags: string[];
  highlights: string[];
  relatedEntries: ProjectRelatedEntry[];
  order: number;
}

export interface ProjectDomainDefinition {
  id: ProjectDomain;
  title: string;
  framing: string;
  leadLabel: string;
}

export interface ResolvedProjectRelatedEntry extends ProjectRelatedEntry {
  href: string;
  title: string;
  excerpt?: string | null;
}

export type ProjectCatalog = readonly ProjectCatalogItem[];

export const projectDomains: readonly ProjectDomainDefinition[] = [
  {
    id: "ai-agent-observability",
    title: "AI 接入、代理与观测",
    framing: "偏代理接入层与观测工作台，强调协议兼容、运行态追踪与团队可操作性。",
    leadLabel: "Runtime Surface",
  },
  {
    id: "cloud-web-platform",
    title: "云端控制台 / Web 平台产品",
    framing: "偏公开 Web 产品与控制台体验，关注端到端交付、运维可见性与内容组织。",
    leadLabel: "Public Product",
  },
  {
    id: "hardware-product",
    title: "硬件整机产品",
    framing: "偏完整设备交付，既包含电源、隔离、量测等硬件取舍，也包含用户可见控制面。",
    leadLabel: "Hardware Build",
  },
  {
    id: "device-control-foundation",
    title: "设备控制平面 / 设备软件基座",
    framing: "偏设备侧软件栈和控制平面，为固件、桌面或 Web 控制台提供稳定接口。",
    leadLabel: "Control Plane",
  },
  {
    id: "self-hosted-infra",
    title: "自托管基础设施 / 运维工具",
    framing: "偏自托管与运维基建，关注可持续维护、资源协调和最小运营面。",
    leadLabel: "Infra Utility",
  },
] as const;

function createLinks(
  repo: string,
  options: {
    docs?: string;
    demo?: string;
    site?: string;
  } = {}
): ProjectExternalLink[] {
  const links: ProjectExternalLink[] = [
    {
      kind: "github",
      label: "GitHub",
      href: `https://github.com/IvanLi-CN/${repo}`,
    },
  ];

  if (options.docs) {
    links.push({ kind: "docs", label: "Docs", href: options.docs });
  }
  if (options.demo) {
    links.push({ kind: "demo", label: "Demo", href: options.demo });
  }
  if (options.site) {
    links.push({ kind: "site", label: "Site", href: options.site });
  }

  return links;
}

export const projectCatalog: ProjectCatalog = [
  {
    slug: "codex-vibe-monitor",
    title: "codex-vibe-monitor",
    domain: "ai-agent-observability",
    summary:
      "面向 Codex / OpenAI 兼容流量的观测代理与调试入口，用来把 prompt、token、响应链路和故障上下文放到同一个工作台里看清楚。",
    description:
      "它不是单纯的流量转发器，而是把 AI 接入层做成一个可检查、可比较、可定位问题的运行面板。适合在多模型、多客户端、需要回放或追查行为差异的场景里使用。",
    poster: {
      eyebrow: "运行观测",
      strapline: "Prompt、token 与 traces 同屏可见",
      pattern: "signal",
    },
    links: createLinks("codex-vibe-monitor"),
    techTags: ["TypeScript", "Bun", "OpenAI-Compatible API", "Observability"],
    highlights: [
      "把模型请求、响应和运行态线索压到同一条调试路径里。",
      "适合做代理层试验场，也适合当团队共享的排障入口。",
      "重点不在模型本身，而在接入层的可见性和行为验证。",
    ],
    relatedEntries: [],
    order: 101,
  },
  {
    slug: "tavily-hikari",
    title: "tavily-hikari",
    domain: "ai-agent-observability",
    summary:
      "为 Tavily API 做的代理与审计控制台，把 key 池、额度、调用日志和团队入口统一到一个 Rust 服务里。",
    description:
      "项目把第三方搜索能力包装成更适合团队协作的内部基础设施。除了代理请求，还关心配额治理、审计记录和面向运营的控制面视图。",
    poster: {
      eyebrow: "搜索代理",
      strapline: "额度、审计与团队入口",
      pattern: "nodes",
    },
    links: createLinks("tavily-hikari", {
      docs: "https://ivanli-cn.github.io/tavily-hikari/",
      demo: "https://ivanli-cn.github.io/tavily-hikari/storybook.html",
    }),
    techTags: ["Rust", "Axum", "SQLite", "Web Console"],
    highlights: [
      "围绕 key 池、配额和调用审计建立可操作的服务边界。",
      "把“代理”抬升成一套带运营视角的团队工具。",
      "公开文档和 Storybook 都在线，可直接看交互面。",
    ],
    relatedEntries: [],
    order: 102,
  },
  {
    slug: "kaisoumail",
    title: "KaisouMail",
    domain: "cloud-web-platform",
    summary: "基于 Cloudflare 的临时邮箱控制台，把邮箱生成、投递查看和公开前台整理成一套轻量产品。",
    description:
      "这类工具最容易沦为脚本集合，但它被做成了完整的 Web 产品：既有面向访客的使用入口，也有可维护、可扩展的后台组织方式。",
    poster: {
      eyebrow: "临时邮箱",
      strapline: "收件、投递查看与公开前台",
      pattern: "rings",
    },
    links: createLinks("KaisouMail", {
      docs: "https://ivanli-cn.github.io/KaisouMail/",
      demo: "https://ivanli-cn.github.io/KaisouMail/storybook.html",
    }),
    techTags: ["Cloudflare", "TypeScript", "React", "Email Workflow"],
    highlights: [
      "把临时邮箱能力做成可公开使用的产品面，而不是脚本工具。",
      "控制台、前台说明和组件演示都拆得比较清楚。",
      "适合展示 Cloudflare 平台能力如何被收束成产品化交付。",
    ],
    relatedEntries: [],
    order: 201,
  },
  {
    slug: "octo-rill",
    title: "octo-rill",
    domain: "cloud-web-platform",
    summary: "围绕 GitHub 个人活动整理出的阅读与运营工作台，用来集中查看 release、通知和项目流动。",
    description:
      "它更像一块为开发者自己定制的云端仪表板，重点不是社交网络式展示，而是把分散的 GitHub 动态重新组织成可消费的操作界面。",
    poster: {
      eyebrow: "GitHub 工作台",
      strapline: "release、通知与项目流动",
      pattern: "grid",
    },
    links: createLinks("octo-rill", {
      docs: "https://ivanli-cn.github.io/octo-rill/",
      demo: "https://ivanli-cn.github.io/octo-rill/storybook.html",
    }),
    techTags: ["GitHub API", "React", "TypeScript", "Dashboard"],
    highlights: [
      "把 release、通知和仓库活动重排成更适合持续跟进的视图。",
      "偏运营工作台，而不是传统 profile 页面。",
      "有独立文档与组件演示入口。",
    ],
    relatedEntries: [],
    order: 202,
  },
  {
    slug: "paste-preset",
    title: "paste-preset",
    domain: "cloud-web-platform",
    summary:
      "一个偏生产力取向的浏览器内图片处理工具，用预设流程把常见裁切、压缩和导出动作收束到同一界面。",
    description:
      "它强调的是“重复操作的前端产品化”：把零散、临时、每次都要手调的图像处理流程，变成可保存、可重复使用的轻量工具链。",
    poster: {
      eyebrow: "图像预设",
      strapline: "裁切、压缩与导出流程",
      pattern: "beams",
    },
    links: createLinks("paste-preset", {
      site: "https://paste-preset.ivanli.cc/",
    }),
    techTags: ["PWA", "Image Processing", "TypeScript", "Web App"],
    highlights: [
      "把高频图像处理动作做成浏览器内可复用预设。",
      "更接近个人生产力产品，而不是单次 demo。",
      "入口就是在线站点，适合直接体验产品形态。",
    ],
    relatedEntries: [],
    order: 203,
  },
  {
    slug: "blog-26",
    title: "blog-26",
    domain: "cloud-web-platform",
    summary:
      "当前公开博客的开源镜像版本：Astro 前台、Admin SPA、Bun gateway 和内容快照导出都在同一仓里协作。",
    description:
      "这个站本身也是项目之一。重点不只是博客界面，而是公开前台、内容管线、后台编辑和部署边界如何被打磨成一套可公开维护的系统。",
    poster: {
      eyebrow: "公开博客系统",
      strapline: "前台、后台与内容管线",
      pattern: "stack",
    },
    links: createLinks("blog-26"),
    techTags: ["Astro", "Bun", "React", "SQLite"],
    highlights: [
      "把公开前台、内容导出和后台编辑统一到一个可发布仓库。",
      "既是内容站，也是长期维护的产品工程样本。",
      "项目页、内容索引和后台协作都在同一套公开系统里收束。",
    ],
    relatedEntries: [],
    order: 204,
  },
  {
    slug: "loadlynx",
    title: "loadlynx",
    domain: "hardware-product",
    summary: "便携式电子负载整机，围绕 STM32G431 与 ESP32-S3 做量测、控制与联网能力整合。",
    description:
      "它代表的是从电路、固件到控制面的整机思路：不仅关注负载本体的工作，还关心用户如何看见、调节和记录设备行为。",
    poster: {
      eyebrow: "电子负载",
      strapline: "量测、控制与联网整合",
      pattern: "signal",
    },
    links: createLinks("loadlynx", {
      site: "https://loadlynx.ivanli.cc/",
    }),
    techTags: ["STM32G431", "ESP32-S3", "Embedded", "Device Control"],
    highlights: [
      "电子负载不只停留在原理验证，而是往完整设备体验推进。",
      "同时包含量测、控制、联网与控制面的协同设计。",
      "有公开站点可作为产品入口。",
    ],
    relatedEntries: [
      { type: "post", slug: "learn-note-electronic-load" },
      { type: "post", slug: "dian4-zi3-fu4-zai4-kai1-fa1-bi3-ji4" },
      { type: "post", slug: "dian4-zi3-fu4-zai4-rev3-kai1-fa1-bi3-ji4" },
    ],
    order: 301,
  },
  {
    slug: "mains-aegis",
    title: "mains-aegis",
    domain: "hardware-product",
    summary:
      "一套面向 HomeLab 和设备供电场景的 UPS 产品尝试，把供电、检测、策略控制和用户入口合到同一体系内。",
    description:
      "项目关注的不只是 UPS 硬件选型，还包括系统级的供电策略与对外控制入口。它更像一台可被软件理解的供电设备，而不是传统黑盒。",
    poster: {
      eyebrow: "UPS 系统",
      strapline: "供电策略与控制入口",
      pattern: "beams",
    },
    links: createLinks("mains-aegis", {
      site: "https://mains-aegis.ivanli.cc/",
    }),
    techTags: ["ESP32-S3", "BQ40Z50", "TPS55288", "Power System"],
    highlights: [
      "从供电器件选型一路连到系统行为设计。",
      "更强调“可控的电源系统”而不是单纯电池盒。",
      "公开站点能直接看到产品入口定位。",
    ],
    relatedEntries: [
      { type: "post", slug: "ups-design-hardware" },
      { type: "memo", slug: "tps55288-she4-ji4-yao4-dian3" },
    ],
    order: 302,
  },
  {
    slug: "isolappurr-usb-hub",
    title: "IsolaPurr USB Hub",
    domain: "hardware-product",
    summary:
      "带隔离、独立供电和 PD 能力的 USB Hub 产品化尝试，把电子爱好者常见的“怕烧电脑”问题做成一台正经设备。",
    description:
      "它延续了 USB Hub 原型探索，但产品目标更明确：独立供电、隔离保护、控制能力和真实使用场景都被纳入统一交付。",
    poster: {
      eyebrow: "隔离 Hub",
      strapline: "独立供电、隔离与桌面控制",
      pattern: "ports",
    },
    links: createLinks("isolappurr-usb-hub", {
      site: "https://isolapurr.ivanli.cc/",
    }),
    techTags: ["USB Hub", "Isolation", "PD Power", "Embedded"],
    highlights: [
      "从隔离型 USB Hub 原型推进到更完整的产品表达。",
      "围绕供电安全、端口管理和实际桌面使用场景设计。",
      "已有独立产品站点，适合当成设备项目入口。",
    ],
    relatedEntries: [
      { type: "post", slug: "usb-hub-for-electronic-lovers" },
      { type: "post", slug: "usb-hub-for-electronic-lovers-rev-2" },
    ],
    order: 303,
  },
  {
    slug: "tuckmark",
    title: "tuckmark",
    domain: "device-control-foundation",
    summary:
      "面向标签打印和代理流程的控制平面，把打印任务、设备入口与自动化工作流捏成一个轻量操作台。",
    description:
      "它的价值不在标签打印本身，而在于把一个很容易散落到脚本、驱动和桌面小工具里的场景，重新包装成 agent-native 的控制工作面。",
    poster: {
      eyebrow: "标签控制",
      strapline: "打印任务、设备入口与代理流程",
      pattern: "grid",
    },
    links: createLinks("tuckmark", {
      site: "http://tuckmark.ivanli.cc/",
    }),
    techTags: ["Control Plane", "Workflow Tooling", "TypeScript", "Device Ops"],
    highlights: [
      "把打印这类零碎动作收束成可自动化的控制平面。",
      "更适合被代理和工作流调用，而不是只做人点按钮。",
      "公开入口已在线，方便直接理解产品方向。",
    ],
    relatedEntries: [],
    order: 401,
  },
  {
    slug: "flux-purr",
    title: "flux-purr",
    domain: "device-control-foundation",
    summary:
      "设备侧 monorepo 基座，把固件、React 控制台和本地 devd 接口摆在同一开发体系内，降低设备产品的多端割裂感。",
    description:
      "它更像一块设备软件基座：不是单一产品，而是为后续设备项目提供统一的控制约定、开发形态和本地联调路径。",
    poster: {
      eyebrow: "设备基座",
      strapline: "固件、控制台与本地 devd",
      pattern: "stack",
    },
    links: createLinks("flux-purr"),
    techTags: ["Monorepo", "Firmware", "React", "Local Devd"],
    highlights: [
      "把固件、控制台和本地服务端接口统一进一套仓库结构。",
      "适合作为设备类项目反复复用的软件底座。",
      "重点是开发与控制面一致性，不是单次硬件原型。",
    ],
    relatedEntries: [],
    order: 402,
  },
  {
    slug: "iso-usb-hub",
    title: "iso-usb-hub",
    domain: "device-control-foundation",
    summary:
      "围绕四口 USB Hub 控制面展开的设备软件项目，负责端口、电源与设备侧能力的可见化与可控化。",
    description:
      "相比完整整机产品，它更偏设备控制平面本身：关注如何把 USB Hub 的硬件能力组织成对用户和工具都友好的操作界面。",
    poster: {
      eyebrow: "Hub 控制面",
      strapline: "端口、电源与状态可见",
      pattern: "ports",
    },
    links: createLinks("iso-usb-hub"),
    techTags: ["USB Hub", "Control Surface", "Embedded UI", "Device Management"],
    highlights: [
      "把端口、电源、状态这些底层能力抬升为明确的控制面语义。",
      "适合作为 IsolaPurr 一类整机项目的软件前身或分层基座。",
      "说明你在设备项目里不是只做硬件，也持续经营控制入口。",
    ],
    relatedEntries: [
      { type: "post", slug: "build-a-2a2c-usb-hub-with-independent-power-supply-using-ch335f" },
    ],
    order: 403,
  },
  {
    slug: "xp",
    title: "xp",
    domain: "self-hosted-infra",
    summary:
      "一套偏自托管运维的 Xray 集群管理工具，用来整理多主机、多节点下的部署、配置与维护动作。",
    description:
      "它体现的是运维工具的产品化思路：不是只有配置文件，而是把跨主机资源和节点状态收束到一个更可持续维护的界面或流程里。",
    poster: {
      eyebrow: "Xray 运维",
      strapline: "多节点、多主机配置维护",
      pattern: "nodes",
    },
    links: createLinks("xp"),
    techTags: ["Xray", "Self-Hosting", "Ops", "Cluster Management"],
    highlights: [
      "聚焦多节点、多主机的运维复杂度，而不是单机脚本。",
      "强调长期维护和一致配置，而不是一次性部署。",
      "适合放在项目集里代表你的基础设施面工作。",
    ],
    relatedEntries: [{ type: "post", slug: "cloudflare-tunnel-for-intranet-penetration" }],
    order: 501,
  },
  {
    slug: "dockrev",
    title: "dockrev",
    domain: "self-hosted-infra",
    summary: "一个面向 Docker / Compose 自托管环境的更新与运维助手，帮助梳理版本、容器和维护动作。",
    description:
      "它关注的是“小而长期”的运维负担：部署了很多服务以后，如何用更低认知成本看清哪些东西该更新、该重启、该回滚。",
    poster: {
      eyebrow: "Compose 运维",
      strapline: "版本、更新与维护动作",
      pattern: "stack",
    },
    links: createLinks("dockrev", {
      docs: "https://ivanli-cn.github.io/dockrev/",
    }),
    techTags: ["Docker", "Compose", "Operations", "Self-Hosted"],
    highlights: [
      "面向自托管环境的日常维护，而不是重型容器平台。",
      "把版本和运维动作整理成更轻的使用面。",
      "有公开文档入口，适合直接了解工具边界。",
    ],
    relatedEntries: [{ type: "post", slug: "upgrade-all-in-one-pve-8-to-9-and-pbs-3-to-4" }],
    order: 502,
  },
] as const;

export const projectCatalogBySlug = new Map(
  projectCatalog.map((project) => [project.slug, project])
);

export function getProjectBySlug(slug: string) {
  return projectCatalogBySlug.get(slug);
}

export function getProjectDetailPath(slug: string) {
  return `/projects/${slug}`;
}

export function getProjectCanonicalUrl(slug: string) {
  return getCanonicalUrl(getProjectDetailPath(slug));
}

export function getProjectDomainDefinition(domain: ProjectDomain) {
  return projectDomains.find((item) => item.id === domain) ?? projectDomains[0];
}

export function getProjectsByDomain(domain: ProjectDomain) {
  return projectCatalog
    .filter((project) => project.domain === domain)
    .sort((left, right) => left.order - right.order);
}

export function getGroupedProjectCatalog() {
  return projectDomains.map((domain) => ({
    ...domain,
    projects: getProjectsByDomain(domain.id),
  }));
}

export function getFeaturedProjects() {
  return projectDomains
    .map((domain) => getProjectsByDomain(domain.id)[0])
    .filter((project): project is ProjectCatalogItem => Boolean(project));
}

function isPostRecord(entry: PublicPostRecord | PublicMemoRecord): entry is PublicPostRecord {
  return "publishDate" in entry;
}

export function resolveProjectRelatedEntries(
  snapshot: PublicSnapshot,
  entries: readonly ProjectRelatedEntry[]
): ResolvedProjectRelatedEntry[] {
  return entries
    .map((entry) => {
      if (entry.type === "post") {
        const post = snapshot.posts.find((item) => item.slug === entry.slug);
        if (!post) return null;
        return {
          ...entry,
          href: `/posts/${post.slug}`,
          title: entry.label ?? post.title,
          excerpt: post.excerpt,
        } satisfies ResolvedProjectRelatedEntry;
      }

      const memo = snapshot.memos.find((item) => item.slug === entry.slug);
      if (!memo) return null;
      return {
        ...entry,
        href: `/memos/${memo.slug}`,
        title: entry.label ?? memo.title,
        excerpt: memo.excerpt,
      } satisfies ResolvedProjectRelatedEntry;
    })
    .filter((entry): entry is ResolvedProjectRelatedEntry => Boolean(entry))
    .sort((left, right) => {
      const leftRecord =
        left.type === "post"
          ? snapshot.posts.find((item) => item.slug === left.slug)
          : snapshot.memos.find((item) => item.slug === left.slug);
      const rightRecord =
        right.type === "post"
          ? snapshot.posts.find((item) => item.slug === right.slug)
          : snapshot.memos.find((item) => item.slug === right.slug);

      if (!leftRecord || !rightRecord) return 0;

      const leftDate = isPostRecord(leftRecord)
        ? (leftRecord.updateDate ?? leftRecord.publishDate)
        : (leftRecord.updatedAt ?? leftRecord.publishedAt ?? leftRecord.createdAt);
      const rightDate = isPostRecord(rightRecord)
        ? (rightRecord.updateDate ?? rightRecord.publishDate)
        : (rightRecord.updatedAt ?? rightRecord.publishedAt ?? rightRecord.createdAt);

      return rightDate.localeCompare(leftDate);
    });
}
