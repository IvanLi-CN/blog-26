#!/usr/bin/env bun

/**
 * 生成测试数据脚本
 * 创建用于开发和测试的示例内容
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nanoid } from 'nanoid';

// 下载图片到本地
async function downloadImage(url: string, filePath: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    writeFileSync(filePath, buffer);
    console.log(`下载图片: ${filePath}`);
  } catch (error) {
    console.warn(`图片下载失败 ${url}:`, error);
  }
}

// 测试数据配置
const TEST_DATA_DIR = 'test-data';
const WEBDAV_DIR = join(TEST_DATA_DIR, 'webdav');
const LOCAL_DIR = join(TEST_DATA_DIR, 'local');
// const SRC_CONTENT_DIR = join('src', 'content'); // 暂时未使用

// 生成随机日期（过去30天内）
function generateRandomDate(): Date {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const randomTime = thirtyDaysAgo.getTime() + Math.random() * (now.getTime() - thirtyDaysAgo.getTime());
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
  const cleaned = title.replace(/[^\w\u4e00-\u9fa5\s\-]/g, '');
  const withUnderscores = cleaned.replace(/\s+/g, '_');
  return withUnderscores.substring(0, 50);
}

// 生成闪念文件名（与实际应用逻辑一致）
function generateMemoFilename(content: string, createdAt: Date): string {
  const datePrefix = `${createdAt.getFullYear()}${(createdAt.getMonth() + 1).toString().padStart(2, '0')}${createdAt.getDate().toString().padStart(2, '0')}`;

  const title = extractFirstH1Title(content);
  let filenamePart: string;

  if (title) {
    filenamePart = cleanTitleForFilename(title);
  } else {
    filenamePart = nanoid(8);
  }

  return `${datePrefix}_${filenamePart}.md`;
}

// 生成本地文章数据
function generateLocalPosts() {
  return [
    {
      title: 'React Hooks 深度解析',
      slug: 'react-hooks-deep-dive',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '深入理解React Hooks的工作原理，掌握函数组件的状态管理和副作用处理。',
      category: '前端框架',
      tags: ['React', 'Hooks', '函数组件'],
      author: 'Ivan Li',
      image: './assets/react-hooks.jpg',
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
      title: 'TypeScript 高级类型系统',
      slug: 'typescript-advanced-types',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '探索TypeScript的高级类型特性，提升代码的类型安全性和开发效率。',
      category: '编程语言',
      tags: ['TypeScript', '类型系统', '泛型'],
      author: 'Ivan Li',
      image: './assets/typescript-advanced.jpg',
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
      title: 'GraphQL API 设计最佳实践',
      slug: 'graphql-api-best-practices',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '学习如何设计高效、可维护的GraphQL API，包括Schema设计和性能优化。',
      category: 'API设计',
      tags: ['GraphQL', 'API', 'Schema'],
      author: 'Ivan Li',
      image: './assets/graphql-api.jpg',
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
      title: 'Kubernetes 集群管理实战',
      slug: 'kubernetes-cluster-management',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: true,
      public: false,
      excerpt: '深入学习Kubernetes集群的部署、管理和监控，掌握容器编排的核心技能。',
      category: '运维',
      tags: ['Kubernetes', '容器编排', '集群管理'],
      author: 'Ivan Li',
      image: './assets/kubernetes-cluster.jpg',
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
      title: 'Redis 缓存策略与优化',
      slug: 'redis-caching-strategies',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '掌握Redis的各种缓存策略，优化应用性能和数据一致性。',
      category: '数据库',
      tags: ['Redis', '缓存', '性能优化'],
      author: 'Ivan Li',
      image: './assets/redis-caching.jpg',
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
      title: 'Vue.js 3 组合式API深度解析',
      slug: 'vue3-composition-api-deep-dive',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '全面解析Vue.js 3的组合式API，包括响应式原理、生命周期和最佳实践。',
      category: '前端框架',
      tags: ['Vue.js', '组合式API', '前端开发'],
      author: 'Ivan Li',
      image: './assets/vue3-composition-api.jpg',
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
      title: 'Svelte 5 新特性全面解析',
      slug: 'svelte-5-new-features',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '深入了解Svelte 5的革命性更新，包括Runes系统和性能优化。',
      category: '前端框架',
      tags: ['Svelte', 'Runes', '编译器'],
      author: 'Ivan Li',
      image: './assets/svelte5-features.jpg',
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
      title: 'Node.js 性能优化实战',
      slug: 'nodejs-performance-optimization',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '分享 Node.js 应用性能优化的实用技巧和工具。',
      category: '后端',
      tags: ['Node.js', '性能优化', '后端开发'],
      author: 'Ivan Li',
      image: './assets/nodejs-performance.jpg',
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
      title: 'Docker 容器化最佳实践',
      slug: 'docker-containerization-best-practices',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: true,
      public: false,
      excerpt: '容器化部署的完整指南，从 Dockerfile 编写到生产环境部署。',
      category: 'DevOps',
      tags: ['Docker', '容器化', 'DevOps'],
      author: 'Ivan Li',
      image: './assets/docker-best-practices.jpg',
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
      title: 'Web 安全防护指南',
      slug: 'web-security-protection-guide',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '全面的 Web 应用安全防护策略，保护你的应用免受常见攻击。',
      category: '安全',
      tags: ['Web安全', '防护', '网络安全'],
      author: 'Ivan Li',
      image: './assets/web-security.jpg',
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
  ];
}

// 生成本地项目数据
function generateLocalProjects() {
  return [
    {
      title: '开源组件库',
      slug: 'open-source-component-library',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '基于 React 和 TypeScript 构建的现代化组件库，提供丰富的 UI 组件和设计系统。',
      category: '开源项目',
      tags: ['React', 'TypeScript', '组件库', 'UI'],
      author: 'Ivan Li',
      image: './assets/component-library.jpg',
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
      title: '全栈电商平台',
      slug: 'fullstack-ecommerce-platform',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '使用 Next.js 和 Node.js 构建的现代化电商平台，支持多租户和移动端。',
      category: '全栈项目',
      tags: ['Next.js', 'Node.js', '电商', '全栈'],
      author: 'Ivan Li',
      image: './assets/ecommerce-platform.jpg',
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
      title: 'DevOps 自动化工具链',
      slug: 'devops-automation-toolchain',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '基于 GitLab CI/CD 和 Kubernetes 的完整 DevOps 自动化解决方案。',
      category: 'DevOps',
      tags: ['GitLab', 'Kubernetes', 'CI/CD', '自动化'],
      author: 'Ivan Li',
      image: './assets/devops-toolchain.jpg',
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
      title: '机器学习推荐系统',
      slug: 'ml-recommendation-system',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: true,
      public: false,
      excerpt: '基于深度学习的个性化推荐系统，支持实时推荐和 A/B 测试。',
      category: '机器学习',
      tags: ['Python', 'TensorFlow', '推荐系统', 'ML'],
      author: 'Ivan Li',
      image: './assets/ml-recommendation.jpg',
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
      title: '区块链投票系统',
      slug: 'blockchain-voting-system',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '基于以太坊智能合约的去中心化投票系统，确保投票的透明性和不可篡改性。',
      category: '区块链',
      tags: ['Solidity', 'Ethereum', '智能合约', 'Web3'],
      author: 'Ivan Li',
      image: './assets/blockchain-voting.jpg',
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
      title: '个人博客系统',
      slug: 'personal-blog-system',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '基于 Astro 5.0 构建的现代化个人博客系统，支持多数据源和 AI 功能。',
      category: '全栈项目',
      tags: ['Astro', 'TypeScript', 'SQLite', 'WebDAV'],
      author: 'Ivan Li',
      image: './assets/blog-system.jpg',
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
      title: 'AI 驱动的代码审查工具',
      slug: 'ai-powered-code-review-tool',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '利用大语言模型自动进行代码审查，提高代码质量和开发效率。',
      category: '开发工具',
      tags: ['AI', 'Code Review', 'LLM', 'DevOps'],
      author: 'Ivan Li',
      image: './assets/code-review-tool.jpg',
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
      title: '微服务架构实践平台',
      slug: 'microservices-architecture-platform',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '基于 Kubernetes 的微服务架构实践平台，包含服务发现、配置管理、监控等完整功能。',
      category: '架构设计',
      tags: ['微服务', 'Kubernetes', '架构', 'DevOps'],
      author: 'Ivan Li',
      image: './assets/microservices-platform.jpg',
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
      title: '实时数据可视化大屏',
      slug: 'realtime-data-visualization-dashboard',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: false,
      public: true,
      excerpt: '基于 WebSocket 和 D3.js 的实时数据可视化大屏系统，支持多种图表类型和自定义配置。',
      category: '数据可视化',
      tags: ['数据可视化', 'WebSocket', 'D3.js', '实时系统'],
      author: 'Ivan Li',
      image: './assets/data-visualization.jpg',
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
      title: '智能聊天机器人平台',
      slug: 'intelligent-chatbot-platform',
      publishDate: generateRandomDate(),
      updateDate: generateRandomDate(),
      draft: true,
      public: false,
      excerpt: '基于大语言模型的智能聊天机器人平台，支持多轮对话、知识库集成和个性化定制。',
      category: 'AI 应用',
      tags: ['AI', '聊天机器人', 'NLP', '大语言模型'],
      author: 'Ivan Li',
      image: './assets/chatbot-platform.jpg',
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

// 生成备忘录数据
function generateMemos() {
  const now = new Date();
  const memos: any[] = [];

  for (let i = 0; i < 5; i++) {
    const createdAt = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
    const updatedAt = new Date(createdAt.getTime() + Math.random() * 12 * 60 * 60 * 1000);

    memos.push({
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      public: i % 2 === 0, // 交替公开/私有
      tags:
        i === 0
          ? ['技术', '学习']
          : i === 1
            ? ['生活', '思考']
            : i === 2
              ? ['工作', '项目']
              : i === 3
                ? ['阅读', '笔记']
                : ['随想'],
      attachments:
        i === 1
          ? [
              {
                filename: 'screenshot.png',
                path: '/assets/screenshot.png',
                contentType: 'image/png',
                size: 45678,
                isImage: true,
              },
            ]
          : [],
      body:
        i === 0
          ? `# 学习 React 18 新特性

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

#技术 #React #前端`
          : i === 1
            ? `# 周末的思考

今天在公园散步时想到一些关于工作和生活平衡的问题。

现代社会的快节奏让我们很容易陷入忙碌的陷阱，但真正重要的是：

- 保持内心的平静
- 珍惜与家人朋友的时光
- 持续学习和成长
- 关注身心健康

有时候慢下来，反而能走得更远。

#生活 #思考 #平衡`
            : i === 2
              ? `# 项目重构进展

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

#工作 #项目 #重构`
              : i === 3
                ? `# 《深入理解计算机系统》读书笔记

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

#阅读 #笔记 #计算机系统`
                : `最近在思考什么是真正的创造力。

创造力不仅仅是从无到有的创新，更多时候是：

- 重新组合已有的元素
- 从不同角度看待问题
- 跨领域的知识迁移
- 打破固有的思维模式

就像乔布斯说的："创造力就是把事物联系起来。"

保持好奇心，多元化学习，或许就是培养创造力的最好方式。

#随想 #创造力 #思维`,
    });
  }

  return memos;
}

// 创建目录
function createDirectories() {
  const dirs = [
    WEBDAV_DIR,
    join(WEBDAV_DIR, 'projects'),
    join(WEBDAV_DIR, 'Memos'),
    join(WEBDAV_DIR, 'assets'), // WebDAV图片目录
    LOCAL_DIR,
    join(LOCAL_DIR, 'projects'),
    join(LOCAL_DIR, 'assets'), // 本地图片目录
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
        if (typeof value[0] === 'object' && value[0] !== null) {
          // 对象数组，使用 YAML 格式
          const yamlArray = value
            .map((item) => {
              const itemYaml = Object.entries(item)
                .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
                .join('\n');
              return `  -\n${itemYaml}`;
            })
            .join('\n');
          return `${key}:\n${yamlArray}`;
        } else {
          // 简单数组
          return `${key}:\n${value.map((item) => `  - ${item}`).join('\n')}`;
        }
      } else if (value instanceof Date) {
        return `${key}: ${value.toISOString()}`;
      } else if (typeof value === 'string' && value.includes('\n')) {
        return `${key}: |\n  ${value.replace(/\n/g, '\n  ')}`;
      } else {
        return `${key}: ${JSON.stringify(value)}`;
      }
    })
    .join('\n');

  const content = `---\n${yamlFrontmatter}\n---\n\n${body}`;
  writeFileSync(filePath, content, 'utf-8');
  console.log(`创建文件: ${filePath}`);
}

// 下载测试图片
async function downloadTestImages() {
  console.log('\n📸 下载测试图片...');

  const images = [
    // WebDAV 文章图片
    { url: 'https://picsum.photos/id/1/800/400', filename: 'vue3-composition-api.jpg' },
    { url: 'https://picsum.photos/id/2/800/400', filename: 'svelte5-features.jpg' },
    { url: 'https://picsum.photos/id/3/800/400', filename: 'nodejs-performance.jpg' },
    { url: 'https://picsum.photos/id/4/800/400', filename: 'docker-best-practices.jpg' },
    { url: 'https://picsum.photos/id/5/800/400', filename: 'web-security.jpg' },
    // 本地文章图片
    { url: 'https://picsum.photos/id/11/800/400', filename: 'react-hooks.jpg' },
    { url: 'https://picsum.photos/id/12/800/400', filename: 'typescript-advanced.jpg' },
    { url: 'https://picsum.photos/id/13/800/400', filename: 'graphql-api.jpg' },
    { url: 'https://picsum.photos/id/14/800/400', filename: 'kubernetes-cluster.jpg' },
    { url: 'https://picsum.photos/id/15/800/400', filename: 'redis-caching.jpg' },
    // WebDAV 项目图片
    { url: 'https://picsum.photos/id/16/800/400', filename: 'blog-system.jpg' },
    { url: 'https://picsum.photos/id/17/800/400', filename: 'code-review-tool.jpg' },
    { url: 'https://picsum.photos/id/18/800/400', filename: 'microservices-platform.jpg' },
    { url: 'https://picsum.photos/id/19/800/400', filename: 'data-visualization.jpg' },
    { url: 'https://picsum.photos/id/20/800/400', filename: 'chatbot-platform.jpg' },
    // 本地项目图片
    { url: 'https://picsum.photos/id/21/800/400', filename: 'component-library.jpg' },
    { url: 'https://picsum.photos/id/22/800/400', filename: 'ecommerce-platform.jpg' },
    { url: 'https://picsum.photos/id/23/800/400', filename: 'devops-toolchain.jpg' },
    { url: 'https://picsum.photos/id/24/800/400', filename: 'ml-recommendation.jpg' },
    { url: 'https://picsum.photos/id/25/800/400', filename: 'blockchain-voting.jpg' },
  ];

  // 下载WebDAV图片
  const webdavImages = images.slice(0, 10); // 前10张给WebDAV
  for (const image of webdavImages) {
    const filePath = join(WEBDAV_DIR, 'assets', image.filename);
    await downloadImage(image.url, filePath);
  }

  // 下载本地图片
  const localImages = images.slice(10); // 后面的给本地
  for (const image of localImages) {
    const filePath = join(LOCAL_DIR, 'assets', image.filename);
    await downloadImage(image.url, filePath);
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--clean')) {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
      console.log(`清理测试数据目录: ${TEST_DATA_DIR}`);
    }
    return;
  }

  console.log('开始生成测试数据...');

  // 创建目录结构
  createDirectories();

  // 下载测试图片
  await downloadTestImages();

  // 生成数据
  const webdavPosts = generateWebDAVPosts();
  const localPosts = generateLocalPosts();
  const webdavProjects = generateProjects();
  const localProjects = generateLocalProjects();
  const memos = generateMemos();

  console.log('\n生成 WebDAV 测试数据...');

  // WebDAV 文章
  webdavPosts.forEach((post, index) => {
    const { body, ...frontmatter } = post;
    const fileName = `${String(index + 1).padStart(2, '0')}-${post.slug}.md`;
    writeMarkdownFile(join(WEBDAV_DIR, fileName), frontmatter, body);
  });

  // WebDAV 项目
  webdavProjects.forEach((project, index) => {
    const { body, ...frontmatter } = project;
    const fileName = `${String(index + 1).padStart(2, '0')}-${project.slug}.md`;
    writeMarkdownFile(join(WEBDAV_DIR, 'projects', fileName), frontmatter, body);
  });

  // WebDAV 备忘录
  memos.forEach((memo) => {
    const { body, ...frontmatter } = memo;
    const createdAt = new Date(frontmatter.createdAt);
    const fileName = generateMemoFilename(body, createdAt);
    writeMarkdownFile(join(WEBDAV_DIR, 'Memos', fileName), frontmatter, body);
  });

  console.log('\n生成本地测试数据...');

  // 本地文章
  localPosts.forEach((post, index) => {
    const { body, ...frontmatter } = post;
    const fileName = `${String(index + 1).padStart(2, '0')}-${post.slug}.md`;
    writeMarkdownFile(join(LOCAL_DIR, fileName), frontmatter, body);
  });

  // 本地项目
  localProjects.forEach((project, index) => {
    const { body, ...frontmatter } = project;
    const fileName = `${String(index + 1).padStart(2, '0')}-${project.slug}.md`;
    writeMarkdownFile(join(LOCAL_DIR, 'projects', fileName), frontmatter, body);
  });

  console.log('\n✅ 测试数据生成完成！');
  console.log(`\n📁 数据位置:`);
  console.log(`  - WebDAV 数据: ${WEBDAV_DIR}`);
  console.log(`  - 本地数据: ${LOCAL_DIR}`);
  console.log(`\n🚀 下一步:`);
  console.log(`  1. 运行 'bun run webdav:start' 启动 WebDAV 服务器`);
  console.log(`  2. 配置环境变量指向本地 WebDAV 服务器`);
  console.log(`  3. 运行 'bun run dev' 启动开发服务器`);
}

if (import.meta.main) {
  main().catch(console.error);
}
