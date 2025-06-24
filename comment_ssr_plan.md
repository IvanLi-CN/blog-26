# 评论功能改造计划：Cookie 认证与服务端渲染 (SSR)

本计划旨在将现有的评论功能重构为支持 **Cookie 认证** 和 **服务端渲染 (SSR)**，同时保留现有业务逻辑。

### **核心目标**

1.  **认证方式变更**：将用户身份凭证（JWT）的传输方式从 `Authorization` 请求头改为 `HttpOnly` Cookie，以提高安全性。
2.  **实现服务端渲染 (SSR)**：博客文章页首次加载时，评论列表将由服务器直接渲染在 HTML 中，提升首屏加载速度和 SEO 友好性。
3.  **保留动态交互**：用户提交新评论、加载更多评论等操作将继续在客户端进行，以保证良好的用户体验。

---

### **改造计划**

整个计划分为三个主要部分：**后端 API 改造**、**服务端渲染集成** 和 **前端逻辑调整**。

#### **Part 1: 后端 API 改造 (`/api/comments`)**

我们将修改 API 端点，使其能够通过 Cookie 来处理认证。

*   **`1.1: 从 Cookie 读取 JWT`**
    *   **文件**: `src/pages/api/comments/index.ts`
    *   **操作**: 修改 `POST` 和 `GET` 方法。使用 Astro 的 `Astro.cookies.get('token')` 来获取 JWT，替换掉从 `request.headers.get('Authorization')` 读取的逻辑。

*   **`1.2: 将 JWT 存入 Cookie`**
    *   **文件**: `src/pages/api/comments/index.ts`
    *   **操作**: 在 `POST` 方法中，当为新用户生成 JWT 后，使用 `Astro.cookies.set()` 将其存入一个名为 `token` 的 Cookie。
    *   **Cookie 配置**:
        *   `httpOnly: true`: 防止客户端脚本访问，增加安全性。
        *   `path: '/'`: 在整个站点生效。
        *   `maxAge`: 设置一个较长的过期时间，例如一年 (`31536000`)。
        *   `secure: import.meta.env.PROD`: 只在生产环境中通过 HTTPS 传输。

*   **`1.3: (可选) 添加登出接口`**
    *   **文件**: `src/pages/api/auth/logout.ts` (新文件)
    *   **操作**: 创建一个新的 API 路由，当用户请求该接口时，使用 `Astro.cookies.delete('token')` 来清除认证 Cookie。

#### **Part 2: 服务端渲染 (SSR) 集成**

这是实现 SSR 的核心步骤，我们将在 Astro 组件的服务器端获取初始数据。

*   **`2.1: 在 Astro 组件中获取初始评论`**
    *   **文件**: `src/components/blog/SinglePost.astro`
    *   **操作**:
        1.  在 `---` 代码块中，通过 `Astro.cookies.get('token')` 获取用户令牌。
        2.  根据令牌解析出 `currentUserId`。
        3.  直接调用 `src/pages/api/comments/index.ts` 中的 `getComments` 函数，传入 `post.slug` 和 `currentUserId` 来获取第一页的评论数据。
        4.  将获取到的初始评论数据 (`initialComments`) 和用户信息 (`userInfo`)作为 props 传递给 `<CommentSection />` 组件。

*   **`2.2: 使用 `client:idle` 指令`**
    *   **文件**: `src/components/blog/SinglePost.astro`
    *   **操作**: 将 `<CommentSection client:load />` 修改为 `<CommentSection {...props} client:idle />`。`client:idle` 指令可以在服务端渲染组件的同时，在浏览器空闲时加载客户端脚本，从而激活组件的交互功能。

#### **Part 3: 前端逻辑调整 (`React Components`)**

为了适应 SSR，我们需要调整前端 React 组件的数据流和状态管理。

*   **`3.1: 改造 `CommentSection` 和 `useComments``**
    *   **文件**: `src/components/comments/CommentSection.tsx`, `src/components/comments/hooks.ts`
    *   **操作**:
        1.  让 `CommentSection` 组件接收 `initialComments` 和 `userInfo` props。
        2.  修改 `useComments` hook，使其可以接收 `initialComments` 作为初始状态。这样，组件首次渲染时就不需要再发送一次 `GET` 请求了。
        3.  `loadMore` 函数的逻辑保持不变，它将继续从客户端获取后续页码的评论。

*   **`3.2: 改造 `useUserInfo` 和 `usePostComment``**
    *   **文件**: `src/components/comments/hooks.ts`
    *   **操作**:
        1.  `useUserInfo` hook 不再需要从 `localStorage` 中读取或保存 token。它的职责简化为管理从 props 传入的用户信息状态。
        2.  `usePostComment` hook 在提交评论时，不再需要手动附带 token。浏览器会自动将 `HttpOnly` Cookie 加入到请求中。
        3.  当 `postComment` 成功后，需要调用 `useComments` hook 中的方法来刷新评论列表（例如，重新获取第一页），以便显示用户刚刚提交的、状态为 `pending` 的评论。

---

### **流程图 (Mermaid)**

下面的流程图展示了改造后的数据请求流程。

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Server (Astro)
    participant API as API (/api/comments)
    participant DB as Database

    %% Initial Page Load (SSR)
    Note over B, S: 1. 页面首次加载 (SSR)
    B->>+S: GET /blog/my-post
    S->>S: 从请求中读取 'token' Cookie
    S->>S: 调用 getComments(slug, userId)
    S->>+DB: 查询评论数据
    DB-->>-S: 返回评论列表
    S->>S: 渲染包含评论的完整 HTML
    S-->>-B: 返回 HTML 页面

    %% Submitting a new comment (Client-side)
    Note over B, API: 2. 用户提交新评论 (客户端)
    B->>+API: POST /api/comments (自动携带 Cookie)
    API->>API: 验证 Cookie, 解析 userId
    API->>+DB: 插入新评论 (status: 'pending')
    DB-->>-API: 确认插入
    API-->>-B: 返回成功响应
    B->>+API: GET /api/comments (刷新列表)
    API->>API: 验证 Cookie, 解析 userId
    API->>+DB: 查询评论 (包含用户未审核的)
    DB-->>-API: 返回新的评论列表 (JSON)
    API-->>-B: 返回 JSON 数据
    B->>B: React 更新评论区 UI
