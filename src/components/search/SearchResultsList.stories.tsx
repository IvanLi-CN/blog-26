import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";
import SearchResultsList from "./SearchResultsList";
import { groupedSearchFixture } from "./search-fixture";

function ResultsSurface({ count = 5, expanded = false }: { count?: number; expanded?: boolean }) {
  const result = groupedSearchFixture(count);
  return (
    <div
      data-visual-evidence-surface
      style={{
        padding: 32,
        background: "var(--nature-bg)",
        width: "100%",
        maxWidth: 1280,
        boxSizing: "border-box",
      }}
    >
      <div data-visual-evidence-target>
        <SearchResultsList
          results={[result]}
          query="版本"
          expandedContentKeys={expanded ? new Set([result.contentKey]) : undefined}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Public/Search Results",
  component: ResultsSurface,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      page: () => (
        <div>
          <h1>内容搜索结果</h1>
          <p>每篇内容一个主结果。多个章节使用轻层级，默认最多三个；高亮保持原有文字排版。</p>
          <h2>默认与展开状态</h2>
          <ResultsSurface />
          <ResultsSurface expanded />
          <h2>仅一个章节命中</h2>
          <ResultsSurface count={1} />
        </div>
      ),
    },
  },
} satisfies Meta<typeof ResultsSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll("[data-search-section]")).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "展开更多匹配（2）" }));
    await expect(canvasElement.querySelectorAll("[data-search-section]")).toHaveLength(5);
    await userEvent.click(canvas.getByRole("button", { name: "收起更多匹配" }));
    await expect(canvasElement.querySelectorAll("[data-search-section]")).toHaveLength(3);
  },
};
export const Expanded: Story = {
  args: { expanded: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll("[data-search-section]")).toHaveLength(5);
  },
};
export const SingleChapter: Story = {
  args: { count: 1 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll("[data-search-section]")).toHaveLength(0);
    await expect(within(canvasElement).queryByRole("button")).not.toBeInTheDocument();
  },
};

const comparisonTexts = [
  "最新版本，并更新 package.json 中的版本。",
  "版本，版本；package.json 的版本不能改变排版。",
  "This office version release keeps AV kerning and mixed 中文版本。",
  "这是接近换行边界的长文本：版本发布以后，再确认版本与 package.json 中的版本一致。",
  "    release --upgrade --target semver 版本\n        package.json 版本",
];
function ComparisonContent() {
  return (
    <div className="bg-[color:var(--nature-bg)] p-4" data-highlight-comparison>
      {comparisonTexts.map((snippet, index) => (
        <div key={snippet} data-highlight-pair={index}>
          <div data-highlight-off>
            <SearchResultsList results={[{ slug: `comparison-${index}`, snippet }]} />
          </div>
          <div data-highlight-on>
            <SearchResultsList
              results={[{ slug: `comparison-${index}`, snippet }]}
              query="版本 version fi"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
export const HighlightComparison: Story = {
  render: () => <ComparisonContent />,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const positions = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const coordinates: Array<{ x: number; y: number; width: number; height: number }> = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (let offset = 0; offset < (node.textContent?.length ?? 0); offset++) {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          const rect = range.getBoundingClientRect();
          coordinates.push({
            x: rect.x - bounds.x,
            y: rect.y - bounds.y,
            width: rect.width,
            height: rect.height,
          });
        }
      }
      return { bounds, coordinates };
    };
    for (const pair of canvasElement.querySelectorAll("[data-highlight-pair]")) {
      const off = pair.querySelector<HTMLElement>("[data-highlight-off] [data-search-snippet]");
      const on = pair.querySelector<HTMLElement>("[data-highlight-on] [data-search-snippet]");
      if (!off || !on) throw new Error("Missing highlight comparison");
      await expect(off.textContent).toBe(on.textContent);
      const plain = positions(off);
      const highlighted = positions(on);
      await expect(highlighted.coordinates).toHaveLength(plain.coordinates.length);
      for (const key of ["width", "height"] as const) {
        await expect(Math.abs(plain.bounds[key] - highlighted.bounds[key])).toBeLessThanOrEqual(1);
      }
      for (let i = 0; i < plain.coordinates.length; i++) {
        for (const key of ["x", "y", "width", "height"] as const) {
          await expect(
            Math.abs(plain.coordinates[i][key] - highlighted.coordinates[i][key])
          ).toBeLessThanOrEqual(1);
        }
        const plainBreak =
          i > 0 && Math.abs(plain.coordinates[i].y - plain.coordinates[i - 1].y) > 1;
        const highlightedBreak =
          i > 0 && Math.abs(highlighted.coordinates[i].y - highlighted.coordinates[i - 1].y) > 1;
        await expect(highlightedBreak).toBe(plainBreak);
      }
      const copied = (element: HTMLElement) => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection?.removeAllRanges();
        selection?.addRange(range);
        const text = selection?.toString();
        selection?.removeAllRanges();
        return text;
      };
      await expect(copied(off)).toBe(copied(on));
      for (const mark of on.querySelectorAll("mark")) {
        const style = getComputedStyle(mark);
        const parentStyle = getComputedStyle(mark.parentElement ?? on);
        for (const key of [
          "fontFamily",
          "fontSize",
          "fontWeight",
          "lineHeight",
          "letterSpacing",
          "wordSpacing",
          "whiteSpace",
        ] as const)
          await expect(style[key]).toBe(parentStyle[key]);
        for (const key of [
          "paddingLeft",
          "paddingRight",
          "paddingTop",
          "paddingBottom",
          "marginLeft",
          "marginRight",
          "borderLeftWidth",
          "borderRightWidth",
        ] as const)
          await expect(style[key]).toBe("0px");
      }
    }
  },
};

function ComparisonTheme({ dark = false }: { dark?: boolean }) {
  useEffect(() => {
    document.documentElement.dataset.uiTheme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.dataset.theme = "light";
      document.documentElement.classList.remove("dark");
    };
  }, [dark]);
  return <ComparisonContent />;
}
const mobileComparison = { globals: { viewport: { value: "memo393", isRotated: false } } };
const narrowComparison = { globals: { viewport: { value: "memo320", isRotated: false } } };
export const DarkHighlightComparison: Story = {
  render: () => <ComparisonTheme dark />,
  play: HighlightComparison.play,
};
export const MobileHighlightComparison: Story = {
  ...mobileComparison,
  render: () => <ComparisonTheme />,
  play: HighlightComparison.play,
};
export const MobileDarkHighlightComparison: Story = {
  ...mobileComparison,
  render: () => <ComparisonTheme dark />,
  play: HighlightComparison.play,
};
export const NarrowHighlightComparison: Story = {
  ...narrowComparison,
  render: () => <ComparisonTheme />,
  play: HighlightComparison.play,
};
export const NarrowDarkHighlightComparison: Story = {
  ...narrowComparison,
  render: () => <ComparisonTheme dark />,
  play: HighlightComparison.play,
};
