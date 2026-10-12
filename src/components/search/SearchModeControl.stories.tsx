import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import "@/styles/nature-restored.css";
import type { SearchMode } from "@/lib/search/settings";
import SearchModeControl from "./SearchModeControl";

const meta = {
  title: "Public/Search Mode",
  component: SearchModeControl,
  tags: ["autodocs"],
  parameters: { publicSurface: true, layout: "centered" },
  decorators: [
    (Story) => (
      <div data-visual-evidence-surface className="bg-[color:var(--nature-bg)] p-6">
        <div data-visual-evidence-target className="w-[320px]">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof SearchModeControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Rag: Story = { args: { mode: "rag", onModeChange: () => undefined } };
export const Rewrite: Story = { args: { mode: "rewrite", onModeChange: () => undefined } };
export const Off: Story = { args: { mode: "keyword", onModeChange: () => undefined } };
export const Fallback: Story = {
  args: {
    mode: "rag",
    effectiveMode: "keyword",
    reason: "unvalidated",
    onModeChange: () => undefined,
  },
};
export const Bootstrap: Story = { args: { mode: "rewrite", disabled: true } };
export const Switching: Story = {
  args: { mode: "keyword" },
  render: () => {
    const [mode, setMode] = useState<SearchMode>("keyword");
    return <SearchModeControl mode={mode} onModeChange={setMode} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "RAG" }));
    await expect(canvas.getByRole("button", { name: "RAG" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(canvas.getByText("先返回全文命中，再由 AI 补充语义相关内容。")).toBeVisible();
  },
};
