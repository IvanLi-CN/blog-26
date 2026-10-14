import type { Meta, StoryObj } from "@storybook/react-vite";
import { RagCoverageGrid } from "../pages/content-sync";

const meta = {
  title: "Admin/RAG Coverage",
  component: RagCoverageGrid,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-6">
        <div className="max-w-xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: { stats: { total: 80, indexed: 48, unindexed: 16, outdated: 8, failed: 8, coverage: 0.6 } },
} satisfies Meta<typeof RagCoverageGrid>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Partial: Story = {};
export const Unindexed: Story = {
  args: { stats: { total: 80, indexed: 0, unindexed: 80, outdated: 0, failed: 0, coverage: 0 } },
};
export const Empty: Story = {
  args: { stats: { total: 0, indexed: 0, unindexed: 0, outdated: 0, failed: 0, coverage: null } },
};
export const Unavailable: Story = {
  args: {
    available: false,
    stats: {
      total: 80,
      indexed: null,
      unindexed: null,
      outdated: null,
      failed: null,
      coverage: null,
    },
  },
};
