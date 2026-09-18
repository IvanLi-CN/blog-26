import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectCallout, ProjectComparison, ProjectFacts } from "./project-content-blocks";

const meta = {
  title: "Projects/Content blocks",
  component: ProjectCallout,
  parameters: { layout: "padded", docs: { autodocs: "tag" } },
} satisfies Meta<typeof ProjectCallout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Callout: Story = {
  args: { title: "证据链", children: "把请求上下文保留下来，才能复盘偶发问题。" },
};

export const Facts: Story = {
  render: () => (
    <ProjectFacts
      items={[
        { label: "运行方式", value: "自部署代理" },
        { label: "协议", value: "SSE" },
      ]}
    />
  ),
};

export const Comparison: Story = {
  render: () => (
    <ProjectComparison before={<p>只有最终响应。</p>} after={<p>请求和上游尝试可回看。</p>} />
  ),
};
