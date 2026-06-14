import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FrontmatterBlock } from "~/editor/frontmatter-block";

const meta = {
  title: "Admin/Editor/Frontmatter Block",
  component: FrontmatterBlock,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof FrontmatterBlock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Editable: Story = {
  render: () => {
    const [value, setValue] = useState(
      "title: React Hooks 深度解析\nslug: react-hooks-deep-dive\ndraft: false\npublic: true\ncreatedVia: demo\ntags:\n  - React\n  - Hooks\ncategory: frontend"
    );

    return <FrontmatterBlock value={value} onChange={setValue} />;
  },
};
