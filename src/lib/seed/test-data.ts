/**
 * 测试数据生成器
 * 生成用于开发和测试环境的示例内容
 */

import type { SeedData } from './types';
import { TEST_DATA_PREFIX, TEST_DATA_TAG } from './types';

// 生成唯一 ID
function generateId(prefix: string = TEST_DATA_PREFIX): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// 生成时间戳（过去30天内的随机时间）
function generateTimestamp(): number {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  return Math.floor(Math.random() * (now - thirtyDaysAgo)) + thirtyDaysAgo;
}

// 生成测试文章数据
function generateTestPosts() {
  const posts = [
    {
      id: `${TEST_DATA_PREFIX}post_welcome`,
      slug: 'test-welcome-to-blog',
      type: 'post' as const,
      title: '欢迎来到我的博客（测试文章）',
      excerpt: '这是一篇测试文章，用于展示博客的基本功能。',
      body: `# 欢迎来到我的博客

这是一篇测试文章，用于展示博客系统的各种功能。

## 功能特性

- ✅ Markdown 支持
- ✅ 代码高亮
- ✅ 评论系统
- ✅ 标签分类
- ✅ 搜索功能

## 代码示例

\`\`\`typescript
function hello(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(hello('World'));
\`\`\`

## 总结

这个博客系统提供了现代化的写作和阅读体验。

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      draft: false,
      public: true,
      category: '技术',
      tags: JSON.stringify(['测试', '博客', '欢迎']),
      author: 'Test Author',
      image: '/images/test-welcome.jpg',
      metadata: JSON.stringify({ featured: true }),
      contentHash: 'test_hash_welcome',
      etag: 'test_etag_welcome',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
    {
      id: `${TEST_DATA_PREFIX}post_tech`,
      slug: 'test-modern-web-development',
      type: 'post' as const,
      title: '现代 Web 开发技术栈（测试文章）',
      excerpt: '探讨现代 Web 开发中的技术选择和最佳实践。',
      body: `# 现代 Web 开发技术栈

在当今快速发展的技术环境中，选择合适的技术栈对项目成功至关重要。

## 前端技术

### 框架选择
- **React**: 组件化开发，生态丰富
- **Vue**: 渐进式框架，学习曲线平缓
- **Astro**: 静态站点生成，性能优异

### 样式方案
- **Tailwind CSS**: 原子化 CSS，开发效率高
- **CSS Modules**: 模块化样式，避免冲突

## 后端技术

### 运行时
- **Bun**: 高性能 JavaScript 运行时
- **Node.js**: 成熟稳定的选择

### 数据库
- **SQLite**: 轻量级，适合中小型项目
- **PostgreSQL**: 功能强大，适合大型应用

## 开发工具

- **TypeScript**: 类型安全
- **Biome**: 代码格式化和检查
- **Drizzle ORM**: 类型安全的数据库操作

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      draft: false,
      public: true,
      category: '技术',
      tags: JSON.stringify(['Web开发', '技术栈', '前端', '后端']),
      author: 'Test Author',
      image: '/images/test-tech.jpg',
      metadata: JSON.stringify({ readingTime: 5 }),
      contentHash: 'test_hash_tech',
      etag: 'test_etag_tech',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
    {
      id: `${TEST_DATA_PREFIX}post_ai`,
      slug: 'test-ai-and-future',
      type: 'post' as const,
      title: 'AI 技术的现状与未来（测试文章）',
      excerpt: '探讨人工智能技术的发展现状和未来趋势。',
      body: `# AI 技术的现状与未来

人工智能正在快速发展，改变着我们的生活和工作方式。

## 当前 AI 技术现状

### 大语言模型
- **GPT 系列**: 文本生成和理解
- **Claude**: 安全可靠的 AI 助手
- **Gemini**: Google 的多模态模型

### 应用领域
- 🤖 **聊天机器人**: 客服、教育、娱乐
- 🎨 **内容创作**: 文章、图片、视频
- 💼 **办公自动化**: 文档处理、数据分析
- 🔍 **搜索优化**: 语义搜索、推荐系统

## 技术挑战

### 当前限制
- **幻觉问题**: 生成不准确信息
- **计算成本**: 训练和推理开销大
- **数据隐私**: 用户数据保护
- **伦理考量**: 公平性和偏见

### 解决方案
- **RAG 技术**: 检索增强生成
- **模型优化**: 量化和剪枝
- **联邦学习**: 保护隐私的训练
- **AI 治理**: 建立规范和标准

## 未来展望

AI 技术将继续发展，但需要平衡创新与责任。

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      draft: false,
      public: true,
      category: '技术',
      tags: JSON.stringify(['AI', '人工智能', '技术趋势', '未来']),
      author: 'Test Author',
      image: '/images/test-ai.jpg',
      metadata: JSON.stringify({ featured: true, readingTime: 8 }),
      contentHash: 'test_hash_ai',
      etag: 'test_etag_ai',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
    {
      id: `${TEST_DATA_PREFIX}post_draft`,
      slug: 'test-draft-article',
      type: 'post' as const,
      title: '草稿文章示例（测试草稿）',
      excerpt: '这是一篇草稿文章，用于测试草稿功能。',
      body: `# 草稿文章示例

这是一篇草稿文章，还在编写中...

## 待完成内容

- [ ] 添加更多章节
- [ ] 完善代码示例
- [ ] 添加图片和图表
- [ ] 校对和润色

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      draft: true, // 草稿状态
      public: false,
      category: '其他',
      tags: JSON.stringify(['草稿', '测试']),
      author: 'Test Author',
      image: null,
      metadata: JSON.stringify({ status: 'draft' }),
      contentHash: 'test_hash_draft',
      etag: 'test_etag_draft',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
  ];

  return posts;
}

// 生成测试项目数据
function generateTestProjects() {
  const projects = [
    {
      id: `${TEST_DATA_PREFIX}project_blog`,
      slug: 'test-personal-blog-system',
      type: 'project' as const,
      title: '个人博客系统（测试项目）',
      excerpt: '基于 Astro 和 TypeScript 构建的现代化个人博客系统。',
      body: `# 个人博客系统

这是一个基于现代技术栈构建的个人博客系统。

## 技术特性

- **框架**: Astro 5.0 + React
- **语言**: TypeScript
- **样式**: Tailwind CSS + daisyUI
- **数据库**: SQLite + Drizzle ORM
- **部署**: Docker + Bun

## 主要功能

### 内容管理
- 📝 Markdown 文章编写
- 🏷️ 标签和分类系统
- 📁 项目展示页面
- 💭 闪念记录功能

### 交互功能
- 💬 评论系统
- 👍 反应表情
- 🔍 全文搜索
- 📧 邮件通知

### 管理功能
- 🔐 管理员认证
- 📊 内容统计
- 🤖 AI 向量化搜索

## 部署说明

\`\`\`bash
# 克隆项目
git clone <repository-url>

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env

# 运行迁移
bun run migrate

# 启动开发服务器
bun run dev
\`\`\`

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      draft: false,
      public: true,
      category: '项目',
      tags: JSON.stringify(['博客', 'Astro', 'TypeScript', '开源']),
      author: 'Test Author',
      image: '/images/test-blog-project.jpg',
      metadata: JSON.stringify({
        github: 'https://github.com/test/blog',
        demo: 'https://test-blog.example.com',
        status: 'active',
      }),
      contentHash: 'test_hash_blog_project',
      etag: 'test_etag_blog_project',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
    {
      id: `${TEST_DATA_PREFIX}project_tools`,
      slug: 'test-developer-tools',
      type: 'project' as const,
      title: '开发者工具集（测试项目）',
      excerpt: '一套提高开发效率的实用工具集合。',
      body: `# 开发者工具集

这是一个包含多种实用工具的开发者工具集项目。

## 工具列表

### 代码工具
- **格式化器**: 支持多种语言的代码格式化
- **压缩器**: JavaScript/CSS 代码压缩
- **转换器**: TypeScript 到 JavaScript 转换
- **检查器**: 代码质量和安全检查

### 文本工具
- **Markdown 编辑器**: 实时预览的 Markdown 编辑器
- **JSON 格式化**: JSON 数据格式化和验证
- **Base64 编解码**: 文本和文件的 Base64 处理
- **URL 编解码**: URL 编码和解码工具

### 图片工具
- **图片压缩**: 无损和有损压缩
- **格式转换**: 支持多种图片格式转换
- **尺寸调整**: 批量调整图片尺寸
- **水印添加**: 批量添加文字或图片水印

## 技术实现

\`\`\`typescript
// 示例：代码格式化工具
import { format } from 'prettier';

export async function formatCode(code: string, language: string): Promise<string> {
  const parser = getParserForLanguage(language);
  return format(code, { parser });
}
\`\`\`

## 使用方法

1. 选择需要的工具
2. 输入或上传文件
3. 配置参数
4. 获取处理结果

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      draft: false,
      public: true,
      category: '工具',
      tags: JSON.stringify(['工具', '开发', '效率', '实用']),
      author: 'Test Author',
      image: '/images/test-tools.jpg',
      metadata: JSON.stringify({
        github: 'https://github.com/test/dev-tools',
        demo: 'https://tools.example.com',
        status: 'active',
        tools: ['formatter', 'compressor', 'converter'],
      }),
      contentHash: 'test_hash_tools',
      etag: 'test_etag_tools',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
  ];

  return projects;
}

// 生成测试 Memos 数据
function generateTestMemos() {
  const memos = [
    {
      id: `${TEST_DATA_PREFIX}memo_idea`,
      slug: 'test-blog-feature-ideas',
      title: '博客功能想法',
      body: `# 博客功能想法

今天想到几个可以改进博客的功能：

1. **深色模式切换** - 提供更好的夜间阅读体验
2. **阅读进度条** - 显示文章阅读进度
3. **相关文章推荐** - 基于标签和内容的智能推荐
4. **RSS 订阅** - 方便读者订阅更新

这些功能都可以逐步实现，优先级按用户需求来定。

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      public: true,
      tags: JSON.stringify(['想法', '功能', '博客']),
      attachments: JSON.stringify([]),
      contentHash: 'test_hash_memo_idea',
      etag: 'test_etag_memo_idea',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
    {
      id: `${TEST_DATA_PREFIX}memo_learning`,
      slug: 'test-typescript-learning-notes',
      title: 'TypeScript 学习笔记',
      body: `学习了 TypeScript 的高级类型特性：

- **条件类型**: \`T extends U ? X : Y\`
- **映射类型**: \`{ [K in keyof T]: T[K] }\`
- **模板字面量类型**: \`\`Hello \${string}\`\`

这些特性让类型系统更加强大和灵活。

#学习 #TypeScript

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      public: true,
      tags: JSON.stringify(['学习', 'TypeScript', '笔记']),
      attachments: JSON.stringify([]),
      contentHash: 'test_hash_memo_learning',
      etag: 'test_etag_memo_learning',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
    {
      id: `${TEST_DATA_PREFIX}memo_coffee`,
      slug: 'test-coffee-thoughts',
      title: '咖啡时光',
      body: `今天尝试了一家新的咖啡店 ☕

手冲咖啡的香气真的很棒，店主说这是来自埃塞俄比亚的豆子。

工作之余，这样的小憩时光很珍贵。

#生活 #咖啡

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      public: true,
      tags: JSON.stringify(['生活', '咖啡', '休闲']),
      attachments: JSON.stringify([]),
      contentHash: 'test_hash_memo_coffee',
      etag: 'test_etag_memo_coffee',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
    {
      id: `${TEST_DATA_PREFIX}memo_book`,
      slug: 'test-reading-notes',
      title: '读书笔记',
      body: `刚读完《代码整洁之道》📚

几个重要观点：
- 代码是写给人看的，不是写给机器看的
- 函数应该短小，只做一件事
- 好的命名胜过注释

准备在下个项目中实践这些原则。

#读书 #编程 #学习

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      public: true,
      tags: JSON.stringify(['读书', '编程', '学习', '笔记']),
      attachments: JSON.stringify([]),
      contentHash: 'test_hash_memo_book',
      etag: 'test_etag_memo_book',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
    {
      id: `${TEST_DATA_PREFIX}memo_private`,
      slug: 'test-private-memo',
      title: '私人想法',
      body: `这是一条私人闪念，只有管理员可以看到。

用于测试私人/公开状态的切换功能。

#私人 #测试

${TEST_DATA_TAG}`,
      publishDate: generateTimestamp(),
      updateDate: generateTimestamp(),
      public: false, // 私人状态
      tags: JSON.stringify(['私人', '测试']),
      attachments: JSON.stringify([]),
      contentHash: 'test_hash_memo_private',
      etag: 'test_etag_memo_private',
      lastModified: generateTimestamp(),
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    },
  ];

  return memos;
}

// 生成测试用户数据
function generateTestUsers() {
  return [
    {
      id: generateId(),
      email: 'test.user@example.com',
      name: 'Test User',
      createdAt: generateTimestamp(),
    },
    {
      id: generateId(),
      email: 'demo.reader@example.com',
      name: 'Demo Reader',
      createdAt: generateTimestamp(),
    },
  ];
}

// 生成测试评论数据
function generateTestComments() {
  const users = generateTestUsers();

  return [
    {
      id: generateId(),
      content: '这篇文章写得很好，对新手很有帮助！',
      postSlug: 'test-welcome-to-blog',
      authorName: users[0].name!,
      authorEmail: users[0].email,
      parentId: undefined,
      status: 'approved' as const,
      createdAt: generateTimestamp(),
    },
    {
      id: generateId(),
      content: '同意楼上的观点，期待更多这样的内容。',
      postSlug: 'test-welcome-to-blog',
      authorName: users[1].name!,
      authorEmail: users[1].email,
      parentId: undefined,
      status: 'approved' as const,
      createdAt: generateTimestamp(),
    },
    {
      id: generateId(),
      content: '技术栈选择确实很重要，感谢分享！',
      postSlug: 'test-modern-web-development',
      authorName: users[0].name!,
      authorEmail: users[0].email,
      parentId: undefined,
      status: 'approved' as const,
      createdAt: generateTimestamp(),
    },
  ];
}

// 生成完整的测试数据
export function generateTestData(): SeedData {
  const posts = [...generateTestPosts(), ...generateTestProjects()];
  const memos = generateTestMemos();
  const users = generateTestUsers();
  const comments = generateTestComments();

  return {
    posts,
    memos,
    users,
    comments,
  };
}
