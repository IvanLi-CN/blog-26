import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { codeCases } from "../../../../../tests/fixtures/assistant-markdown";
import { ConversationCodeBlock } from "./ConversationCodeBlock";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

const example =
  '\nconst price = "$5";\nconst pattern = /\\\\alpha/;\n\nconsole.log(price, pattern);\n';
const longCode = `${codeCases.find((entry) => entry.id === "long")?.source}\n${"wide_source_".repeat(30)}`;
const clipboardWrite = fn(async (_source: string) => undefined);

function CodeSurface({
  dark = false,
  gallery = false,
  source = example,
  language = "javascript",
}: {
  dark?: boolean;
  gallery?: boolean;
  source?: string;
  language?: string;
}) {
  useLayoutEffect(() => {
    document.documentElement.dataset.uiTheme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.dataset.theme = "light";
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    };
  }, [dark]);
  const cases = gallery
    ? [
        { id: "javascript", source: example, language: "javascript" },
        {
          id: "python",
          source: 'def greet(name):\n    return f"Hello, {name}"',
          language: "python",
        },
        ...codeCases.filter((entry) => entry.id !== "long" && entry.id !== "diagram-as-code"),
      ]
    : [{ id: "code", source, language }];
  return (
    <div
      data-visual-evidence-surface="conversation-code"
      style={{
        padding: "clamp(16px, 2vw, 32px)",
        background: "var(--nature-bg)",
        color: "var(--nature-text)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        data-visual-evidence-target="conversation-code"
        style={{ display: "grid", gap: 16, minWidth: 0 }}
      >
        {cases.map((entry) => (
          <section key={entry.id} style={{ minWidth: 0 }}>
            {gallery && <h3 style={{ margin: "0 0 8px" }}>{entry.id}</h3>}
            <ConversationCodeBlock source={entry.source} language={entry.language} />
          </section>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Public/Conversation Code Block",
  component: CodeSurface,
  tags: ["autodocs"],
  globals: { viewport: { value: "codeDesktop", isRotated: false } },
  beforeEach: ({ parameters }) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    clipboardWrite.mockReset();
    clipboardWrite.mockImplementation(async (_source: string) => {
      if (parameters.clipboardFailure) throw new Error("Mock clipboard permission denied");
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    return () => {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
  },
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      description: {
        component:
          "聊天代码默认展开；语言仅选择高亮。状态概览覆盖常见语言、无语言、缩进、空块及未知标签。独立交互状态展示精确原文复制、失败反馈与主动折叠；所有复制操作均使用 mock，不写入真实剪贴板。",
      },
    },
    viewport: {
      options: {
        codeDesktop: {
          name: "Code 1440 × 1000",
          styles: { width: "1440px", height: "1000px" },
          type: "desktop",
        },
        codeMobile: {
          name: "Code 393 × 852",
          styles: { width: "393px", height: "852px" },
          type: "mobile",
        },
        codeNarrow: {
          name: "Code 320 × 800",
          styles: { width: "320px", height: "800px" },
          type: "mobile",
        },
      },
    },
  },
} satisfies Meta<typeof CodeSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StateOverview: Story = { args: { gallery: true } };

const verifyCopyAndFold: Story["play"] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const code = canvasElement.querySelector("pre > code");
  await expect(code?.textContent).toBe(args.source ?? example);
  await userEvent.click(canvas.getByRole("button", { name: "复制代码" }));
  await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("代码已复制"));
  await expect(clipboardWrite).toHaveBeenCalledWith(args.source ?? example);
  const toggle = canvas.getByRole("button", { name: "折叠代码" });
  toggle.focus();
  await userEvent.keyboard(" ");
  await expect(canvas.getByRole("button", { name: "展开代码" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await expect(canvasElement.querySelector("pre")).not.toBeVisible();
  await userEvent.keyboard(" ");
  await expect(canvasElement.querySelector("pre")).toBeVisible();
  const surface = canvasElement.querySelector<HTMLElement>("[data-visual-evidence-surface]");
  if (!surface) throw new Error("Missing source-owned code surface");
  await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
};

export const CopySuccess: Story = { play: verifyCopyAndFold };
export const CopyFailure: Story = {
  parameters: { clipboardFailure: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "复制代码" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("复制失败"));
    await expect(canvas.getByRole("status")).not.toHaveTextContent("已复制");
    await expect(clipboardWrite).toHaveBeenCalledWith(example);
  },
};
export const LongCode: Story = {
  args: { source: longCode, language: "text" },
  play: verifyCopyAndFold,
};
export const Collapsed: Story = {
  args: { source: longCode, language: "text" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "折叠代码" }));
    await expect(canvas.getByRole("button", { name: "展开代码" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await expect(canvasElement.querySelector("pre")).not.toBeVisible();
  },
};
export const Dark: Story = { args: { dark: true }, play: verifyCopyAndFold };
export const Mobile: Story = {
  args: { source: longCode, language: "text" },
  globals: { viewport: { value: "codeMobile", isRotated: false } },
  play: verifyCopyAndFold,
};
export const MobileDark: Story = { ...Mobile, args: { ...Mobile.args, dark: true } };
export const Narrow: Story = {
  ...Mobile,
  globals: { viewport: { value: "codeNarrow", isRotated: false } },
};
