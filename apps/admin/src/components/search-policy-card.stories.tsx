import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { DEFAULT_SEARCH_POLICY } from "@/lib/search/settings";
import { SearchPolicyCard } from "./search-policy-card";

const meta = {
  title: "Admin/Search Policy",
  component: SearchPolicyCard,
  tags: ["autodocs"],
  parameters: { layout: "centered", adminFullscreen: true },
  decorators: [
    (Story) => (
      <div data-visual-evidence-surface className="bg-background p-6 text-foreground">
        <div data-visual-evidence-target className="w-[min(480px,calc(100vw-48px))]">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    mode: "rag",
    policy: DEFAULT_SEARCH_POLICY.rag,
    status: { available: false, reason: "unvalidated" },
    dirty: false,
    validating: false,
    onChange: () => undefined,
    onChooseModel: () => undefined,
    onValidate: () => undefined,
  },
} satisfies Meta<typeof SearchPolicyCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Inherited: Story = {};
export const OverrideModel: Story = {
  args: {
    mode: "rewrite",
    policy: { ...DEFAULT_SEARCH_POLICY.rewrite, model: "example-chat-model" },
  },
};
export const Passed: Story = {
  args: {
    status: { available: true },
    quality: { fingerprint: "synthetic-example", passed: true, validatedAt: 1791504000000 },
  },
};
export const Disabled: Story = {
  args: {
    policy: { ...DEFAULT_SEARCH_POLICY.rag, enabled: false },
    status: { available: false, reason: "disabled" },
  },
};
export const Unsaved: Story = { args: { dirty: true } };
export const Validating: Story = {
  args: { validating: true, validationStatus: <p role="status">验证中：2/4</p> },
};
export const Failed: Story = {
  args: {
    status: { available: false, reason: "invalid-output" },
    validationStatus: <p role="status">固定样例验证失败</p>,
  },
};
export const Editing: Story = {
  render: (args) => {
    const [policy, setPolicy] = useState(args.policy);
    return (
      <SearchPolicyCard
        {...args}
        policy={policy}
        onChange={(values) => setPolicy((current) => ({ ...current, ...values }))}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const enabled = canvas.getByRole("switch", { name: "启用AI 检索（RAG）" });
    await userEvent.click(enabled);
    await expect(enabled).toHaveAttribute("aria-checked", "false");
    await expect(canvas.getByRole("button", { name: "验证已保存配置" })).toBeDisabled();
  },
};
