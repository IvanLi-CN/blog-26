import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import "@/app/nature-restored.css";
import PublicSearchPage from "./PublicSearchPage";
import type { SearchFilter, SearchResultItem } from "./search-model";

const results: SearchResultItem[] = [
  {
    slug: "arch-linux-on-m1-notes",
    title: "Arch Linux on Apple Silicon: installation notes",
    excerpt: "整理一次从分区、引导到桌面环境的安装记录，重点标出网络、驱动和日常开发环境的细节。",
    snippet: "在 Apple Silicon 上安装 Arch 时，网络、驱动和引导配置是最容易回头查的部分。",
    type: "post",
    final: 0.92,
  },
  {
    slug: "pacman-cache-cleanup",
    title: "Pacman cache cleanup memo",
    excerpt: "保留最近两个版本，避免系统升级后回滚空间不足。",
    snippet: "Pacman 的缓存清理和 Arch 系统升级恢复经常一起出现，适合做成短 memo。",
    type: "memo",
    final: 0.75,
  },
  {
    slug: "react-hooks-deep-dive",
    title: "React Hooks 深度解析",
    excerpt: "从依赖数组、闭包和渲染时机解释 Hook 的稳定用法。",
    snippet: "在 Arch 桌面环境里调试 React Hooks，依赖数组和渲染时机决定了副作用是否稳定。",
    type: "post",
    final: 0.48,
  },
];

const emptyResults: SearchResultItem[] = [];

const meta = {
  title: "Public/Search Page",
  component: PublicSearchPage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    backgrounds: {
      default: "public light",
      values: [
        { name: "public light", value: "#edf4ef" },
        { name: "public dark", value: "#0f1613" },
      ],
    },
    docs: {
      description: {
        component:
          "Public search page states for the Nature frontend. These stories use deterministic mock data and do not call the search API.",
      },
    },
  },
} satisfies Meta<typeof PublicSearchPage>;

export default meta;

type Story = StoryObj;

type SearchStoryProps = {
  initialQuery?: string;
  searchedQuery?: string;
  items?: SearchResultItem[];
  isLoading?: boolean;
  error?: string | null;
  theme?: "light" | "dark";
  shellClassName?: string;
};

function SearchStory({
  initialQuery = "Arch",
  searchedQuery = initialQuery,
  items = results,
  isLoading = false,
  error = null,
  theme = "light",
  shellClassName,
}: SearchStoryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<SearchFilter>("all");

  useEffect(() => {
    document.documentElement.dataset.uiTheme = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");

    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
      document.documentElement.classList.remove("dark");
    };
  }, [theme]);

  return (
    <div className="nature-app-shell min-h-screen bg-[color:var(--nature-bg)] text-[color:var(--nature-text)]">
      <div className={shellClassName}>
        <PublicSearchPage
          query={query}
          searchedQuery={searchedQuery}
          results={items}
          isLoading={isLoading}
          error={error}
          filter={filter}
          onFilterChange={setFilter}
          onQueryChange={setQuery}
          onSubmit={(event) => event.preventDefault()}
        />
      </div>
    </div>
  );
}

export const Results: Story = {
  name: "搜索结果",
  parameters: {
    docs: {
      description: {
        story: "搜索完成后的结果列表，展示文章、闪念、相关度、关键词摘录和高亮。",
      },
    },
  },
  render: () => <SearchStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "搜索文章和闪念" })).toBeInTheDocument();
    await expect(canvas.getByText("找到 3 条内容")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "搜索" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: /Arch Linux on Apple Silicon/ })).toBeVisible();
    await expect(canvasElement.querySelectorAll("mark").length).toBeGreaterThan(0);
    await expect(canvas.queryByText("打开内容")).not.toBeInTheDocument();
  },
};

export const Initial: Story = {
  name: "初始状态",
  parameters: {
    docs: {
      description: {
        story: "用户尚未输入关键词时的入口状态。",
      },
    },
  },
  render: () => <SearchStory initialQuery="" searchedQuery="" items={emptyResults} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "搜索文章和闪念" })).toBeInTheDocument();
    await expect(canvas.getByText("等待输入关键词")).toBeInTheDocument();
    await expect(canvas.getByText("从一个关键词开始")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  name: "搜索中",
  parameters: {
    docs: {
      description: {
        story: "提交关键词后等待搜索响应时的骨架状态。",
      },
    },
  },
  render: () => <SearchStory isLoading items={emptyResults} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("搜索结果加载中")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  name: "无结果",
  parameters: {
    docs: {
      description: {
        story: "搜索完成但没有任何匹配内容时的空状态。",
      },
    },
  },
  render: () => <SearchStory items={emptyResults} searchedQuery="Zettelkasten" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("没有找到相关内容")).toBeInTheDocument();
  },
};

export const ErrorState: Story = {
  name: "错误状态",
  parameters: {
    docs: {
      description: {
        story: "搜索 API 暂不可用或请求失败时的错误提示。",
      },
    },
  },
  render: () => (
    <SearchStory
      items={emptyResults}
      searchedQuery="Arch"
      error="搜索服务暂时不可用，请稍后重试。"
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("搜索服务暂时不可用");
  },
};

export const FilteredEmpty: Story = {
  name: "筛选无结果",
  parameters: {
    docs: {
      description: {
        story: "已有搜索结果，但当前类型筛选下没有匹配项。",
      },
    },
  },
  render: () => <SearchStory items={results.filter((item) => item.type === "post")} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /闪念 0/ }));
    await expect(canvas.getByText("这个类型里没有结果")).toBeInTheDocument();
  },
};

export const MobileResults: Story = {
  name: "移动端结果",
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  render: () => <SearchStory shellClassName="mx-auto max-w-[390px]" />,
};

export const DarkResults: Story = {
  name: "深色结果",
  parameters: {
    backgrounds: { default: "public dark" },
  },
  render: () => <SearchStory theme="dark" />,
};
