import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { validateFrontmatterText } from "@/lib/frontmatter-document";
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

const suggestions = {
  tags: ["React", "Hooks", "Hardware/Circuit", "Hardware/USB-C"],
  categories: ["backend", "frontend", "hardware", "notes"],
};

const realisticFrontmatter = `title: USB-C Safe5V 诱骗器
slug: usb-c-safe-5v-sink
tags:
  - Hardware/Circuit
  - Hardware/USB-C
publishDate: 2026-06-17
draft: true
public: true
excerpt: |-
  现在还能买到没有 CC 下拉电阻的 USB-C 口的小玩意，所以我又重新搞了一个
  USB-C Safe5V 诱骗器，给这些小东西做个外挂 CC 下拉补丁。
category: hardware
author: Ivan Li
image: ./assets/usb-c-safe5v-cover.png
createdVia: demo
updatedVia: mcp`;

export const Editable: Story = {
  render: () => {
    const [value, setValue] = useState(realisticFrontmatter);

    return <FrontmatterBlock value={value} onChange={setValue} suggestions={suggestions} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox", { name: "Frontmatter YAML editor" })).toBeVisible();
  },
};

export const WarningState: Story = {
  args: {
    value: `${realisticFrontmatter}\nmysteryField: keep-me`,
    diagnostics: validateFrontmatterText(`${realisticFrontmatter}\nmysteryField: keep-me`)
      .diagnostics,
    suggestions,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("frontmatter-diagnostics-warning")).toBeVisible();
    await userEvent.hover(canvas.getByTestId("frontmatter-diagnostics-warning"));
    await expect(
      canvas.getByText("未知字段 “mysteryField” 会被保留，但不在首版 frontmatter schema 内。")
    ).toBeVisible();
  },
};

export const ErrorAndSaveBlock: Story = {
  render: () => {
    const [value, setValue] = useState(
      `title: USB-C Safe5V 诱骗器
slug: usb-c-safe-5v-sink
tags: true
publishDate: not-a-date
draft: true
public: true
excerpt: |-
  现在还能买到没有 CC 下拉电阻的 USB-C 口的小玩意，所以我又重新搞了一个
  USB-C Safe5V 诱骗器。`
    );
    return (
      <FrontmatterBlock
        value={value}
        onChange={setValue}
        diagnostics={validateFrontmatterText(value).diagnostics}
        suggestions={suggestions}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("frontmatter-diagnostics-error")).toBeVisible();
    await expect(
      canvasElement.querySelectorAll(
        '[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-line]'
      )
    ).toHaveLength(2);
    await expect(
      canvasElement.querySelectorAll(
        '[data-testid="frontmatter-block"] .cm-content [data-frontmatter-diagnostic-mark="error"]'
      ).length
    ).toBe(2);
    await userEvent.hover(canvas.getByTestId("frontmatter-diagnostics-error"));
    await expect(canvas.getByText("tags 必须写成数组：")).toBeVisible();
    await expect(canvas.getByText("- React")).toBeVisible();
    await expect(canvas.getByText("- Hooks")).toBeVisible();
    await expect(canvas.getByText("publishDate 必须是可解析的日期文本。")).toBeVisible();
  },
};

export const AutocompleteDraft: Story = {
  render: () => {
    const [value, setValue] = useState("pub");
    return <FrontmatterBlock value={value} onChange={setValue} suggestions={suggestions} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole("textbox", { name: "Frontmatter YAML editor" });
    await userEvent.click(editor);
    await userEvent.keyboard("{Meta>}{Space}{/Meta}");
    await expect(canvas.getByText("publishDate")).toBeVisible();
  },
};
