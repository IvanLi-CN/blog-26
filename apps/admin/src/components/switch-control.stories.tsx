import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Switch } from "./ui";

type Theme = "dark" | "light";

function useDocumentTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.uiTheme = theme;
    root.dataset.theme = theme;
    root.dataset.uiPreference = "system";
    root.style.colorScheme = theme;
    root.classList.toggle("dark", theme === "dark");
    return () => {
      root.dataset.uiTheme = "light";
      root.dataset.theme = "light";
      root.dataset.uiPreference = "system";
      root.style.colorScheme = "light";
      root.classList.remove("dark");
    };
  }, [theme]);
}

function Canvas({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  useDocumentTheme(theme);
  return (
    <div
      data-visual-evidence-surface
      className="box-border w-full bg-background p-6 text-foreground"
      data-ui-theme={theme}
    >
      <div data-visual-evidence-target className="grid gap-3">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  checked,
  disabled,
  fixed,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  fixed?: boolean;
}) {
  const [enabled, setEnabled] = useState(checked);
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-card/88 px-4 py-2.5 shadow-md shadow-shadow-soft">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch
        aria-label={label}
        checked={fixed ? checked : enabled}
        disabled={disabled}
        onCheckedChange={fixed ? undefined : setEnabled}
      />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

const meta = {
  title: "Admin/Switch Control",
  tags: ["autodocs"],
  parameters: { layout: "centered", adminFullscreen: true },
  component: Switch,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every state of the shipped switch, in one page. */
export const AllStates: Story = {
  name: "状态总览",
  render: () => (
    <Canvas theme="dark">
      <div className="mx-auto grid w-full max-w-[560px] gap-6">
        <Group title="轨道与滑块">
          <Row label="未选中" hint="foreground ink" checked={false} fixed />
          <Row label="已选中" hint="primary ink" checked fixed />
          <Row label="禁用 / 未选中" checked={false} disabled fixed />
          <Row label="禁用 / 已选中" checked disabled fixed />
        </Group>
        <Group title="深色主题">
          <Row label="深色 · 已选中" hint="手柄为 primary ink" checked fixed />
        </Group>
      </div>
    </Canvas>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("switch", { name: "未选中" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    await expect(canvas.getByRole("switch", { name: "已选中" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await expect(canvas.getByRole("switch", { name: "禁用 / 未选中" })).toBeDisabled();
    await expect(canvas.getByRole("switch", { name: "禁用 / 已选中" })).toBeDisabled();
  },
};

export const DarkTheme: Story = {
  name: "深色主题",
  render: () => (
    <Canvas theme="dark">
      <div className="mx-auto grid w-full max-w-[520px] gap-2">
        <Row label="未选中" checked={false} fixed />
        <Row label="已选中" checked fixed />
        <Row label="禁用已选中" checked disabled fixed />
      </div>
    </Canvas>
  ),
};

export const LightTheme: Story = {
  name: "浅色主题",
  render: () => (
    <Canvas theme="light">
      <div className="mx-auto grid w-full max-w-[520px] gap-2">
        <Row label="未选中" checked={false} fixed />
        <Row label="已选中" checked fixed />
        <Row label="禁用已选中" checked disabled fixed />
      </div>
    </Canvas>
  ),
};

export const TogglesOnClick: Story = {
  name: "点击切换",
  render: () => (
    <Canvas theme="dark">
      <div className="mx-auto w-full max-w-[520px]">
        <Row label="点击测试" checked={false} />
      </div>
    </Canvas>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole("switch", { name: "点击测试" });
    await expect(control).toHaveAttribute("aria-checked", "false");
    await userEvent.click(control);
    await expect(control).toHaveAttribute("aria-checked", "true");
  },
};
