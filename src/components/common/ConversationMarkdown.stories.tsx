import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, within } from "storybook/test";
import {
  completeMarkdown,
  escapingAndCurrency,
  maliciousHtml,
} from "../../../tests/fixtures/assistant-markdown";
import { ConversationMarkdown } from "./ConversationMarkdown";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

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
          "聊天 Markdown 专用入口：保留 GFM/数学语义，原始 HTML 字面化，代码与图片使用受限组件。",
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
    await expect(canvas.getByRole("heading", { name: "阅读合同" })).toBeInTheDocument();
    const backlink = canvas.getByRole("link", { name: "返回正文" });
    await expect(backlink.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    await expect(backlink.textContent).toBe("");
    await expect(getComputedStyle(backlink).textDecorationLine).toBe("none");
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
