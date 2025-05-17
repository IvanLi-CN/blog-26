# 速率限制提示改进计划

**任务：** 改进 `apps/web/src/pages/search.astro` 中超过速率限制时的界面提示，使其更美观友好，并使用 Daisy UI。同时，超过速率限制后不需要显示 `SearchAndChat` 组件。

**信息收集：**

*   查看 `apps/web/src/pages/search.astro` 的完整内容 (已完成)
*   查看 `apps/web/tailwind.config.js` 文件，了解 Daisy UI 的配置情况，以及项目中使用的主题色等。
*   查看 `apps/web/src/components/SearchAndChat.tsx` 文件，了解 `SearchAndChat` 组件的结构，以便在超出速率限制时能够正确地隐藏它。
*   查看 `apps/web/src/layouts/Layout.astro` 文件，了解整体布局结构，以便将错误提示信息更好地融入页面。

**错误提示方案：**

*   **位置：** 在 `SearchAndChat` 组件上方显示。
*   **样式：** 使用 Daisy UI 的 `alert-error` 样式，使其呈现为红色背景的错误提示框。
*   **内容：**
    *   **标题：** "请求过于频繁"
    *   **描述：** "您已超出速率限制，请稍后再试。"
*   **隐藏 `SearchAndChat` 组件：** 当 `errorMessage` 不为空时，不渲染 `SearchAndChat` 组件。

**修改 `apps/web/src/pages/search.astro` 的方案：**

1.  **修改第 47 行：** 将 `<SearchAndChat query={query} defaultResult={result} client:load />` 替换为：

    ```astro
    {errorMessage ? null : <SearchAndChat query={query} defaultResult={result} client:load />}
    ```

2.  **修改第 48 行：** 将 `<p class="text-red-500 text-center">{errorMessage}</p>` 替换为：

    ```astro
    {errorMessage && (
      <div class="alert alert-error">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>请求过于频繁，请稍后再试。</span>
      </div>
    )}
    ```

**Mermaid 图：**

```mermaid
graph LR
    A[开始] --> B{读取 tailwind.config.js, SearchAndChat.tsx, Layout.astro};
    B --> C{分析文件内容};
    C --> D{设计错误提示方案};
    D --> E{修改 apps/web/src/pages/search.astro};
    E --> F{测试};
    F --> G[完成];