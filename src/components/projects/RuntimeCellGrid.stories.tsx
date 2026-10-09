import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import RuntimeCellGrid from "../../../site/components/projects/RuntimeCellGrid";
import { projectRuntimeMetricsBySlug } from "../../../site/lib/project-runtime-metrics";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

const activityPoints = Array.from({ length: 90 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10),
  value: index === 4 ? 1_234_567 : index === 9 ? 0 : index === 17 ? null : (index % 7) * 13,
}));

function Surface({ children }: { children: ReactNode }) {
  return (
    <main
      data-visual-evidence-surface
      data-ui-theme="dark"
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "#0f1915",
        color: "#eaf4ee",
      }}
    >
      <div data-visual-evidence-target style={{ maxWidth: 640 }}>
        {children}
      </div>
    </main>
  );
}

const meta = {
  title: "Public/Projects/Runtime Cell Grid",
  component: RuntimeCellGrid,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      description: {
        component:
          "The public runtime grids expose scaled daily values and anonymous freshness buckets through the shared Tooltip. Activity values promote to K/M/B/T units instead of rendering multiple grouping separators. The same cells support hover, keyboard navigation, and touch long-press inspection.",
      },
    },
  },
} satisfies Meta<typeof RuntimeCellGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DailyValues: Story = {
  name: "Daily values and zero/null boundaries",
  render: () => (
    <Surface>
      <RuntimeCellGrid
        kind="tokens"
        label="最近 90 天 Token 消耗量活动图"
        points={activityPoints}
      />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cells = canvas.getAllByRole("gridcell");
    await expect(cells).toHaveLength(89);
    await expect(cells.find((cell) => cell.getAttribute("data-value") === "0")).toBeVisible();
    const exactCell = cells.find((cell) => cell.getAttribute("data-date") === "2026-07-05");
    if (!exactCell) throw new Error("expected daily value cell is missing");
    await userEvent.hover(exactCell);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const tooltip = within(document.body).getByRole("tooltip");
    await expect(tooltip).toHaveTextContent("2026-07-05");
    await expect(tooltip).toHaveTextContent("1.235M Token");
    await userEvent.unhover(exactCell);
    await expect(within(document.body).queryByRole("tooltip")).not.toBeInTheDocument();
  },
};

export const FreshnessStatuses: Story = {
  name: "Anonymous freshness statuses",
  render: () => (
    <Surface>
      <RuntimeCellGrid kind="freshness" label="仓库刷新新鲜度热点图" freshness={[0, 1, 2, 3, 4]} />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cells = canvas.getAllByRole("gridcell");
    await expect(cells).toHaveLength(5);
    await userEvent.hover(cells[4]);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    await expect(within(document.body).getByRole("tooltip")).toHaveTextContent("从未成功刷新");
    await expect(within(document.body).getByRole("tooltip")).not.toHaveTextContent("仓库");
  },
};

export const KeyboardInspection: Story = {
  name: "Keyboard grid navigation",
  render: () => (
    <Surface>
      <RuntimeCellGrid
        kind="requests"
        label="最近 90 天每日请求数活动图"
        points={projectRuntimeMetricsBySlug["tavily-hikari"].requestActivity90d}
      />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByRole("grid");
    await userEvent.tab();
    await expect(document.activeElement).toHaveAttribute("role", "gridcell");
    await expect(within(document.body).getByRole("tooltip")).toBeVisible();
    await userEvent.keyboard("{ArrowRight}");
    await expect(document.activeElement).toHaveAttribute("role", "gridcell");
    await userEvent.keyboard("{Escape}");
    await expect(within(document.body).queryByRole("tooltip")).not.toBeInTheDocument();
    await expect(grid).toBeVisible();
  },
};
