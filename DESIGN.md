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
      background: "hsl(222 47% 11%)"
      foreground: "hsl(210 40% 96%)"
      card: "hsl(222 40% 14%)"
      primary: "hsl(217 91% 60%)"
      secondary: "hsl(262 83% 68%)"
      muted: "hsl(217 33% 17%)"
      border: "hsl(216 34% 24%)"
      destructive: "hsl(0 84% 60%)"
    light:
      background: "hsl(210 33% 98%)"
      foreground: "hsl(222 47% 11%)"
      card: "hsl(0 0% 100%)"
      primary: "hsl(221 83% 53%)"
      secondary: "hsl(221 70% 97%)"
      muted: "hsl(210 40% 96%)"
      border: "hsl(214 32% 91%)"
      destructive: "hsl(0 72% 51%)"
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
    pill: "999px"
  admin:
    base: "1rem"
    small: "calc(var(--radius) - 6px)"
    medium: "calc(var(--radius) - 2px)"
    large: "var(--radius)"
    xlarge: "calc(var(--radius) + 4px)"
spacing:
  public:
    contentWidth: "min(1280px, calc(100vw - 3rem))"
    readingWidth: "min(920px, calc(100vw - 3rem))"
    timelineGap: "clamp(1.5rem, 2.8vw, 2.4rem)"
  admin:
    shellMaxWidth: "1760px"
    sidebarWidth: "280px"
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

后台采用安静、密集、任务优先的管理控制台。它不复用公共站的自然装饰，而使用更直接的导航、卡片、表格、徽章、状态提示和编辑器 surface。后台的美感来自清楚的信息分组、可辨状态和稳定操作反馈。

# Colors

公共站主色来自自然绿、浅雾底色和蓝绿辅助色。浅色主题以低饱和绿灰背景承载内容，深色主题以近黑绿背景承载柔和高亮。强调色用于主要操作、标签、时间线节点和可继续探索的路径；危险、警告、成功色只用于真实状态。

后台主色来自深蓝灰和明确的蓝色 primary。默认深色模式更适合长时间管理；浅色模式保留同一语义结构。后台的 success、warning、danger 必须绑定状态含义，不作为装饰色使用。

不要把公共站与后台合并成同一套颜色气质。公共站可以更有空气感，后台必须更像工具。跨表面的共同点是对比清楚、状态稳定、语义一致。

# Typography

公共站使用中文无衬线作为正文，中文衬线作为标题和内容气质的承载。标题可以有更强的文学感，但正文必须保持长时间阅读的清晰度。文章详情、Memos、标签列表和搜索结果都应优先保证可扫读。

后台使用 Inter 系统栈，保持紧凑、直接、可重复操作。后台标题用于定位页面，正文用于解释状态，表格和徽章用于快速比较。不要在后台使用过度抒情的文案风格。

代码、日志、路径、令牌和模型名称应使用等宽或明确的技术展示方式，并与普通说明文字区分。

# Elevation

层级哲学是混合氛围。公共站允许半透明 surface、柔和阴影、轻微 hover lift 和背景氛围层，但这些效果必须让内容更容易分组，而不是制造视觉噪声。时间线、卡片和按钮可以有轻微浮起，但命中区域必须稳定。

后台以边框、色块、间距和信息密度建立层级，阴影只用于卡片、弹层或编辑器等需要从背景中抬起的区域。后台页面不应依赖强阴影来解释结构。

动效必须克制。公共站可以有低频 ambient motion；后台只在加载、保存、测试、同步和状态变更时使用必要反馈。减少动态偏好开启时，结构和反馈不能消失。

# Components

公共站核心组件包括 app shell、ambient scene、site header、site footer、surface、panel、timeline、post card、memo card、related post card、tag badge、button、chip、input shell、alert 和 empty state。公共站组件应保持有机半径、柔和分层和清晰的继续阅读入口。

后台核心组件包括 app shell、sidebar navigation、page header、card、button、badge、alert、table、input、select、textarea、empty state、spinner 和 editor surface。后台组件应优先服务列表管理、内容编辑、同步进度、模型配置、计划任务、评论审核和访问令牌管理。

组件使用原则是避免卡片套卡片。复杂页面应先用页面结构和区域标题分组，再用 card 或 panel 承载可重复或可操作的信息块。

# Do's and Don'ts

Do: 让内容和状态先被看懂。用清楚标题、可辨状态、稳定布局和明确操作反馈组织页面。

Do: 公共站保持数字温室方向。使用柔和自然色、半透明 surface、时间线节奏和轻量动效，但不要遮挡内容。

Do: 后台保持安静控制台方向。优先可扫读表格、明确筛选、状态徽章、错误说明和恢复操作。

Do: 保持 light、dark、system 主题一致性，并确认减少动态偏好下仍可理解页面结构。

Don't: 把个人博客做成通用 SaaS 营销页、社交信息流或默认 AI 产品视觉。

Don't: 在后台使用公共站的装饰性氛围来填充页面；后台的视觉重点是任务、状态和结果。

Don't: 用颜色作为唯一状态表达；状态必须有文本、图标、位置或结构上的辅助。

Don't: 新增卡片套卡片、过强阴影、过度渐变、不可解释动效或只为装饰存在的图形层。
