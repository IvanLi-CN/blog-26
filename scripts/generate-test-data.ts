#!/usr/bin/env bun

/**
 * 生成测试数据脚本
 * 创建用于开发和测试的示例内容
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";

// 下载图片到本地（带重试机制）
async function downloadImage(url: string, filePath: string, maxRetries: number = 3): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TestDataGenerator/1.0)",
        },
        // 忽略证书验证错误（仅用于测试数据生成）
        tls: {
          rejectUnauthorized: false,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      writeFileSync(filePath, buffer);

      console.log(`✅ ${filePath.split("/").pop()}`);
      return; // 成功下载，退出重试循环
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        console.log(
          `⚠️  ${filePath.split("/").pop()} 下载失败 (尝试 ${attempt}/${maxRetries}), 1秒后重试...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // 所有重试都失败了
  throw new Error(`下载失败 ${url} (${maxRetries} 次尝试): ${lastError?.message}`);
}

// 测试数据配置
function getDataDirectories(environment: "dev" | "test" = "test") {
  const baseDir = environment === "dev" ? "dev-data" : "test-data";
  return {
    WEBDAV_DIR: join(baseDir, "webdav"),
    LOCAL_DIR: join(baseDir, "local"),
  };
}

// 生成随机日期（过去30天内）
function generateRandomDate(): Date {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const randomTime =
    thirtyDaysAgo.getTime() + Math.random() * (now.getTime() - thirtyDaysAgo.getTime());
  return new Date(randomTime);
}

// 从 Markdown 内容中提取第一个标题（优先H1，备选H2）
function extractFirstH1Title(markdown: string): string | null {
  // 优先匹配H1标题：# 标题
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // 如果没有H1，尝试匹配H2标题：## 标题
  const h2Match = markdown.match(/^##\s+(.+)$/m);
  if (h2Match) {
    return h2Match[1].trim();
  }

  return null;
}

// 清理标题用作文件名
function cleanTitleForFilename(title: string): string {
  const cleaned = title.replace(/[^\w\u4e00-\u9fa5\s-]/g, "");
  const withUnderscores = cleaned.replace(/\s+/g, "_");
  return withUnderscores.substring(0, 50);
}

// 生成闪念文件名（与实际应用逻辑一致）
function generateMemoFilename(content: string, createdAt: Date): string {
  const datePrefix = `${createdAt.getFullYear()}${(createdAt.getMonth() + 1).toString().padStart(2, "0")}${createdAt.getDate().toString().padStart(2, "0")}`;

  const title = extractFirstH1Title(content);
  let filenamePart: string;

  if (title) {
    filenamePart = cleanTitleForFilename(title);
  } else {
    filenamePart = nanoid(8);
  }

  return `${datePrefix}_${filenamePart}.md`;
}

// 生成 slug
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "") // 保留中文字符、英文字符、数字、空格和连字符
    .replace(/[\s\u4e00-\u9fff]+/g, "-") // 空格和中文字符替换为连字符
    .replace(/-+/g, "-") // 多个连字符合并为一个
    .replace(/^-|-$/g, "") // 移除开头和结尾的连字符
    .trim();
}

// 生成本地文章数据
function generateLocalPosts() {
  return [
    {
      title: "React Hooks 深度解析",
      slug: "react-hooks-deep-dive",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "深入理解React Hooks的工作原理，掌握函数组件的状态管理和副作用处理。",
      category: "前端框架",
      tags: ["React", "Hooks", "函数组件"],
      author: "Ivan Li",
      image: "./assets/react-hooks.jpg",
      body: `# React Hooks 深度解析

React Hooks 改变了我们编写 React 组件的方式，让函数组件也能拥有状态和生命周期。

## 基础 Hooks

### useState

\`\`\`jsx
const [count, setCount] = useState(0);
\`\`\`

### useEffect

\`\`\`jsx
useEffect(() => {
  // 副作用逻辑
  return () => {
    // 清理逻辑
  };
}, [dependencies]);
\`\`\`

## 自定义 Hooks

自定义 Hooks 让我们可以提取和复用组件逻辑：

\`\`\`jsx
function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);

  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c - 1);

  return { count, increment, decrement };
}
\`\`\`

React Hooks 让函数组件变得更加强大和灵活。
`,
    },
    {
      title: "TypeScript 高级类型系统",
      slug: "typescript-advanced-types",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "探索TypeScript的高级类型特性，提升代码的类型安全性和开发效率。",
      category: "编程语言",
      tags: ["TypeScript", "类型系统", "泛型"],
      author: "Ivan Li",
      image: "./assets/typescript-advanced.jpg",
      body: `# TypeScript 高级类型系统

TypeScript 的类型系统非常强大，掌握高级类型特性可以让我们写出更安全、更优雅的代码。

## 泛型

\`\`\`typescript
function identity<T>(arg: T): T {
  return arg;
}
\`\`\`

## 条件类型

\`\`\`typescript
type NonNullable<T> = T extends null | undefined ? never : T;
\`\`\`

## 映射类型

\`\`\`typescript
type Partial<T> = {
  [P in keyof T]?: T[P];
};
\`\`\`

TypeScript 的类型系统让 JavaScript 开发更加可靠。
`,
    },
    {
      title: "GraphQL API 设计最佳实践",
      slug: "graphql-api-best-practices",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "学习如何设计高效、可维护的GraphQL API，包括Schema设计和性能优化。",
      category: "API设计",
      tags: ["GraphQL", "API", "Schema"],
      author: "Ivan Li",
      image: "./assets/graphql-api.jpg",
      body: `# GraphQL API 设计最佳实践

GraphQL 提供了一种更灵活的 API 查询方式，但也需要遵循一些最佳实践。

## Schema 设计

\`\`\`graphql
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
}
\`\`\`

## 查询优化

避免 N+1 查询问题：

\`\`\`javascript
const resolvers = {
  User: {
    posts: async (user, args, { dataloaders }) => {
      return dataloaders.postsByUserId.load(user.id);
    }
  }
};
\`\`\`

GraphQL 让 API 设计更加灵活和高效。
`,
    },
    {
      title: "Kubernetes 集群管理实战",
      slug: "kubernetes-cluster-management",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: true,
      public: false,
      excerpt: "深入学习Kubernetes集群的部署、管理和监控，掌握容器编排的核心技能。",
      category: "运维",
      tags: ["Kubernetes", "容器编排", "集群管理"],
      author: "Ivan Li",
      image: "./assets/kubernetes-cluster.jpg",
      body: `# Kubernetes 集群管理实战

Kubernetes 是现代容器编排的标准，掌握其集群管理技能至关重要。

## 集群架构

\`\`\`yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
spec:
  containers:
  - name: nginx
    image: nginx:1.20
    ports:
    - containerPort: 80
\`\`\`

## 服务发现

\`\`\`yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
spec:
  selector:
    app: nginx
  ports:
  - port: 80
    targetPort: 80
\`\`\`

Kubernetes 让容器化应用的管理变得简单高效。
`,
    },
    {
      title: "Redis 缓存策略与优化",
      slug: "redis-caching-strategies",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "掌握Redis的各种缓存策略，优化应用性能和数据一致性。",
      category: "数据库",
      tags: ["Redis", "缓存", "性能优化"],
      author: "Ivan Li",
      image: "./assets/redis-caching.jpg",
      body: `# Redis 缓存策略与优化

Redis 是最流行的内存数据库，合理的缓存策略可以大幅提升应用性能。

## 缓存模式

### Cache-Aside

\`\`\`javascript
async function getUser(id) {
  let user = await redis.get(\`user:\${id}\`);
  if (!user) {
    user = await database.getUser(id);
    await redis.setex(\`user:\${id}\`, 3600, JSON.stringify(user));
  }
  return JSON.parse(user);
}
\`\`\`

### Write-Through

\`\`\`javascript
async function updateUser(id, data) {
  await database.updateUser(id, data);
  await redis.setex(\`user:\${id}\`, 3600, JSON.stringify(data));
}
\`\`\`

Redis 让数据访问变得更加快速高效。
`,
    },
  ];
}

// 生成WebDAV文章数据
function generateWebDAVPosts() {
  return [
    {
      title: "Vue.js 3 组合式API深度解析",
      slug: "vue3-composition-api-deep-dive",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "全面解析Vue.js 3的组合式API，包括响应式原理、生命周期和最佳实践。",
      category: "前端框架",
      tags: ["Vue.js", "组合式API", "前端开发"],
      author: "Ivan Li",
      image: "./assets/vue3-composition-api.jpg",
      body: `# Vue.js 3 组合式API深度解析

Vue.js 3 引入的组合式API为开发者提供了更灵活的代码组织方式。本文将深入探讨其核心概念和实践应用。

## 响应式系统

### 1. ref 和 reactive

\`\`\`javascript
import { ref, reactive } from 'vue'

// 基本类型使用 ref
const count = ref(0)
const message = ref('Hello Vue 3')

// 对象类型使用 reactive
const state = reactive({
  user: {
    name: 'John',
    age: 25
  },
  posts: []
})
\`\`\`

### 2. computed 计算属性

\`\`\`javascript
import { computed } from 'vue'

const fullName = computed(() => {
  return \`\${state.user.firstName} \${state.user.lastName}\`
})

// 可写的计算属性
const doubleCount = computed({
  get: () => count.value * 2,
  set: (val) => {
    count.value = val / 2
  }
})
\`\`\`

## 生命周期钩子

### 组合式API中的生命周期

\`\`\`javascript
import { onMounted, onUpdated, onUnmounted } from 'vue'

export default {
  setup() {
    onMounted(() => {
      console.log('组件已挂载')
    })

    onUpdated(() => {
      console.log('组件已更新')
    })

    onUnmounted(() => {
      console.log('组件即将卸载')
    })
  }
}
\`\`\`

## 自定义组合函数

创建可复用的逻辑：

\`\`\`javascript
function useCounter(initialValue = 0) {
  const count = ref(initialValue)

  const increment = () => count.value++
  const decrement = () => count.value--
  const reset = () => count.value = initialValue

  return {
    count: readonly(count),
    increment,
    decrement,
    reset
  }
}
\`\`\`

## 最佳实践

1. **逻辑复用**: 使用组合函数提取可复用逻辑
2. **类型安全**: 结合TypeScript获得更好的开发体验
3. **性能优化**: 合理使用readonly和shallowRef

组合式API让Vue.js应用的逻辑组织更加灵活和强大。
`,
    },
    {
      title: "Svelte 5 新特性全面解析",
      slug: "svelte-5-new-features",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "深入了解Svelte 5的革命性更新，包括Runes系统和性能优化。",
      category: "前端框架",
      tags: ["Svelte", "Runes", "编译器"],
      author: "Ivan Li",
      image: "./assets/svelte5-features.jpg",
      body: `# React Hooks 深度解析

React Hooks 改变了我们编写 React 组件的方式，让函数组件也能拥有状态和生命周期。

## 基础 Hooks

### useState

\`\`\`jsx
const [count, setCount] = useState(0);
\`\`\`

### useEffect

\`\`\`jsx
useEffect(() => {
  // 副作用逻辑
  return () => {
    // 清理逻辑
  };
}, [dependencies]);
\`\`\`

## 自定义 Hooks

自定义 Hooks 让我们可以提取和复用组件逻辑：

\`\`\`jsx
function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);
  
  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c - 1);
  
  return { count, increment, decrement };
}
\`\`\`

## 最佳实践

1. 遵循 Hooks 规则
2. 合理使用依赖数组
3. 避免过度优化

Hooks 让 React 开发变得更加简洁和强大。
`,
    },
    {
      title: "Node.js 性能优化实战",
      slug: "nodejs-performance-optimization",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "分享 Node.js 应用性能优化的实用技巧和工具。",
      category: "后端",
      tags: ["Node.js", "性能优化", "后端开发"],
      author: "Ivan Li",
      image: "./assets/nodejs-performance.jpg",
      body: `# Node.js 性能优化实战

Node.js 应用的性能优化是一个系统性工程，涉及代码、架构、部署等多个层面。

## 代码层面优化

### 1. 异步编程

充分利用 Node.js 的异步特性：

\`\`\`javascript
// 使用 async/await
async function processData() {
  try {
    const data = await fetchData();
    return await processResult(data);
  } catch (error) {
    console.error('处理失败:', error);
  }
}
\`\`\`

### 2. 内存管理

- 避免内存泄漏
- 合理使用缓存
- 及时清理事件监听器

## 架构优化

### 集群模式

\`\`\`javascript
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  // 启动应用
}
\`\`\`

## 监控和调试

使用专业工具进行性能监控：

- **clinic.js** - 性能诊断
- **0x** - 火焰图分析
- **autocannon** - 压力测试

性能优化是一个持续的过程，需要结合实际业务场景进行调整。
`,
    },
    {
      title: "Docker 容器化最佳实践",
      slug: "docker-containerization-best-practices",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: true,
      public: false,
      excerpt: "容器化部署的完整指南，从 Dockerfile 编写到生产环境部署。",
      category: "DevOps",
      tags: ["Docker", "容器化", "DevOps"],
      author: "Ivan Li",
      image: "./assets/docker-best-practices.jpg",
      body: `# Docker 容器化最佳实践

容器化技术已经成为现代应用部署的标准方式。本文分享 Docker 使用的最佳实践。

## Dockerfile 优化

### 多阶段构建

\`\`\`dockerfile
# 构建阶段
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# 运行阶段
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
\`\`\`

### 镜像优化技巧

1. 使用 Alpine 基础镜像
2. 合并 RUN 指令
3. 利用构建缓存
4. 最小化镜像层数

## 安全考虑

- 不要以 root 用户运行
- 扫描镜像漏洞
- 使用官方基础镜像

## 生产环境部署

使用 Docker Compose 或 Kubernetes 进行编排管理。

容器化让应用部署变得更加可靠和一致。
`,
    },
    {
      title: "Web 安全防护指南",
      slug: "web-security-protection-guide",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "全面的 Web 应用安全防护策略，保护你的应用免受常见攻击。",
      category: "安全",
      tags: ["Web安全", "防护", "网络安全"],
      author: "Ivan Li",
      image: "./assets/web-security.jpg",
      body: `# Web 安全防护指南

Web 应用安全是每个开发者都必须重视的话题。本文介绍常见的安全威胁和防护措施。

## 常见安全威胁

### 1. XSS (跨站脚本攻击)

**防护措施：**
- 输入验证和输出编码
- 使用 CSP (Content Security Policy)
- 避免使用 innerHTML

\`\`\`javascript
// 安全的方式
element.textContent = userInput;

// 危险的方式
element.innerHTML = userInput;
\`\`\`

### 2. CSRF (跨站请求伪造)

**防护措施：**
- 使用 CSRF Token
- 验证 Referer 头
- 使用 SameSite Cookie

### 3. SQL 注入

**防护措施：**
- 使用参数化查询
- 输入验证
- 最小权限原则

## 安全配置

### HTTPS 配置

\`\`\`nginx
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # 安全头配置
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
}
\`\`\`

## 安全开发流程

1. **设计阶段** - 威胁建模
2. **开发阶段** - 安全编码
3. **测试阶段** - 安全测试
4. **部署阶段** - 安全配置

安全是一个持续的过程，需要在整个开发生命周期中贯彻执行。
`,
    },
    {
      title: "SVG 图片渲染功能测试",
      slug: "svg-image-test",
      publishDate: new Date("2025-08-03T22:10:00+08:00"),
      updateDate: new Date("2025-08-03T22:10:00+08:00"),
      draft: false,
      public: true,
      excerpt: "测试博客系统对SVG矢量图形的支持，包括自动转换为PNG格式和水印添加功能",
      category: "技术测试",
      tags: ["SVG", "图片处理", "功能测试"],
      author: "Ivan Li",
      image: "./assets/svg-test-diagram.svg",
      body: `# SVG 图片渲染功能测试

这篇文章用于测试博客系统对 SVG 矢量图形的支持功能。系统应该能够：

1. 正确识别和处理 SVG 文件
2. 自动将 SVG 转换为 PNG 格式
3. 为转换后的图片添加水印
4. 支持不同尺寸的图片优化

## 测试图片展示

下面是一个包含流程图和饼图的 SVG 图片：

![SVG测试图表](./assets/svg-test-diagram.svg)

## 功能验证要点

### 1. 格式转换
- ✅ SVG 文件应该被自动识别
- ✅ 转换为 PNG 格式输出
- ✅ 保持高质量（300 DPI）

### 2. 水印功能
- ✅ 转换后的图片应该包含 "ivanli.cc" 水印
- ✅ 水印位置在右下角
- ✅ 水印具有适当的透明度和阴影效果

### 3. 尺寸优化
- ✅ 支持通过参数调整输出尺寸
- ✅ 保持图片比例
- ✅ 适配响应式显示

### 4. 缓存机制
- ✅ 处理后的图片支持浏览器缓存
- ✅ 包含适当的缓存头信息
- ✅ 支持 ETag 和 Last-Modified

## 技术实现细节

系统使用 Sharp 库处理 SVG 文件：

\`\`\`javascript
// SVG 检测和处理
const isSvg = inputBuffer.toString('utf8', 0, 100).includes('<svg');

if (isSvg) {
  // 使用高密度设置确保质量
  pipeline = sharp(inputBuffer, { density: 300 });

  // 强制输出为 PNG 格式以支持水印
  if (opts.format === 'webp' || opts.format === 'jpeg') {
    opts.format = 'png';
  }
}
\`\`\`

## 预期结果

如果功能正常工作，你应该能看到：

1. **文章头图**：SVG 图片作为 heroImage 正确显示
2. **内容图片**：文章中的 SVG 图片转换为 PNG 并显示水印
3. **点击放大**：支持点击图片放大查看功能
4. **响应式**：在不同设备上正确缩放显示

## 测试状态

- [x] SVG 文件创建完成
- [x] 测试文章发布完成
- [x] 图片渲染验证
- [x] 水印效果确认
- [x] 响应式显示测试

---

*本文档用于验证 SVG 图片处理功能的完整性和正确性。*
`,
    },
  ];
}

// 生成本地项目数据
function generateLocalProjects() {
  return [
    {
      title: "开源组件库",
      slug: "open-source-component-library",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "基于 React 和 TypeScript 构建的现代化组件库，提供丰富的 UI 组件和设计系统。",
      category: "开源项目",
      tags: ["React", "TypeScript", "组件库", "UI"],
      author: "Ivan Li",
      image: "./assets/component-library.jpg",
      body: `# 开源组件库

这是一个基于 React 和 TypeScript 构建的现代化组件库项目。

## 技术栈

- **前端框架**: React 18
- **类型系统**: TypeScript
- **构建工具**: Vite
- **样式方案**: Tailwind CSS
- **文档工具**: Storybook

## 核心特性

### 1. 丰富的组件
- 基础组件：Button、Input、Select 等
- 布局组件：Grid、Flex、Container 等
- 反馈组件：Modal、Toast、Loading 等

### 2. 设计系统
- 统一的设计令牌
- 响应式设计
- 主题定制

### 3. 开发体验
- TypeScript 类型支持
- 完整的文档和示例
- 单元测试覆盖

这个组件库旨在提升开发效率和用户体验。
`,
    },
    {
      title: "全栈电商平台",
      slug: "fullstack-ecommerce-platform",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "使用 Next.js 和 Node.js 构建的现代化电商平台，支持多租户和移动端。",
      category: "全栈项目",
      tags: ["Next.js", "Node.js", "电商", "全栈"],
      author: "Ivan Li",
      image: "./assets/ecommerce-platform.jpg",
      body: `# 全栈电商平台

一个功能完整的现代化电商平台，支持 B2C 和 B2B 业务模式。

## 技术架构

### 前端
- **框架**: Next.js 14
- **状态管理**: Zustand
- **UI 库**: Ant Design
- **支付集成**: Stripe

### 后端
- **运行时**: Node.js
- **框架**: Express.js
- **数据库**: PostgreSQL
- **缓存**: Redis

## 核心功能

### 1. 商品管理
- 商品分类和标签
- 库存管理
- 价格策略

### 2. 订单系统
- 购物车功能
- 订单流程
- 支付处理

### 3. 用户系统
- 用户注册登录
- 个人中心
- 收货地址管理

这个平台为现代电商业务提供了完整的解决方案。
`,
    },
    {
      title: "DevOps 自动化工具链",
      slug: "devops-automation-toolchain",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "基于 GitLab CI/CD 和 Kubernetes 的完整 DevOps 自动化解决方案。",
      category: "DevOps",
      tags: ["GitLab", "Kubernetes", "CI/CD", "自动化"],
      author: "Ivan Li",
      image: "./assets/devops-toolchain.jpg",
      body: `# DevOps 自动化工具链

构建现代化的 DevOps 工具链，实现从代码提交到生产部署的全流程自动化。

## 工具栈

### CI/CD
- **版本控制**: GitLab
- **构建工具**: GitLab CI
- **制品仓库**: Harbor
- **部署工具**: ArgoCD

### 监控运维
- **监控**: Prometheus + Grafana
- **日志**: ELK Stack
- **告警**: AlertManager

## 流程设计

### 1. 代码管理
\`\`\`yaml
stages:
  - test
  - build
  - deploy

test:
  script:
    - npm test
    - npm run lint
\`\`\`

### 2. 自动部署
\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
\`\`\`

这个工具链大幅提升了开发和运维效率。
`,
    },
    {
      title: "机器学习推荐系统",
      slug: "ml-recommendation-system",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: true,
      public: false,
      excerpt: "基于深度学习的个性化推荐系统，支持实时推荐和 A/B 测试。",
      category: "机器学习",
      tags: ["Python", "TensorFlow", "推荐系统", "ML"],
      author: "Ivan Li",
      image: "./assets/ml-recommendation.jpg",
      body: `# 机器学习推荐系统

构建高性能的个性化推荐系统，提升用户体验和业务转化率。

## 技术栈

### 机器学习
- **框架**: TensorFlow 2.x
- **语言**: Python
- **数据处理**: Pandas, NumPy
- **特征工程**: Scikit-learn

### 系统架构
- **API 服务**: FastAPI
- **数据库**: MongoDB
- **消息队列**: Apache Kafka
- **缓存**: Redis

## 算法模型

### 1. 协同过滤
\`\`\`python
from sklearn.metrics.pairwise import cosine_similarity

def user_based_cf(user_item_matrix, user_id):
    user_similarity = cosine_similarity(user_item_matrix)
    return recommend_items(user_similarity, user_id)
\`\`\`

### 2. 深度学习模型
\`\`\`python
import tensorflow as tf

model = tf.keras.Sequential([
    tf.keras.layers.Embedding(num_users, embedding_dim),
    tf.keras.layers.Dense(128, activation='relu'),
    tf.keras.layers.Dense(num_items, activation='softmax')
])
\`\`\`

这个系统为用户提供精准的个性化推荐。
`,
    },
    {
      title: "区块链投票系统",
      slug: "blockchain-voting-system",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "基于以太坊智能合约的去中心化投票系统，确保投票的透明性和不可篡改性。",
      category: "区块链",
      tags: ["Solidity", "Ethereum", "智能合约", "Web3"],
      author: "Ivan Li",
      image: "./assets/blockchain-voting.jpg",
      body: `# 区块链投票系统

利用区块链技术构建透明、安全、不可篡改的投票系统。

## 技术架构

### 智能合约
- **语言**: Solidity
- **平台**: Ethereum
- **开发框架**: Hardhat
- **测试网络**: Sepolia

### 前端应用
- **框架**: React
- **Web3 库**: ethers.js
- **钱包集成**: MetaMask
- **UI 库**: Material-UI

## 核心功能

### 1. 智能合约
\`\`\`solidity
contract Voting {
    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    mapping(uint => Candidate) public candidates;
    mapping(address => bool) public voters;

    function vote(uint _candidateId) public {
        require(!voters[msg.sender], "Already voted");
        voters[msg.sender] = true;
        candidates[_candidateId].voteCount++;
    }
}
\`\`\`

### 2. 投票流程
- 候选人注册
- 投票权限验证
- 投票记录上链
- 结果统计展示

这个系统确保了投票过程的公正性和透明度。
`,
    },
  ];
}

// 生成WebDAV项目数据
function generateProjects() {
  return [
    {
      title: "个人博客系统",
      slug: "personal-blog-system",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "基于 Astro 5.0 构建的现代化个人博客系统，支持多数据源和 AI 功能。",
      category: "全栈项目",
      tags: ["Astro", "TypeScript", "SQLite", "WebDAV"],
      author: "Ivan Li",
      image: "./assets/blog-system.jpg",
      body: `# 个人博客系统

这是一个基于 Astro 5.0 构建的现代化个人博客系统，集成了多种先进技术和功能。

## 技术栈

- **前端框架**: Astro 5.0 + React
- **样式**: Tailwind CSS + daisyUI
- **数据库**: SQLite + Drizzle ORM
- **内容管理**: WebDAV + 本地文件系统
- **AI 功能**: OpenAI API + 向量搜索
- **部署**: Docker + Traefik

## 核心功能

### 多数据源支持

系统支持两种内容来源：
- **本地文件系统**: 使用 Astro Content Collections
- **WebDAV 服务器**: 动态获取远程内容

### AI 增强功能

- **智能摘要**: 自动生成文章摘要
- **向量搜索**: 基于语义的内容搜索
- **智能标签**: AI 辅助标签生成

### 管理功能

- **在线编辑器**: 基于 TipTap 的 Markdown 编辑器
- **文件管理**: 类似 VS Code 的文件浏览器
- **评论系统**: 支持嵌套回复和管理

## 项目亮点

1. **性能优化**: SSG + 智能缓存
2. **SEO 友好**: 完整的 meta 标签和结构化数据
3. **响应式设计**: 完美适配各种设备
4. **安全性**: JWT 认证 + CSRF 防护

## 部署方式

\`\`\`bash
# 克隆项目
git clone <repository-url>

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env

# 启动开发服务器
bun run dev
\`\`\`

这个项目展示了现代 Web 开发的最佳实践，是学习和参考的优秀案例。
`,
    },
    {
      title: "AI 驱动的代码审查工具",
      slug: "ai-powered-code-review-tool",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "利用大语言模型自动进行代码审查，提高代码质量和开发效率。",
      category: "开发工具",
      tags: ["AI", "Code Review", "LLM", "DevOps"],
      author: "Ivan Li",
      image: "./assets/code-review-tool.jpg",
      body: `# AI 驱动的代码审查工具

这是一个创新的代码审查工具，利用大语言模型的能力自动分析代码质量、发现潜在问题并提供改进建议。

## 功能特性

### 智能代码分析

- **语法检查**: 自动发现语法错误和不规范写法
- **逻辑分析**: 识别潜在的逻辑错误和边界情况
- **性能优化**: 提供性能改进建议
- **安全审计**: 检测安全漏洞和风险点

### 多语言支持

支持主流编程语言：
- JavaScript/TypeScript
- Python
- Java
- Go
- Rust

### 集成方式

\`\`\`yaml
# GitHub Actions 集成
name: AI Code Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: ai-code-review/action@v1
        with:
          api-key: \${{ secrets.OPENAI_API_KEY }}
\`\`\`

## 技术实现

### 架构设计

1. **代码解析器**: 将代码转换为 AST
2. **AI 分析引擎**: 使用 GPT-4 进行代码分析
3. **报告生成器**: 生成结构化的审查报告
4. **集成接口**: 支持多种 CI/CD 平台

### 核心算法

\`\`\`python
class CodeReviewer:
    def __init__(self, model="gpt-4"):
        self.model = model

    def analyze_code(self, code, language):
        prompt = self.build_prompt(code, language)
        response = self.llm.complete(prompt)
        return self.parse_response(response)

    def build_prompt(self, code, language):
        return f"""
        请审查以下 {language} 代码：

        {code}

        请从以下方面进行分析：
        1. 代码质量
        2. 性能问题
        3. 安全风险
        4. 最佳实践
        """
\`\`\`

## 使用效果

- **提高效率**: 减少 60% 的人工审查时间
- **提升质量**: 发现更多潜在问题
- **知识传递**: 帮助团队学习最佳实践

这个工具正在改变传统的代码审查流程，让开发团队能够更专注于业务逻辑的实现。
`,
    },
    {
      title: "微服务架构实践平台",
      slug: "microservices-architecture-platform",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "基于 Kubernetes 的微服务架构实践平台，包含服务发现、配置管理、监控等完整功能。",
      category: "架构设计",
      tags: ["微服务", "Kubernetes", "架构", "DevOps"],
      author: "Ivan Li",
      image: "./assets/microservices-platform.jpg",
      body: `# 微服务架构实践平台

这是一个完整的微服务架构实践平台，展示了现代分布式系统的设计和实现。

## 架构概览

### 服务组件

- **API Gateway**: 统一入口和路由
- **用户服务**: 用户认证和授权
- **订单服务**: 订单管理和处理
- **支付服务**: 支付流程处理
- **通知服务**: 消息推送和通知

### 基础设施

- **服务注册与发现**: Consul
- **配置管理**: Consul KV
- **消息队列**: RabbitMQ
- **数据库**: PostgreSQL + Redis
- **监控**: Prometheus + Grafana
- **日志**: ELK Stack

## 技术实现

### 服务间通信

\`\`\`go
// gRPC 服务定义
service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
}

// HTTP API
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    userID := mux.Vars(r)["id"]
    user, err := h.userService.GetUser(userID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(user)
}
\`\`\`

### 配置管理

\`\`\`yaml
# Kubernetes ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  database.url: "postgresql://localhost:5432/mydb"
  redis.url: "redis://localhost:6379"
  log.level: "info"
\`\`\`

## 部署架构

### Docker 容器化

\`\`\`dockerfile
FROM golang:1.19-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o main .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
CMD ["./main"]
\`\`\`

### Kubernetes 部署

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
      - name: user-service
        image: user-service:latest
        ports:
        - containerPort: 8080
\`\`\`

## 监控和运维

### 健康检查

每个服务都实现了健康检查端点，支持 Kubernetes 的 liveness 和 readiness 探针。

### 分布式追踪

使用 Jaeger 进行分布式追踪，帮助定位性能瓶颈和问题。

### 自动扩缩容

基于 CPU 和内存使用率自动调整服务实例数量。

这个平台展示了微服务架构的完整实践，是学习分布式系统的优秀案例。
`,
    },
    {
      title: "实时数据可视化大屏",
      slug: "realtime-data-visualization-dashboard",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: "基于 WebSocket 和 D3.js 的实时数据可视化大屏系统，支持多种图表类型和自定义配置。",
      category: "数据可视化",
      tags: ["数据可视化", "WebSocket", "D3.js", "实时系统"],
      author: "Ivan Li",
      image: "./assets/data-visualization.jpg",
      body: `# 实时数据可视化大屏

这是一个功能强大的实时数据可视化大屏系统，能够实时展示各种业务指标和数据趋势。

## 功能特性

### 实时数据更新

- **WebSocket 连接**: 毫秒级数据更新
- **数据缓冲**: 平滑的动画过渡
- **断线重连**: 自动恢复连接
- **数据压缩**: 优化传输效率

### 丰富的图表类型

- **折线图**: 趋势分析
- **柱状图**: 对比分析
- **饼图**: 占比分析
- **地图**: 地理分布
- **仪表盘**: 实时指标
- **热力图**: 密度分析

### 自定义配置

\`\`\`javascript
// 图表配置
const chartConfig = {
  type: 'line',
  data: {
    source: 'websocket://localhost:8080/metrics',
    fields: ['timestamp', 'value'],
    realtime: true
  },
  options: {
    animation: {
      duration: 1000,
      easing: 'ease-in-out'
    },
    scales: {
      x: { type: 'time' },
      y: { type: 'linear' }
    }
  }
};
\`\`\`

## 技术实现

### 前端架构

\`\`\`typescript
class RealtimeChart {
  private websocket: WebSocket;
  private chart: D3Selection;
  private dataBuffer: DataPoint[] = [];

  constructor(config: ChartConfig) {
    this.initWebSocket(config.data.source);
    this.initChart(config);
  }

  private initWebSocket(url: string) {
    this.websocket = new WebSocket(url);
    this.websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.updateChart(data);
    };
  }

  private updateChart(newData: DataPoint[]) {
    this.dataBuffer.push(...newData);
    this.render();
  }
}
\`\`\`

### 后端数据推送

\`\`\`python
import asyncio
import websockets
import json

class DataStreamer:
    def __init__(self):
        self.clients = set()

    async def register(self, websocket):
        self.clients.add(websocket)

    async def unregister(self, websocket):
        self.clients.discard(websocket)

    async def broadcast(self, data):
        if self.clients:
            await asyncio.gather(
                *[client.send(json.dumps(data)) for client in self.clients],
                return_exceptions=True
            )

    async def data_producer(self):
        while True:
            # 生成或获取实时数据
            data = await self.fetch_realtime_data()
            await self.broadcast(data)
            await asyncio.sleep(1)
\`\`\`

## 性能优化

### 数据处理

- **数据采样**: 避免过度渲染
- **增量更新**: 只更新变化的部分
- **虚拟滚动**: 处理大量数据点
- **Web Workers**: 后台数据处理

### 渲染优化

- **Canvas 渲染**: 高性能图形绘制
- **动画优化**: 使用 requestAnimationFrame
- **内存管理**: 及时清理不需要的数据

## 应用场景

- **业务监控**: 实时业务指标展示
- **系统监控**: 服务器性能监控
- **IoT 数据**: 传感器数据可视化
- **金融交易**: 实时交易数据展示

这个系统为实时数据监控提供了完整的解决方案，具有很强的实用价值。
`,
    },
    {
      title: "智能聊天机器人平台",
      slug: "intelligent-chatbot-platform",
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: true,
      public: false,
      excerpt: "基于大语言模型的智能聊天机器人平台，支持多轮对话、知识库集成和个性化定制。",
      category: "AI 应用",
      tags: ["AI", "聊天机器人", "NLP", "大语言模型"],
      author: "Ivan Li",
      image: "./assets/chatbot-platform.jpg",
      body: `# 智能聊天机器人平台

这是一个基于大语言模型的智能聊天机器人平台，提供了完整的对话管理和知识库集成功能。

## 核心功能

### 智能对话

- **多轮对话**: 保持上下文连贯性
- **意图识别**: 准确理解用户需求
- **情感分析**: 识别用户情绪状态
- **个性化回复**: 根据用户特征定制回复

### 知识库集成

- **文档解析**: 支持多种文档格式
- **向量检索**: 基于语义的知识检索
- **实时更新**: 动态更新知识库内容
- **准确性验证**: 确保回复的准确性

### 管理后台

\`\`\`typescript
interface ChatbotConfig {
  name: string;
  personality: string;
  knowledgeBase: string[];
  responseStyle: 'formal' | 'casual' | 'professional';
  maxTokens: number;
  temperature: number;
}

class ChatbotManager {
  async createBot(config: ChatbotConfig): Promise<Chatbot> {
    const bot = new Chatbot(config);
    await bot.loadKnowledgeBase();
    return bot;
  }

  async updateKnowledge(botId: string, documents: Document[]) {
    const bot = await this.getBot(botId);
    await bot.updateKnowledgeBase(documents);
  }
}
\`\`\`

## 技术架构

### 对话引擎

\`\`\`python
class ConversationEngine:
    def __init__(self, model_name="gpt-4"):
        self.llm = OpenAI(model=model_name)
        self.memory = ConversationBufferMemory()
        self.knowledge_base = VectorStore()

    async def process_message(self, user_id: str, message: str):
        # 检索相关知识
        relevant_docs = await self.knowledge_base.search(message)

        # 构建提示词
        prompt = self.build_prompt(message, relevant_docs)

        # 生成回复
        response = await self.llm.agenerate(prompt)

        # 更新对话历史
        self.memory.save_context(
            {"input": message},
            {"output": response}
        )

        return response
\`\`\`

### 知识库管理

\`\`\`python
class KnowledgeBase:
    def __init__(self):
        self.vector_store = ChromaDB()
        self.embeddings = OpenAIEmbeddings()

    async def add_documents(self, documents: List[Document]):
        # 文档分块
        chunks = self.text_splitter.split_documents(documents)

        # 生成向量
        vectors = await self.embeddings.embed_documents(chunks)

        # 存储到向量数据库
        await self.vector_store.add_vectors(vectors, chunks)

    async def search(self, query: str, k: int = 5):
        query_vector = await self.embeddings.embed_query(query)
        results = await self.vector_store.similarity_search(
            query_vector, k=k
        )
        return results
\`\`\`

## 部署和集成

### API 接口

\`\`\`javascript
// REST API
POST /api/chat
{
  "botId": "customer-service",
  "userId": "user123",
  "message": "我想了解产品价格"
}

// WebSocket 实时对话
const ws = new WebSocket('ws://localhost:8080/chat');
ws.send(JSON.stringify({
  type: 'message',
  botId: 'customer-service',
  userId: 'user123',
  content: '你好'
}));
\`\`\`

### 前端集成

\`\`\`react
function ChatWidget({ botId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const sendMessage = async () => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botId,
        userId: getCurrentUserId(),
        message: input
      })
    });

    const reply = await response.json();
    setMessages(prev => [...prev,
      { role: 'user', content: input },
      { role: 'assistant', content: reply.message }
    ]);
    setInput('');
  };

  return (
    <div className="chat-widget">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={msg.role}>
            {msg.content}
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
      />
    </div>
  );
}
\`\`\`

## 应用场景

- **客户服务**: 自动回答常见问题
- **技术支持**: 提供技术文档查询
- **教育培训**: 智能答疑和学习辅导
- **企业内部**: 知识管理和信息查询

这个平台为企业提供了完整的智能对话解决方案，大大提升了用户体验和服务效率。
`,
    },
  ];
}

// 为不同的 memo 生成标签
function getTagsForMemo(index: number): string[] {
  const tagSets = [
    ["技术", "学习"],
    ["生活", "思考"],
    ["工作", "项目"],
    ["阅读", "笔记"],
    ["随想"],
    ["编程", "JavaScript"],
    ["设计", "UI/UX"],
    ["健康", "运动"],
    ["旅行", "摄影"],
    ["音乐", "艺术"],
    ["美食", "烹饪"],
    ["电影", "娱乐"],
    ["科技", "趋势"],
    ["创业", "商业"],
    ["哲学", "思辨"],
  ];
  return tagSets[index % tagSets.length];
}

// 为不同的 memo 生成专门的附件（不与内容重复）
function getAttachmentsForMemo(index: number): any[] {
  const attachmentSets = [
    [], // 第0条：无附件
    [
      {
        // 第1条：图片附件
        filename: "memo-attachment-1.jpg",
        path: "assets/memo-attachment-1.jpg",
        contentType: "image/jpeg",
        size: 234567,
        isImage: true,
      },
    ],
    [
      {
        // 第2条：图片附件
        filename: "memo-attachment-2.jpg",
        path: "assets/memo-attachment-2.jpg",
        contentType: "image/jpeg",
        size: 187654,
        isImage: true,
      },
    ],
    [], // 第3条：无附件
    [
      {
        // 第4条：图片附件
        filename: "memo-attachment-3.jpg",
        path: "assets/memo-attachment-3.jpg",
        contentType: "image/jpeg",
        size: 156789,
        isImage: true,
      },
    ],
    [
      {
        // 第5条：专门的附件图片（不在内容中使用）
        filename: "attachment-only.jpg",
        path: "assets/attachment-only.jpg",
        contentType: "image/jpeg",
        size: 123456,
        isImage: true,
      },
    ],
    [], // 第6条：无附件
    [
      {
        // 第7条：多个图片附件
        filename: "memo-attachment-4.jpg",
        path: "assets/memo-attachment-4.jpg",
        contentType: "image/jpeg",
        size: 145678,
        isImage: true,
      },
      {
        filename: "memo-attachment-5.jpg",
        path: "assets/memo-attachment-5.jpg",
        contentType: "image/jpeg",
        size: 198765,
        isImage: true,
      },
    ],
    [], // 第8条：无附件
    [
      {
        // 第9条：图片附件
        filename: "memo-attachment-6.jpg",
        path: "assets/memo-attachment-6.jpg",
        contentType: "image/jpeg",
        size: 176543,
        isImage: true,
      },
    ],
    [], // 其余：无附件
  ];
  return attachmentSets[index] || [];
}

// 为不同的 memo 生成多样化的内容
function getMemoContent(index: number): string {
  const contents = [
    // 第0条：技术学习
    `# 学习 React 18 新特性

今天深入学习了 React 18 的新特性，特别是 Concurrent Features。

## 主要收获

1. **Automatic Batching**: 自动批处理更新，提升性能
2. **Suspense**: 更好的异步组件支持
3. **useTransition**: 标记非紧急更新

\`\`\`javascript
function App() {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(() => {
      // 非紧急更新
      setTab('posts');
    });
  };

  return <div>{isPending ? 'Loading...' : content}</div>;
}
\`\`\`

这些特性让 React 应用的用户体验更加流畅。

#技术 #React #前端`,

    // 第1条：生活思考
    `# 周末的思考

今天在公园散步时想到一些关于工作和生活平衡的问题。

现代社会的快节奏让我们很容易陷入忙碌的陷阱，但真正重要的是：

- 保持内心的平静
- 珍惜与家人朋友的时光
- 持续学习和成长
- 关注身心健康

有时候慢下来，反而能走得更远。

#生活 #思考 #平衡`,

    // 第2条：工作项目
    `# 项目重构进展

这周开始对博客系统进行重构，主要目标：

## 已完成
- [x] 迁移到 Astro 5.0
- [x] 集成 WebDAV 支持
- [x] 优化构建性能

## 进行中
- [ ] AI 功能集成
- [ ] 评论系统优化
- [ ] 移动端适配

## 遇到的问题

WebDAV 集成时遇到了一些认证问题，最终通过调整 CORS 配置解决了。

下周计划完成 AI 功能的集成。

#工作 #项目 #重构`,

    // 第3条：读书笔记
    `# 《深入理解计算机系统》读书笔记

今天读了第三章关于程序的机器级表示，有几个重要概念：

## 汇编语言基础

- **寄存器**: CPU 内部的存储单元
- **指令集**: 处理器支持的操作集合
- **内存寻址**: 如何访问内存中的数据

## 函数调用机制

函数调用涉及栈帧的创建和销毁：

1. 保存调用者状态
2. 传递参数
3. 跳转到被调用函数
4. 执行函数体
5. 返回结果
6. 恢复调用者状态

理解这些底层机制对编写高效代码很有帮助。

#阅读 #笔记 #计算机系统`,

    // 第4条：随想
    `最近在思考什么是真正的创造力。

创造力不仅仅是从无到有的创新，更多时候是：

- 重新组合已有的元素
- 从不同角度看待问题
- 跨领域的知识迁移
- 打破固有的思维模式

就像乔布斯说的："创造力就是把事物联系起来。"

保持好奇心，多元化学习，或许就是培养创造力的最好方式。

#随想 #创造力 #思维`,

    // 第5条：编程学习
    `# JavaScript 异步编程深入

今天学习了 JavaScript 的异步编程模式，从回调到 Promise 再到 async/await。

> “在异步世界里，耐心是最重要的调度器。”

## 核心概念

\`\`\`javascript
// Promise 链式调用
fetch('/api/data')
  .then(response => response.json())
  .then(data => processData(data))
  .catch(error => handleError(error));

// async/await 语法
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    return processData(data);
  } catch (error) {
    handleError(error);
  }
}
\`\`\`

异步编程让 JavaScript 能够处理复杂的并发操作。

#编程 #JavaScript #异步`,

    // 第6条：设计思考
    `# UI/UX 设计原则思考

最近在重新审视界面设计，发现好的设计都遵循几个基本原则：

## 核心原则

1. **简洁性** - 去除不必要的元素
2. **一致性** - 保持统一的视觉语言
3. **可用性** - 用户能够直观地使用
4. **可访问性** - 考虑不同用户的需求

> "好的设计是显而易见的，伟大的设计是透明的。"

设计不仅仅是美观，更重要的是解决问题。

#设计 #UI/UX #用户体验`,

    // 第7条：健康生活
    `今天开始了新的晨跑计划 🏃‍♂️

早上6点起床，在公园跑了5公里。虽然有点累，但精神状态明显更好了。

## 运动的好处

- 提高心肺功能
- 增强免疫力
- 改善睡眠质量
- 释放压力

计划每周跑步3-4次，逐步提高距离和速度。

健康的身体是一切的基础！

#健康 #运动 #晨跑`,

    // 第8条：旅行摄影
    `# 周末摄影小记

今天去了城市公园拍照，尝试了一些新的构图技巧。

## 拍摄心得

- **黄金时刻**：日出日落时的光线最美
- **三分法则**：将主体放在画面的三分之一处
- **前景元素**：增加画面的层次感
- **耐心等待**：好的瞬间需要等待

摄影不仅仅是记录，更是发现美的过程。

每一次按下快门，都是对世界的重新认识。

#旅行 #摄影 #艺术`,

    // 第9条：音乐艺术
    `# 古典音乐欣赏笔记

今晚听了巴赫的《哥德堡变奏曲》，被其精妙的结构深深震撼。

## 音乐的魅力

巴赫的音乐有一种数学般的精确性，每个音符都恰到好处。30个变奏曲，每一首都有独特的性格，但又完美地统一在一个主题下。

> "音乐是时间的艺术，也是情感的语言。"

古典音乐教会我们耐心聆听，在快节奏的生活中找到内心的宁静。

#音乐 #古典 #巴赫`,

    // 第10条：美食烹饪
    `# 第一次做意大利面

今天尝试做了番茄肉酱意大利面，虽然不完美，但很有成就感！

## 制作过程

1. 先炒洋葱和蒜爆香
2. 加入牛肉末炒制
3. 倒入番茄酱慢炖
4. 意大利面煮至al dente
5. 混合调味

## 心得体会

烹饪是一门艺术，需要耐心和练习。每一道菜都承载着制作者的心意。

下次想尝试做提拉米苏！

#美食 #烹饪 #意大利面`,

    // 第11条：电影娱乐
    `# 《银翼杀手2049》观后感

重新看了这部科幻经典，依然被其深刻的哲学思考所震撼。

## 核心主题

- **人性的定义**：什么让我们成为人类？
- **记忆与身份**：记忆是否定义了我们的存在？
- **技术与伦理**：AI发展的边界在哪里？

电影的视觉效果令人惊叹，但更重要的是它提出的问题。

在AI快速发展的今天，这些思考显得格外重要。

#电影 #科幻 #哲学`,

    // 第12条：科技趋势
    `# AI 发展趋势观察

最近关注了一些 AI 领域的新进展，变化速度令人惊叹。

## 主要趋势

- **多模态AI**：文本、图像、音频的融合
- **边缘计算**：AI 能力下沉到设备端
- **个性化助手**：更懂用户需求的AI
- **创意生成**：AI在艺术创作中的应用

技术发展的同时，我们也需要思考伦理和社会影响。

未来已来，我们准备好了吗？

#科技 #AI #趋势`,

    // 第13条：创业商业
    `# 创业思考：从想法到产品

最近在思考一个产品想法，记录一下思考过程。

## 验证步骤

1. **问题识别**：这个问题真的存在吗？
2. **市场调研**：有多少人有这个需求？
3. **竞品分析**：现有解决方案的不足？
4. **MVP设计**：最小可行产品是什么？
5. **用户反馈**：早期用户怎么说？

创业不是拍脑袋，而是系统性的验证过程。

失败是成功之母，但聪明的失败更有价值。

#创业 #产品 #商业`,

    // 第14条：哲学思辨
    `# 关于时间的思考

今天读到一句话："时间不是金钱，时间就是生命。"

## 时间的本质

时间是我们最宝贵的资源，因为：
- 它是不可再生的
- 它是公平分配的（每人每天24小时）
- 它的价值因人而异

## 时间管理的智慧

重要的不是管理时间，而是管理注意力和精力。

把时间花在真正重要的事情上，而不是紧急的事情上。

生命的意义不在于长度，而在于深度。

#哲学 #时间 #人生`,

    // 第15条：摄影作品分享（正文带图片）
    `# 今日摄影作品分享

今天在公园拍到了一张很满意的照片，想和大家分享一下。

![夕阳下的湖面](assets/sunset-lake.jpg)

这张照片拍摄于傍晚时分，夕阳西下，湖面波光粼粼。我使用了三分法构图，将地平线放在画面的下三分之一处，让天空占据更多空间。

## 拍摄参数

- 相机：Canon EOS R5
- 镜头：24-70mm f/2.8
- 光圈：f/8
- 快门：1/125s
- ISO：100

## 后期处理

在 Lightroom 中稍微调整了：
- 提高了阴影细节
- 降低了高光
- 增加了一点饱和度

摄影让我学会了观察生活中的美好瞬间。

#摄影 #风景 #艺术`,

    // 第16条：美食制作过程（正文带图片）
    `# 周末烘焙时光

今天尝试制作了抹茶戚风蛋糕，过程虽然有些波折，但最终成品还是很满意的！

## 制作过程

首先准备所有材料：

![烘焙材料准备](assets/baking-ingredients.jpg)

抹茶粉、鸡蛋、面粉、牛奶等材料一应俱全。

制作过程中最关键的是蛋白打发：

![蛋白打发过程](assets/egg-whites.jpg)

要打到干性发泡，提起打蛋器有小尖角。

最终成品：

![抹茶戚风蛋糕](assets/matcha-cake.jpg)

松软香甜，抹茶香味浓郁，配上一杯茶就是完美的下午茶时光。

## 心得体会

烘焙需要耐心和精确，每一个步骤都不能马虎。失败是成功之母，多练习就会越来越好。

下次想尝试制作马卡龙！

#烘焙 #美食 #抹茶`,

    // 第17条：技术分享（正文带图片）
    `# Docker 容器化部署实践

最近在学习 Docker，成功将博客项目容器化部署了。

## 项目结构

![项目目录结构](assets/project-structure.png)

整个项目采用了多阶段构建，分为开发环境和生产环境。

## Dockerfile 配置

\`\`\`dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
\`\`\`

## 部署效果

![部署监控面板](assets/docker-dashboard.png)

通过 Docker Compose 管理多个服务，包括应用、数据库、Redis 等。

## 性能对比

容器化部署后：
- 启动时间：从 30s 减少到 5s
- 内存占用：减少了 40%
- 部署一致性：100%

Docker 真的是现代应用部署的利器！

#Docker #容器化 #DevOps`,
  ];

  return contents[index] || contents[index % contents.length];
}

// 本地闪念辅助函数
function getLocalMemoTitle(index: number): string {
  const titles = [
    "Local Development Environment Setup",
    "Code Refactoring Thoughts",
    "New Technology Learning Notes",
    "Project Management Experience",
    "Programming Efficiency Tips",
  ];
  return titles[index] || `Local Memo ${index + 1}`;
}

function getLocalMemoExcerpt(index: number): string {
  const excerpts = [
    "分享一些本地开发环境的配置经验和踩坑记录",
    "关于代码重构的一些思考和实践经验",
    "记录学习新技术过程中的收获和感悟",
    "项目管理中的一些心得体会和经验总结",
    "提升编程效率的一些实用技巧和工具推荐",
  ];
  return excerpts[index] || "本地闪念内容摘要";
}

function getLocalMemoTags(index: number): string[] {
  const tagSets = [
    ["开发", "环境", "配置"],
    ["重构", "代码质量", "最佳实践"],
    ["学习", "技术", "笔记"],
    ["项目管理", "团队协作", "经验"],
    ["效率", "工具", "技巧"],
  ];
  return tagSets[index] || ["本地", "闪念"];
}

function getLocalMemoContent(index: number): string {
  const contents = [
    `# 本地开发环境配置心得

最近重新配置了开发环境，记录一些有用的经验。

## 开发工具配置

1. **VS Code 插件推荐**
   - ESLint + Prettier
   - GitLens
   - Thunder Client

2. **终端配置**
   - Oh My Zsh
   - 自定义主题和插件

## 环境变量管理

使用 \`.env\` 文件管理不同环境的配置：

\`\`\`bash
# 开发环境
NODE_ENV=development
API_URL=http://localhost:25090
\`\`\`

这样可以避免硬编码，提高代码的可维护性。

#开发 #环境 #配置`,

    `# 代码重构的思考

今天对项目进行了一次大规模重构，有一些心得体会。

## 重构原则

1. **小步快跑**：每次只重构一小部分
2. **保持测试**：确保重构不破坏现有功能
3. **渐进式改进**：逐步优化代码结构

## 重构收益

- 代码可读性提升 40%
- 维护成本降低 30%
- 新功能开发效率提升 25%

重构是一个持续的过程，需要耐心和坚持。

#重构 #代码质量 #最佳实践`,

    `# 新技术学习笔记

最近在学习 Rust 语言，记录一些学习心得。

## 学习方法

1. **理论与实践结合**
2. **多写小项目**
3. **参与开源贡献**

## Rust 特点

- 内存安全
- 零成本抽象
- 并发安全

\`\`\`rust
fn main() {
    println!("Hello, Rust!");
}
\`\`\`

学习新技术需要保持好奇心和持续的实践。

#学习 #技术 #笔记`,

    `# 项目管理经验分享

作为技术负责人，分享一些项目管理的经验。

## 团队协作

1. **明确分工**：每个人都有清晰的职责
2. **定期沟通**：每日站会 + 周会
3. **文档先行**：重要决策都要有文档记录

## 风险控制

- 技术风险评估
- 进度风险监控
- 质量风险把控

## 工具推荐

- 项目管理：Jira
- 文档协作：Notion
- 代码管理：Git + GitHub

好的项目管理是成功的一半。

#项目管理 #团队协作 #经验`,

    `# 编程效率提升技巧

分享一些提升编程效率的实用技巧。

## 快捷键掌握

熟练使用 IDE 快捷键可以大大提升效率：

- \`Ctrl+Shift+P\`：命令面板
- \`Ctrl+P\`：快速打开文件
- \`Alt+Shift+F\`：格式化代码

## 代码片段

创建常用的代码片段模板：

\`\`\`json
{
  "React Component": {
    "prefix": "rfc",
    "body": [
      "function \${1:ComponentName}() {",
      "  return (",
      "    <div>",
      "      \${2:content}",
      "    </div>",
      "  );",
      "}"
    ]
  }
}
\`\`\`

## 自动化工具

- 代码格式化：Prettier
- 代码检查：ESLint
- 自动部署：GitHub Actions

工具是为了解放生产力，让我们专注于创造价值。

#效率 #工具 #技巧`,
  ];
  return contents[index] || "本地闪念内容";
}

// 生成本地闪念数据
function generateLocalMemos() {
  const now = new Date();
  const memos: any[] = [];

  // 生成5条本地闪念
  for (let i = 0; i < 5; i++) {
    const createdAt = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
    const updatedAt = new Date(createdAt.getTime() + Math.random() * 12 * 60 * 60 * 1000);

    const memo = {
      title: getLocalMemoTitle(i),
      slug: generateSlug(getLocalMemoTitle(i)),
      publishDate: createdAt,
      updateDate: updatedAt,
      draft: false,
      public: i % 2 === 0, // 交替公开/私有
      excerpt: getLocalMemoExcerpt(i),
      category: "闪念",
      tags: getLocalMemoTags(i),
      author: "Ivan Li",
      body: getLocalMemoContent(i),
    };

    memos.push(memo);
  }

  return memos;
}

// 生成备忘录数据
function generateMemos() {
  const now = new Date();
  const memos: any[] = [];

  // 生成18条闪念，增加多样性（包含正文带图片的内容）
  for (let i = 0; i < 18; i++) {
    const createdAt = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
    const updatedAt = new Date(createdAt.getTime() + Math.random() * 12 * 60 * 60 * 1000);

    memos.push({
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      public: i % 3 !== 0, // 大部分公开，少数私有
      tags: getTagsForMemo(i),
      attachments: getAttachmentsForMemo(i), // 专门的附件，不与内容重复
      body: getMemoContent(i),
    });
  }

  return memos;
}

// 创建目录
function createDirectories(webdavDir: string, localDir: string) {
  const dirs = [
    webdavDir,
    join(webdavDir, "blog"), // 文章目录
    join(webdavDir, "blog", "assets"), // 文章图片目录
    join(webdavDir, "projects"), // 项目目录（独立的顶级目录）
    join(webdavDir, "projects", "assets"), // 项目图片目录
    join(webdavDir, "memos"),
    join(webdavDir, "memos", "assets"), // memos 附件目录
    localDir,
    join(localDir, "blog"), // 本地文章目录
    join(localDir, "blog", "assets"), // 本地文章图片目录
    join(localDir, "projects"), // 本地项目目录（独立的顶级目录）
    join(localDir, "projects", "assets"), // 本地项目图片目录
    join(localDir, "memos"), // 本地闪念目录
    join(localDir, "memos", "assets"), // 本地闪念图片目录
  ];

  dirs.forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`创建目录: ${dir}`);
    }
  });
}

// 写入文件
function writeMarkdownFile(filePath: string, frontmatter: any, body: string) {
  const yamlFrontmatter = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return `${key}: []`;
        }
        // 检查数组元素是否为对象
        if (typeof value[0] === "object" && value[0] !== null) {
          // 对象数组，使用 YAML 格式
          const yamlArray = value
            .map((item) => {
              const itemYaml = Object.entries(item)
                .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
                .join("\n");
              return `  -\n${itemYaml}`;
            })
            .join("\n");
          return `${key}:\n${yamlArray}`;
        } else {
          // 简单数组
          return `${key}:\n${value.map((item) => `  - ${item}`).join("\n")}`;
        }
      } else if (value instanceof Date) {
        return `${key}: ${value.toISOString()}`;
      } else if (typeof value === "string" && value.includes("\n")) {
        return `${key}: |\n  ${value.replace(/\n/g, "\n  ")}`;
      } else {
        return `${key}: ${JSON.stringify(value)}`;
      }
    })
    .join("\n");

  const content = `---\n${yamlFrontmatter}\n---\n\n${body}`;
  writeFileSync(filePath, content, "utf-8");
  console.log(`创建文件: ${filePath}`);
}

// 下载测试图片
async function downloadTestImages(webdavDir: string, localDir: string) {
  console.log("\n📸 下载测试图片...");

  const images = [
    // WebDAV 文章图片 (ID 1-5)
    { url: "https://picsum.photos/id/1/800/400", filename: "vue3-composition-api.jpg" },
    { url: "https://picsum.photos/id/2/800/400", filename: "svelte5-features.jpg" },
    { url: "https://picsum.photos/id/3/800/400", filename: "nodejs-performance.jpg" },
    { url: "https://picsum.photos/id/4/800/400", filename: "docker-best-practices.jpg" },
    { url: "https://picsum.photos/id/5/800/400", filename: "web-security.jpg" },
    // 本地文章图片 (ID 11-15)
    { url: "https://picsum.photos/id/11/800/400", filename: "react-hooks.jpg" },
    { url: "https://picsum.photos/id/12/800/400", filename: "typescript-advanced.jpg" },
    { url: "https://picsum.photos/id/13/800/400", filename: "graphql-api.jpg" },
    { url: "https://picsum.photos/id/14/800/400", filename: "kubernetes-cluster.jpg" },
    { url: "https://picsum.photos/id/15/800/400", filename: "redis-caching.jpg" },
    // hello-world 文章专用图片 (ID 10)
    { url: "https://picsum.photos/id/10/800/400", filename: "hello-world.jpg" },
    // WebDAV 项目图片 (ID 16-20)
    { url: "https://picsum.photos/id/16/800/400", filename: "blog-system.jpg" },
    { url: "https://picsum.photos/id/17/800/400", filename: "code-review-tool.jpg" },
    { url: "https://picsum.photos/id/18/800/400", filename: "microservices-platform.jpg" },
    { url: "https://picsum.photos/id/19/800/400", filename: "data-visualization.jpg" },
    { url: "https://picsum.photos/id/20/800/400", filename: "chatbot-platform.jpg" },
    // 本地项目图片 (ID 21-25)
    { url: "https://picsum.photos/id/21/800/400", filename: "component-library.jpg" },
    { url: "https://picsum.photos/id/22/800/400", filename: "ecommerce-platform.jpg" },
    { url: "https://picsum.photos/id/23/800/400", filename: "devops-toolchain.jpg" },
    { url: "https://picsum.photos/id/24/800/400", filename: "ml-recommendation.jpg" },
    { url: "https://picsum.photos/id/25/800/400", filename: "blockchain-voting.jpg" },
    // 闪念内容专用图片 (ID 26-32)
    { url: "https://picsum.photos/id/26/800/400", filename: "sunset-lake.jpg" },
    { url: "https://picsum.photos/id/27/800/400", filename: "baking-ingredients.jpg" },
    { url: "https://picsum.photos/id/28/800/400", filename: "egg-whites.jpg" },
    { url: "https://picsum.photos/id/29/800/400", filename: "matcha-cake.jpg" },
    { url: "https://picsum.photos/id/30/800/600", filename: "project-structure.png" },
    { url: "https://picsum.photos/id/31/800/600", filename: "docker-dashboard.png" },
    { url: "https://picsum.photos/id/32/800/400", filename: "attachment-only.jpg" },
    // 闪念附件专用图片 (ID 33-38)
    { url: "https://picsum.photos/id/33/800/400", filename: "memo-attachment-1.jpg" },
    { url: "https://picsum.photos/id/34/800/400", filename: "memo-attachment-2.jpg" },
    { url: "https://picsum.photos/id/35/800/400", filename: "memo-attachment-3.jpg" },
    { url: "https://picsum.photos/id/36/800/400", filename: "memo-attachment-4.jpg" },
    { url: "https://picsum.photos/id/37/800/400", filename: "memo-attachment-5.jpg" },
    { url: "https://picsum.photos/id/38/800/400", filename: "memo-attachment-6.jpg" },
  ];

  // 创建 SVG 测试图片
  const svgTestDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <!-- 背景 -->
  <rect width="400" height="300" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>

  <!-- 标题 -->
  <text x="200" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#212529">SVG 图片渲染测试</text>

  <!-- 流程图 -->
  <g transform="translate(50, 60)">
    <!-- 开始节点 -->
    <ellipse cx="50" cy="30" rx="40" ry="20" fill="#28a745" stroke="#1e7e34" stroke-width="2"/>
    <text x="50" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="white">开始</text>

    <!-- 箭头1 -->
    <line x1="50" y1="50" x2="50" y2="80" stroke="#6c757d" stroke-width="2" marker-end="url(#arrowhead)"/>

    <!-- 处理节点 -->
    <rect x="10" y="90" width="80" height="40" rx="5" fill="#007bff" stroke="#0056b3" stroke-width="2"/>
    <text x="50" y="115" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="white">SVG处理</text>

    <!-- 箭头2 -->
    <line x1="50" y1="130" x2="50" y2="160" stroke="#6c757d" stroke-width="2" marker-end="url(#arrowhead)"/>

    <!-- 结束节点 -->
    <ellipse cx="50" cy="180" rx="40" ry="20" fill="#dc3545" stroke="#c82333" stroke-width="2"/>
    <text x="50" y="185" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="white">完成</text>
  </g>

  <!-- 右侧图表 -->
  <g transform="translate(200, 60)">
    <!-- 饼图 -->
    <circle cx="75" cy="75" r="50" fill="#ffc107" stroke="#e0a800" stroke-width="2"/>
    <path d="M 75 25 A 50 50 0 0 1 125 75 L 75 75 Z" fill="#17a2b8" stroke="#138496" stroke-width="2"/>
    <path d="M 125 75 A 50 50 0 0 1 75 125 L 75 75 Z" fill="#6f42c1" stroke="#5a32a3" stroke-width="2"/>

    <!-- 图例 -->
    <rect x="20" y="140" width="15" height="15" fill="#ffc107"/>
    <text x="40" y="152" font-family="Arial, sans-serif" font-size="12" fill="#212529">数据A (50%)</text>

    <rect x="20" y="160" width="15" height="15" fill="#17a2b8"/>
    <text x="40" y="172" font-family="Arial, sans-serif" font-size="12" fill="#212529">数据B (25%)</text>

    <rect x="20" y="180" width="15" height="15" fill="#6f42c1"/>
    <text x="40" y="192" font-family="Arial, sans-serif" font-size="12" fill="#212529">数据C (25%)</text>
  </g>

  <!-- 箭头标记定义 -->
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#6c757d"/>
    </marker>
  </defs>

  <!-- 底部说明 -->
  <text x="200" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#6c757d">这是一个SVG矢量图形，应该被转换为PNG并添加水印</text>
</svg>`;

  // 准备所有下载任务
  const webdavArticleImages = images.slice(0, 5); // WebDAV 文章图片 (ID 1-5)
  const webdavProjectImages = images.slice(10, 15); // WebDAV 项目图片 (ID 16-20)
  const memoContentImages = images.slice(20, 26); // 闪念内容图片 (ID 26-31)
  const memoAttachmentImages = images.slice(26); // 闪念附件图片 (ID 33-38)

  const localArticleImages = images.slice(5, 10); // 本地文章图片 (ID 11-15)
  const localProjectImages = images.slice(15, 20); // 本地项目图片 (ID 21-25)
  const helloWorldImage = images.find((img) => img.filename === "hello-world.jpg"); // hello-world 图片，统一放在 blog/assets

  // 创建所有下载任务
  const downloadTasks = [
    // WebDAV 文章图片 - 放在 webdav/blog/assets
    ...webdavArticleImages.map((image) => ({
      url: image.url,
      filePath: join(webdavDir, "blog", "assets", image.filename),
      filename: image.filename,
    })),
    // WebDAV 项目图片 - 放在 webdav/projects/assets
    ...webdavProjectImages.map((image) => ({
      url: image.url,
      filePath: join(webdavDir, "projects", "assets", image.filename),
      filename: image.filename,
    })),
    // 闪念内容图片 - 放在 Memos/assets (因为文章在 Memos 目录下)
    ...memoContentImages.map((image) => ({
      url: image.url,
      filePath: join(webdavDir, "memos", "assets", image.filename),
      filename: image.filename,
    })),
    // 闪念附件图片 - 放在 Memos/assets
    ...memoAttachmentImages.map((image) => ({
      url: image.url,
      filePath: join(webdavDir, "memos", "assets", image.filename),
      filename: image.filename,
    })),
    // 本地文章图片 - 放在 local/blog/assets
    ...localArticleImages.map((image) => ({
      url: image.url,
      filePath: join(localDir, "blog", "assets", image.filename),
      filename: image.filename,
    })),
    // 本地项目图片 - 放在 local/projects/assets
    ...localProjectImages.map((image) => ({
      url: image.url,
      filePath: join(localDir, "projects", "assets", image.filename),
      filename: image.filename,
    })),
    // hello-world 图片 - 统一放在 local/blog/assets
    ...(helloWorldImage
      ? [
          {
            url: helloWorldImage.url,
            filePath: join(localDir, "blog", "assets", helloWorldImage.filename),
            filename: helloWorldImage.filename,
          },
        ]
      : []),
  ];

  // 真正的并行下载所有图片（保持5个并发）
  console.log(`开始并行下载 ${downloadTasks.length} 张图片...`);

  let completedCount = 0;
  const totalCount = downloadTasks.length;
  const results: Array<{ success: boolean; filename: string; error?: any }> = [];

  const downloadWithProgress = async (task: any) => {
    try {
      await downloadImage(task.url, task.filePath);
      completedCount++;
      console.log(
        `📸 进度: ${completedCount}/${totalCount} (${Math.round((completedCount / totalCount) * 100)}%) - ✅ ${task.filename}`
      );
      return { success: true, filename: task.filename };
    } catch (error) {
      completedCount++;
      console.log(
        `📸 进度: ${completedCount}/${totalCount} (${Math.round((completedCount / totalCount) * 100)}%) - ❌ ${task.filename}: ${error instanceof Error ? error.message : error}`
      );
      return { success: false, filename: task.filename, error };
    }
  };

  // 使用 Promise.allSettled 确保真正并行，但限制并发数
  const concurrencyLimit = 5;
  const executing: Promise<any>[] = [];

  for (const task of downloadTasks) {
    const promise = downloadWithProgress(task).then((result) => {
      results.push(result);
      return result;
    });

    executing.push(promise);

    if (executing.length >= concurrencyLimit) {
      await Promise.race(executing);
      executing.splice(executing.indexOf(promise), 1);
    }
  }

  // 等待所有剩余任务完成
  await Promise.all(executing);

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(`\n📸 图片下载完成: 成功 ${successCount} 张, 失败 ${failCount} 张`);

  // 创建 SVG 测试图片
  console.log("\n🎨 创建 SVG 测试图片...");
  const svgFilePath = join(webdavDir, "blog", "assets", "svg-test-diagram.svg");
  writeFileSync(svgFilePath, svgTestDiagram, "utf-8");
  console.log(`✅ svg-test-diagram.svg`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  // 确定环境
  const environment: "dev" | "test" = args.includes("--dev") ? "dev" : "test";
  const { WEBDAV_DIR, LOCAL_DIR } = getDataDirectories(environment);

  const envName = environment === "dev" ? "开发环境" : "测试环境";

  if (args.includes("--clean")) {
    const baseDir = environment === "dev" ? "dev-data" : "test-data";
    if (existsSync(baseDir)) {
      rmSync(baseDir, { recursive: true, force: true });
      console.log(`清理${envName}数据目录: ${baseDir}`);
    }
    return;
  }

  console.log(`开始生成${envName}测试数据...`);

  // 创建目录结构
  createDirectories(WEBDAV_DIR, LOCAL_DIR);

  // 下载测试图片
  await downloadTestImages(WEBDAV_DIR, LOCAL_DIR);

  // 生成数据
  const webdavPosts = generateWebDAVPosts();
  const localPosts = generateLocalPosts();
  const webdavProjects = generateProjects();
  const localProjects = generateLocalProjects();
  const localMemos = generateLocalMemos();
  const memos = generateMemos();

  // 追加 E2E 专用删除测试数据（各一条，避免与随机数据冲突）
  const now = new Date();
  memos.push({
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    public: true,
    tags: ["e2e", "delete", "webdav"],
    attachments: [],
    body: `# E2E 删除测试-WEBDAV\n\nseed for delete - webdav`,
  });

  localMemos.push({
    title: "E2E 删除测试-LOCAL",
    slug: generateSlug("E2E 删除测试-LOCAL"),
    publishDate: now,
    updateDate: now,
    draft: false,
    public: true,
    excerpt: "E2E delete seed",
    category: "闪念",
    tags: ["e2e", "delete", "local"],
    author: "Ivan Li",
    body: `# E2E 删除测试-LOCAL\n\nseed for delete - local`,
  });

  console.log(`\n生成 ${envName} WebDAV 测试数据...`);

  // WebDAV 文章
  webdavPosts.forEach((post, index) => {
    const { body, ...frontmatter } = post;
    const fileName = `${String(index + 1).padStart(2, "0")}-${post.slug}.md`;
    writeMarkdownFile(join(WEBDAV_DIR, "blog", fileName), frontmatter, body);
  });

  // WebDAV 项目
  webdavProjects.forEach((project, index) => {
    const { body, ...frontmatter } = project;
    const fileName = `${String(index + 1).padStart(2, "0")}-${project.slug}.md`;
    writeMarkdownFile(join(WEBDAV_DIR, "projects", fileName), frontmatter, body);
  });

  // WebDAV 备忘录
  memos.forEach((memo) => {
    const { body, ...frontmatter } = memo;
    const createdAt = new Date(frontmatter.createdAt);
    const fileName = generateMemoFilename(body, createdAt);
    writeMarkdownFile(join(WEBDAV_DIR, "memos", fileName), frontmatter, body);
  });

  console.log(`\n生成 ${envName} 本地测试数据...`);

  // 本地文章
  localPosts.forEach((post, index) => {
    const { body, ...frontmatter } = post;
    const fileName = `${String(index + 1).padStart(2, "0")}-${post.slug}.md`;
    writeMarkdownFile(join(LOCAL_DIR, "blog", fileName), frontmatter, body);
  });

  // 本地项目
  localProjects.forEach((project, index) => {
    const { body, ...frontmatter } = project;
    const fileName = `${String(index + 1).padStart(2, "0")}-${project.slug}.md`;
    writeMarkdownFile(join(LOCAL_DIR, "projects", fileName), frontmatter, body);
  });

  // 本地闪念
  localMemos.forEach((memo, index) => {
    const { body, ...frontmatter } = memo;
    const fileName = `${String(index + 1).padStart(2, "0")}-${memo.slug}.md`;
    writeMarkdownFile(join(LOCAL_DIR, "memos", fileName), frontmatter, body);
  });

  console.log(`\n✅ ${envName}测试数据生成完成！`);
  console.log(`\n📁 数据位置:`);
  console.log(`  - WebDAV 数据: ${WEBDAV_DIR}`);
  console.log(`  - 本地数据: ${LOCAL_DIR}`);
  console.log(`\n🚀 下一步: 运行 'bun run dev' 启动开发服务器`);
}

if (import.meta.main) {
  main().catch(console.error);
}
