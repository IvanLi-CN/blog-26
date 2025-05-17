# 搜索页面增强计划

## 任务目标

完善搜索页，增加页头和页脚（但是不要有搜索框）。

## 现有组件

*   页头组件：`apps/web/src/components/widgets/Header.astro`
*   页脚组件：`apps/web/src/components/widgets/Footer.astro`
*   搜索页面：`apps/web/src/pages/search.astro`

## 实施步骤

1.  **修改页头组件**：
    *   修改 `apps/web/src/components/widgets/Header.astro` 文件，添加一个 `showSearchBox` 属性，并根据该属性的值来决定是否显示搜索框。
    *   将以下代码添加到 `Header.astro` 组件的 Props 接口中：

        ```typescript
        showSearchBox?: boolean;
        ```

    *   修改 `Header.astro` 组件，使其根据 `showSearchBox` 属性的值来决定是否显示搜索框。将以下代码添加到 `Header.astro` 组件中：

        ```astro
        const { id = "header", links = [], isSticky = false, showSearchBox = true } = Astro.props;
        ```

    *   修改 `Header.astro` 组件，使其根据 `showSearchBox` 属性的值来决定是否显示搜索框。将以下代码添加到 `Header.astro` 组件中：

        ```astro
        <div class="actions md:flex hidden">
          <ToggleTheme iconClass="w-5 h-5" />
          {showSearchBox && <SearchBox />}
          <a
            class="btn btn-ghost btn-circle"
            aria-label="RSS Feed"
            title="RSS Feed"
            href={getAsset('/rss.xml')}
          >
            <Icon name="tabler:rss" class="w-5 h-5" />
          </a>
        </div>
        <div class="flex items-center md:hidden">
          {showSearchBox && <SearchBox />}
          <ToggleMenu />
        </div>
        ```

2.  **修改搜索页面**：
    *   将页头组件和页脚组件导入到 `apps/web/src/pages/search.astro` 文件中。
    *   在 `apps/web/src/pages/search.astro` 文件中，将页头组件添加到页面的顶部，并将页脚组件添加到页面的底部。
    *   在 `apps/web/src/pages/search.astro` 文件中，将 `Header` 组件的 `showSearchBox` 属性设置为 `false`。

        ```astro
        <Header showSearchBox={false} />
        ```

    *   确保页头和页脚组件在搜索页面上正确显示。

## Mermaid 图

```mermaid
graph LR
    A[开始] --> B{读取 search.astro};
    B --> C{读取 Header.astro};
    C --> D{读取 Footer.astro};
    D --> E{修改 Header.astro};
    E --> F{修改 search.astro};
    F --> G[完成];