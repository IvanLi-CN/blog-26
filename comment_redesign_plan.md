# 评论区界面改进最终方案

本计划旨在通过前后端协作，优化评论区布局，引入用户头像，并提升整体用户体验。

---

### 第 1 步：创建共享工具函数

为了避免代码重复，并集中处理头像生成逻辑，我们将创建一个新的工具文件。

-   **操作**: 新建文件 `src/lib/avatar.ts`
-   **内容**:
    ```typescript
    import { createHash } from 'node:crypto';

    /**
     * 根据邮箱生成 Gravatar 头像 URL。
     * @param email 用户的邮箱地址。
     * @returns Gravatar 头像的 URL。
     */
    export function getAvatarUrl(email: string): string {
      const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
      // d=retro 参数为没有 Gravatar 账户的用户生成一个独特的复古像素风头像
      return `https://www.gravatar.com/avatar/${hash}?d=retro`;
    }
    ```

---

### 第 2 步：后端 API 改造

**目标**: 让所有返回用户或作者信息的 API 端点都包含 `avatarUrl` 字段。

1.  **修改评论获取API**: `src/pages/api/comments/index.ts`
    -   **引入**: `import { getAvatarUrl } from '~/lib/avatar';`
    -   **修改 `getComments` 函数**:
        1.  在 `db.select()` 中，从 `users` 表额外查询 `email` 字段。
        2.  在返回数据前，遍历评论结果，使用 `getAvatarUrl(author.email)` 为每一条评论的作者生成 `avatarUrl`。

2.  **修改用户认证API**: `src/pages/api/auth/me.ts`
    -   **引入**: `import { getAvatarUrl } from '~/lib/avatar';`
    -   **修改 `GET` 处理函数**:
        1.  在 `verifyJwt` 成功解码 `payload` 后，获取 `payload.email`。
        2.  在构建返回的 `userInfo` 对象时，调用 `getAvatarUrl(payload.email)` 来添加 `avatarUrl` 字段。

---

### 第 3 步：前端类型与组件更新

**目标**: 在前端UI中消费新的数据和实现新的布局。

1.  **更新类型定义**: `src/components/comments/types.ts`
    -   向 `Author` 和 `UserInfo` 接口中分别添加 `avatarUrl: string;` 字段。

2.  **修改评论表单**: `src/components/comments/CommentForm.tsx`
    -   当用户登录时 (`userInfo` 存在)，在文本输入框上方创建一个用户信息区块，展示用户头像 (`userInfo.avatarUrl`)、昵称、邮箱及“登出”按钮。

3.  **修改评论条目**: `src/components/comments/CommentItem.tsx`
    -   **卡片式布局**: 为根 `div` 添加背景、圆角和阴影，形成卡片效果。
    -   **Flex 布局**: 使用 Flexbox 将头像和评论内容左右分离。
    -   **头像**: 在左侧使用 `<img>` 标签和 `comment.author.avatarUrl` 展示头像。
    -   **信息重构**: 在右侧重新组织作者信息，分为“昵称+状态”和“时间”两行。
    -   **回复缩进**: 为嵌套的回复列表和表单增加左边距，以体现层级关系。

---

### 实施流程图

```mermaid
graph TD
    A[1. 新建 `src/lib/avatar.ts`] --> B[2. 修改后端 API];
    subgraph B
      direction LR
      B1[comments/index.ts] --> B_Shared(使用 getAvatarUrl);
      B2[auth/me.ts] --> B_Shared;
    end

    B --> C[3. 修改前端类型];
    subgraph C
      C1[types.ts: 添加 avatarUrl]
    end

    C --> D[4. 修改前端组件];
    subgraph D
      direction TB
      D1[CommentItem.tsx: 实现卡片布局] --> D_Final[UI展现];
      D2[CommentForm.tsx: 显示用户信息] --> D_Final;
    end

    A --> B_Shared;
