# Header UI 更新计划

## 目标

1.  调整桌面端 Header 布局，将搜索框移动到 Tag 链接和主题切换按钮之间。
2.  在用户提交搜索时（桌面端和移动端），添加加载指示器反馈。

## 详细步骤

### 1. 调整 Header 布局 (桌面端)

*   **文件:** [`src/components/widgets/Header.astro`](src/components/widgets/Header.astro)
*   **操作:**
    *   定位到桌面视图的 `div.actions` (大约在 [第 104 行](src/components/widgets/Header.astro:104))。
    *   将 `<SearchBox />` 组件的引用移到 `<ToggleTheme />` 组件引用 *之前*。

### 2. 添加搜索提交加载指示器

*   **文件:** [`src/components/common/SearchBox.astro`](src/components/common/SearchBox.astro)
*   **操作:**
    *   **HTML:**
        *   在桌面端表单的提交按钮 (`<button type="submit">`) 旁边添加一个 `<span>` 或 `<div>` 作为加载指示器容器，初始设置为 `hidden`。
        *   在移动端模态框表单的提交按钮 (`<button type="submit">`) 旁边也添加一个类似的加载指示器容器。
        *   示例: `<span class="loading loading-spinner loading-xs hidden ml-2"></span>` (需要 Tailwind/DaisyUI 支持，或自定义 CSS)
    *   **JavaScript:**
        *   获取两个表单元素（桌面端和移动端模态框内）。
        *   为每个表单添加 `submit` 事件监听器。
        *   在 `submit` 事件回调函数中：
            *   找到对应的加载指示器元素，移除 `hidden` 类使其可见。
            *   (可选) 禁用提交按钮。
            *   允许表单的默认提交行为继续（页面将跳转到 `/search`）。
    *   **CSS:**
        *   如果未使用 UI 库的加载组件，需要添加 CSS 来定义加载指示器的样式和动画（例如 `@keyframes` 实现旋转）。

## 流程图

```mermaid
graph TD
    subgraph "任务1: 调整 Header 布局"
        A[修改 Header.astro] --> B[将 SearchBox 移到 ToggleTheme 前面];
    end

    subgraph "任务2: 添加加载指示器"
        C[修改 SearchBox.astro] --> D[添加 HTML 元素 (加载指示器)];
        D --> E[添加 CSS 样式 (动画, 初始隐藏)];
        E --> F[添加 JavaScript 监听 form submit];
        F --> G[在 submit 时显示加载指示器];
        G --> H[允许表单提交，页面跳转];
    end

    A --> C;
