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
      <div
        data-visual-evidence-surface
        className="box-border w-full max-w-[528px] bg-background p-6 text-foreground"
      >
        <div data-visual-evidence-target className="w-full max-w-[480px]">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    mode: "rag",
    policy: DEFAULT_SEARCH_POLICY.rag,
    status: { available: true, qualityStatus: "not-run" },
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
    status: { available: true, qualityStatus: "passed" },
    quality: { fingerprint: "synthetic-example", passed: true, validatedAt: 1791504000000 },
  },
};
export const Disabled: Story = {
  args: {
    policy: { ...DEFAULT_SEARCH_POLICY.rag, enabled: false },
    status: { available: false, reason: "disabled", qualityStatus: "not-run" },
  },
};
export const Unsaved: Story = { args: { dirty: true } };
export const Validating: Story = {
  args: { validating: true, validationStatus: <p role="status">验证中：2/4</p> },
};
export const Failed: Story = {
  args: {
    status: { available: true, qualityStatus: "failed" },
    validationStatus: <p role="status">固定样例验证失败</p>,
  },
};
export const Stale: Story = {
  args: {
    status: { available: true, qualityStatus: "stale" },
  },
};
export const Editing: Story = {
  render: (args) => {
    const [policy, setPolicy] = useState(args.policy);
    const [dirty, setDirty] = useState(args.dirty);
    return (
      <SearchPolicyCard
        {...args}
        policy={policy}
        dirty={dirty}
        onChange={(values) => {
          setDirty(true);
          setPolicy((current) => ({ ...current, ...values }));
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const enabled = canvas.getByRole("switch", { name: "启用此模式 AI 检索（RAG）" });
    await expect(enabled).toHaveAttribute(
      "aria-labelledby",
      "search-rag-enabled-label search-rag-title"
    );
    await userEvent.click(enabled);
    await expect(enabled).toHaveAttribute("aria-checked", "false");
    await expect(canvas.getByRole("button", { name: "验证已保存配置" })).toBeDisabled();
  },
};
