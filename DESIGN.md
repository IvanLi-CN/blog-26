---
colors:
  public:
    background: "#edf4ef"
    backgroundDeep: "#d6e4db"
    surface: "rgba(252, 253, 251, 0.78)"
    surfaceStrong: "rgba(255, 255, 255, 0.88)"
    text: "#24352d"
    textSoft: "rgba(36, 53, 45, 0.68)"
    accent: "#7ca98b"
    accentStrong: "#4e7e60"
    secondary: "#84a7b5"
    success: "#3f8f68"
    warning: "#b17d45"
    danger: "#b35c62"
    dark:
      background: "#0f1613"
      backgroundDeep: "#17221d"
      surface: "rgba(20, 30, 25, 0.74)"
      surfaceStrong: "rgba(24, 36, 29, 0.88)"
      text: "#e9f1eb"
      textSoft: "rgba(233, 241, 235, 0.72)"
      accent: "#88c1a0"
      accentStrong: "#b3f2cd"
      secondary: "#83b3c6"
      success: "#78d4a2"
      warning: "#e8bc75"
      danger: "#f1939a"
  admin:
    dark:
      background: "oklch(25% 0.026 252)"
      foreground: "oklch(94% 0.014 252)"
      card: "oklch(31% 0.024 252)"
      primary: "oklch(72% 0.11 224)"
      secondary: "oklch(76% 0.09 154)"
      muted: "oklch(36% 0.022 252)"
      border: "oklch(43% 0.025 252)"
      destructive: "oklch(70% 0.13 28)"
    light:
      background: "oklch(97% 0.014 88)"
      foreground: "oklch(29% 0.026 252)"
      card: "oklch(99% 0.008 88)"
      primary: "oklch(64% 0.12 224)"
      secondary: "oklch(70% 0.09 154)"
      muted: "oklch(94% 0.018 88)"
      border: "oklch(88% 0.018 88)"
      destructive: "oklch(59% 0.16 28)"
typography:
  public:
    body: "Noto Sans SC"
    display: "Noto Serif SC"
    fallback: "PingFang SC, Hiragino Sans GB, sans-serif"
  admin:
    body: "InterVariable, Inter, system-ui, sans-serif"
  rhythm:
    readingLineHeight: "1.75"
    adminTextScale: "compact utility scale"
rounded:
  public:
    large: "32px 38px 28px 36px / 30px 34px 40px 28px"
    medium: "24px 28px 22px 30px / 24px 24px 32px 24px"
    small: "18px 20px 16px 22px / 18px 18px 22px 18px"
    mobileLarge: "16px"
    mobileMedium: "14px"
    mobileSmall: "12px"
    pill: "999px"
  admin:
    base: "1.25rem"
    small: "0.9rem"
    medium: "1.1rem"
    large: "1.35rem"
    xlarge: "1.75rem"
spacing:
  public:
    contentWidth: "min(1280px, calc(100% - 3rem))"
    readingWidth: "min(920px, calc(100% - 3rem))"
    mobileContentWidth: "calc(100% - 1.5rem)"
    mobilePanelPadding: "16px"
    timelineGap: "clamp(1.5rem, 2.8vw, 2.4rem)"
  admin:
    shellMaxWidth: "1440px"
    sidebarWidth: "272px"
    pagePadding: "1rem to 2rem"
components:
  public:
    - app shell
    - ambient scene
    - site header
    - site footer
    - surface
    - panel
    - timeline
    - timeline node
    - post card
    - memo card
    - related post card
    - tag badge
    - button
    - chip
    - input shell
    - alert
    - empty state
  admin:
    - app shell
    - sidebar navigation
    - page header
    - card
    - button
    - badge
    - alert
    - table
    - input
    - select
    - textarea
    - empty state
    - spinner
    - editor surface
---

# Overview

创意北极星是“数字温室”：公开站像一个安静、柔和、可漫游的个人内容空间，后台像内容养护台，帮助作者整理、同步、审核、配置和恢复系统状态。默认 register 是 product，因此设计必须先服务任务完成，再表达个人气质。

公共站采用 Nature Interface。它固定为当前公共站的长期方向：自然色、柔和半透明 surface、有机圆角、时间线节奏、轻量 ambient layer，以及 light、dark、system 三态主题。文章、Memos、标签、搜索和项目都应保持读者能继续探索的路径。

