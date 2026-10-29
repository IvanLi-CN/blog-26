import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";
import RuntimeMetricValue from "../../../site/components/projects/RuntimeMetricValue";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

function Surface({ children }: { children: ReactNode }) {
  return (
    <main
      data-visual-evidence-surface
      data-ui-theme="dark"
      style={{
        minHeight: 180,
        padding: 24,
        background: "#0f1915",
        color: "#eaf4ee",
      }}
    >
      <div data-visual-evidence-target>{children}</div>
    </main>
  );
}

const meta = {
  title: "Public/Projects/Runtime Metric Value",
  component: RuntimeMetricValue,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      description: {
        component:
          "Runtime metrics use compact K/M/B/T values with at most two decimal places. Pressure remains fixed at two decimals; live refresh motion is covered by the official projects Web Demo.",
      },
    },
  },
} satisfies Meta<typeof RuntimeMetricValue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompactUnits: Story = {
  name: "Compact units keep two decimal places at most",
  args: { value: 793_758 },
  render: () => (
    <Surface>
      <div style={{ display: "grid", gap: 16, maxWidth: 320 }}>
        <RuntimeMetricValue value={793_758} />
        <RuntimeMetricValue value={2_110_898_841} />
        <RuntimeMetricValue value={999_999.9} />
      </div>
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const values = canvas.getAllByRole("img");
    await expect(values).toHaveLength(3);
    await expect(values[0]).toHaveAttribute("aria-label", "793.76K");
    await expect(values[1]).toHaveAttribute("aria-label", "2.11B");
    await expect(values[2]).toHaveAttribute("aria-label", "1M");
  },
};

export const FixedPressure: Story = {
  name: "Pressure keeps fixed two-decimal precision",
  args: { value: 7.51, format: "fixed-2" },
  render: () => (
    <Surface>
      <RuntimeMetricValue value={7.51} format="fixed-2" />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("img")).toHaveAttribute("aria-label", "7.51");
  },
};
