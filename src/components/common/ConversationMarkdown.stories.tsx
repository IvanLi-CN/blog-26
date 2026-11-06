import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  completeMarkdown,
  escapingAndCurrency,
  maliciousHtml,
} from "../../../tests/fixtures/assistant-markdown";
import { ConversationMarkdown } from "./ConversationMarkdown";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

const styleConsistencyContent = [
  "# 统一正文样式",
  "",
  "普通正文以相同节奏阅读：**强调**、[标题链接](/posts/contract) 和 `inline_code`。脚注定位保持独立[^style]。",
  "",
  "> 引用使用透明背景和左侧竖线，正文颜色保持可读。",
  ">",
  "> > 嵌套引用沿用相同规则。",
  "",
  "| 格式 | 阅读规则 |",
  "| --- | --- |",
  "| 表格 | 普通文字自然换行，宽内容仅在局部滚动 |",
  "",
  "```js",
  'const message = "保留精确复制与主动折叠";',
  "```",
  "",
  "![受控外图：点击前不加载](https://images.example.invalid/style-placeholder.png)",
  "",
  "[^style]: 脚注回跳保留导航语义和透明 SVG 操作。",
].join("\n");

function Surface({
  dark = false,
  content = completeMarkdown.message.content,
}: {
  dark?: boolean;
  content?: string;
}) {
  useEffect(() => {
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
  return (
    <div
      data-visual-evidence-surface="conversation-markdown"
      style={{
        padding: "clamp(16px, 2vw, 32px)",
        background: "var(--nature-bg)",
        color: "var(--nature-text)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        data-visual-evidence-target="conversation-markdown"
        style={{ minWidth: 0, maxWidth: 900, margin: "0 auto" }}
      >
        <div
          data-message-id={completeMarkdown.message.messageId}
          data-presentation-id={completeMarkdown.message.presentationId}
        >
          <div data-message-body>
            <ConversationMarkdown {...completeMarkdown.message} content={content} />
          </div>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Public/Conversation Markdown",
  component: Surface,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    viewport: {
      options: {
        conversationDesktop: {
          name: "Conversation 1440 × 1000",
          styles: { width: "1440px", height: "1000px" },
          type: "desktop",
        },
        conversationMobile: {
          name: "Conversation 393 × 852",
          styles: { width: "393px", height: "852px" },
          type: "mobile",
        },
        conversationNarrow: {
          name: "Conversation 320 × 800",
          styles: { width: "320px", height: "800px" },
          type: "mobile",
        },
      },
    },
    docs: {
      description: {
        component:
          "聊天 Markdown 专用入口：保留 GFM/数学语义、HTML 字面文本及代码/图片安全边界。正文统一为 1.75 行高、0.75rem 块间距；引用、表格、代码与媒体直角无阴影。引用仅使用透明左竖线，所有操作采用透明控件、共享焦点轮廓与桌面/触控尺寸。StyleConsistency 浅深画布用于同时核验这些规则。",
      },
    },
  },
} satisfies Meta<typeof Surface>;
export default meta;
type Story = StoryObj<typeof meta>;

const verifySurface: Story["play"] = async ({ args, canvasElement }) => {
  const canvas = within(canvasElement);
  const content = args.content ?? completeMarkdown.message.content;
  if (content === maliciousHtml.message.content) {
    await expect(
      canvasElement.querySelector(".conversation-markdown")?.textContent ?? ""
    ).toContain("<script>globalThis.__amrExecuted = true</script>");
    await expect(canvasElement.querySelector("script, img, video, iframe")).toBeNull();
  } else if (content === escapingAndCurrency.message.content) {
    await expect(canvasElement.querySelector(".katex")).not.toBeNull();
    await expect(canvas.getByText(/无效公式/)).toBeInTheDocument();
  } else {
    await expect(
      canvas.getByRole("heading", {
        name: content === styleConsistencyContent ? "统一正文样式" : "阅读合同",
      })
    ).toBeInTheDocument();
    const backlink = canvas.getByRole("link", { name: "返回正文" });
    await expect(backlink.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    await expect(backlink.textContent).toBe("");
    await expect(getComputedStyle(backlink).textDecorationLine).toBe("none");
    const backlinkStyle = getComputedStyle(backlink);
    await expect(backlinkStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    for (const borderWidth of [
      backlinkStyle.borderTopWidth,
      backlinkStyle.borderRightWidth,
      backlinkStyle.borderBottomWidth,
      backlinkStyle.borderLeftWidth,
    ]) {
      await expect(borderWidth).toBe("0px");
    }
    const minimumTarget = matchMedia("(min-width: 1024px) and (pointer: fine)").matches ? 32 : 44;
    await expect(backlink.getBoundingClientRect().width).toBeGreaterThanOrEqual(minimumTarget);
    await expect(backlink.getBoundingClientRect().height).toBeGreaterThanOrEqual(minimumTarget);
  }

  const heading = canvasElement.querySelector("h1");
  if (heading) {
    const style = getComputedStyle(heading);
    await expect(Number.parseFloat(style.fontSize)).toBeGreaterThan(18);
    await expect(Number.parseInt(style.fontWeight, 10)).toBeGreaterThanOrEqual(600);
  }
  const paragraph = canvasElement.querySelector("p");
  if (paragraph) await expect(getComputedStyle(paragraph).marginBottom).not.toBe("0px");
  for (const list of canvasElement.querySelectorAll("ul, ol")) {
    await expect(getComputedStyle(list).listStyleType).not.toBe("none");
  }
  const table = canvasElement.querySelector(".table-responsive");
  if (table) {
    await expect(getComputedStyle(table).overflowX).toBe("auto");
    await expect(getComputedStyle(table).borderRadius).toBe("0px");
  }
  const displayMath = canvasElement.querySelector(".katex-display");
  if (displayMath) await expect(getComputedStyle(displayMath).overflowX).toBe("auto");
  const ordinaryLink = canvasElement.querySelector('a[href="/posts/contract"]');
  if (ordinaryLink) {
    await expect(getComputedStyle(ordinaryLink).textDecorationLine).toContain("underline");
  }
  const body = canvasElement.querySelector(".conversation-markdown");
  if (!body) throw new Error("Missing Markdown body");
  const bodyStyle = getComputedStyle(body);
  await expect(
    Number.parseFloat(bodyStyle.lineHeight) / Number.parseFloat(bodyStyle.fontSize)
  ).toBe(1.75);
  for (const quote of body.querySelectorAll("blockquote")) {
    const style = getComputedStyle(quote);
    await expect(style.borderRadius).toBe("0px");
    await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await expect(style.boxShadow).toBe("none");
    await expect(style.fontStyle).toBe("normal");
    await expect(style.borderLeftWidth).toBe("3px");
    await expect([style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth]).toEqual([
      "0px",
      "0px",
      "0px",
    ]);
    await expect(style.color).toBe(bodyStyle.color);
    const paragraph = quote.querySelector("p");
    if (paragraph) await expect(getComputedStyle(paragraph).color).toBe(bodyStyle.color);
  }
  let blockBorder: string | undefined;
  for (const block of body.querySelectorAll(
    ".table-responsive, .conversation-code-block, .conversation-image__content"
  )) {
    const style = getComputedStyle(block);
    await expect(style.borderRadius).toBe("0px");
    await expect(style.boxShadow).toBe("none");
    await expect(style.borderTopWidth).toBe("1px");
    blockBorder ??= style.borderTopColor;
    await expect(style.borderTopColor).toBe(blockBorder);
  }
  for (const image of body.querySelectorAll(".conversation-image img")) {
    await expect(getComputedStyle(image).borderRadius).toBe("0px");
  }
  const fineDesktop = matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
  for (const control of body.querySelectorAll<HTMLElement>(
    ".conversation-code-actions button, .conversation-image__actions button, .conversation-image__actions a, .conversation-footnote-backref"
  )) {
    const style = getComputedStyle(control);
    await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await expect(style.borderWidth).toBe("0px");
    await expect(style.borderRadius).toBe("0px");
    await expect(style.boxShadow).toBe("none");
    const minimum = fineDesktop ? (control.hasAttribute("data-footnote-backref") ? 32 : 36) : 44;
    await expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(minimum);
    await expect(control.getBoundingClientRect().width).toBeGreaterThanOrEqual(minimum);
    await userEvent.hover(control);
    await expect(getComputedStyle(control).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await userEvent.unhover(control);
  }
  if (content === styleConsistencyContent) {
    await expect(body.querySelector(".conversation-code-block pre > code")).not.toBeNull();
    await expect(canvas.getByRole("button", { name: "复制代码" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "折叠代码" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "加载图片" })).toBeInTheDocument();
    await expect(body.querySelector("img, [srcset], link[rel='preload']")).toBeNull();
  }
  const surface = canvasElement.querySelector("[data-visual-evidence-surface]");
  const target = canvasElement.querySelector("[data-visual-evidence-target]");
  if (!surface || !target) throw new Error("Missing source-owned visual evidence surface");
  await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
};

export const StateOverview: Story = { play: verifySurface };
export const Dark: Story = { args: { dark: true }, play: verifySurface };
export const RawHtmlAndUnsafeLinks: Story = {
  args: { content: maliciousHtml.message.content },
  play: verifySurface,
};
export const MathAndEscapes: Story = {
  args: { content: escapingAndCurrency.message.content },
  play: verifySurface,
};
export const Mobile: Story = {
  globals: { viewport: { value: "conversationMobile", isRotated: false } },
  play: verifySurface,
};
export const Narrow: Story = {
  globals: { viewport: { value: "conversationNarrow", isRotated: false } },
  play: verifySurface,
};

export const StyleConsistency: Story = {
  args: { content: styleConsistencyContent },
  globals: { viewport: { value: "conversationDesktop", isRotated: false } },
  play: verifySurface,
};

export const StyleConsistencyDark: Story = {
  args: { content: styleConsistencyContent, dark: true },
  globals: { viewport: { value: "conversationDesktop", isRotated: false } },
  play: verifySurface,
};

export const StyleConsistencyMobile: Story = {
  args: { content: styleConsistencyContent },
  globals: { viewport: { value: "conversationMobile", isRotated: false } },
  play: verifySurface,
};