后台采用 Soft UI 内容养护台。它不参考旧后台的样式、排版或布局，而以柔和 surface、大圆角、低饱和色、清楚状态、稳定操作反馈和宽屏工作区承载写作、审核、同步、计划任务和 AI 配置。

# Colors

公共站主色来自自然绿、浅雾底色和蓝绿辅助色。浅色主题以低饱和绿灰背景承载内容，深色主题以近黑绿背景承载柔和高亮。强调色用于主要操作、标签、时间线节点和可继续探索的路径；危险、警告、成功色只用于真实状态。

后台主色来自暖白浅色主题与柔和蓝灰暗色主题。light 与 dark 都是一等公民：浅色主题用于日常整理和写作，暗色主题用于长时间配置和运行状态观察。primary 用于主要动作、当前选择和焦点；secondary 用于辅助路径；success、warning、danger 必须绑定真实状态，不作为装饰色使用。

不要把公共站与后台合并成同一套颜色气质。公共站可以更有空气感，后台必须更像工具。跨表面的共同点是对比清楚、状态稳定、语义一致。

# Typography

公共站使用中文无衬线作为正文，中文衬线作为标题和内容气质的承载。标题可以有更强的文学感，但正文必须保持长时间阅读的清晰度。文章详情、Memos、标签列表和搜索结果都应优先保证可扫读。

后台使用 Inter 系统栈，保持清楚、直接、可重复操作。Soft UI 允许更柔和的体量和留白，但标题、表格、徽章、路径、日志和设置项仍以快速定位和比较为第一目标。

代码、日志、路径、令牌和模型名称应使用等宽或明确的技术展示方式，并与普通说明文字区分。

# Elevation

层级哲学是混合氛围。公共站允许半透明 surface、柔和阴影、轻微 hover lift 和背景氛围层，但这些效果必须让内容更容易分组，而不是制造视觉噪声。时间线、卡片和按钮可以有轻微浮起，但命中区域必须稳定。

后台以柔和 surface、浅阴影、清楚间距和状态层级建立结构。阴影必须柔和、低噪声，用于可操作区域、弹层和编辑器 surface；禁止硬黑边框、粗边框、硬投影和只为装饰存在的强位移动效。

动效必须克制。公共站可以有低频 ambient motion；后台只在加载、保存、测试、同步和状态变更时使用必要反馈。减少动态偏好开启时，结构和反馈不能消失。

# Components

公共站核心组件包括 app shell、ambient scene、site header、site footer、surface、panel、timeline、post card、memo card、related post card、tag badge、button、chip、input shell、alert 和 empty state。公共站组件应保持有机半径、柔和分层和清晰的继续阅读入口。

后台核心组件包括 app shell、mobile navigation drawer、sidebar navigation、page header、card、button、badge、alert、table、input、select、checkbox、radio、tabs、dialog、dropdown menu、popover、tooltip、empty state、skeleton、spinner 和 editor surface。交互基础件应通过本地 Radix-backed components 暴露，页面不直接依赖 primitive 细节。

组件使用原则是避免卡片套卡片。复杂页面应先用页面结构和区域标题分组，再用 card 或 panel 承载可重复或可操作的信息块。

# Do's and Don'ts

Do: 让内容和状态先被看懂。用清楚标题、可辨状态、稳定布局和明确操作反馈组织页面。

Do: 公共站保持数字温室方向。使用柔和自然色、半透明 surface、时间线节奏和轻量动效，但不要遮挡内容。

Do: 后台保持安静控制台方向。优先可扫读表格、明确筛选、状态徽章、错误说明和恢复操作。

Do: 保持 light、dark、system 主题一致性，并确认减少动态偏好下仍可理解页面结构。

Don't: 把个人博客做成通用 SaaS 营销页、社交信息流或默认 AI 产品视觉。

Don't: 参考旧后台的样式、排版或布局；后台的新视觉重点是 Soft UI 触感、任务、状态和结果。

Don't: 用颜色作为唯一状态表达；状态必须有文本、图标、位置或结构上的辅助。

Don't: 新增卡片套卡片、过强阴影、过度渐变、不可解释动效或只为装饰存在的图形层。
