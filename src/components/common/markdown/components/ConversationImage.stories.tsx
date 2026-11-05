import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  externalImages,
  imageResourceCases,
} from "../../../../../tests/fixtures/assistant-markdown";
import { ConversationImage } from "./ConversationImage";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

const sources = [...externalImages.message.content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
  (match) => match[1]!
);
const localImage = "/site-assets/ivan-blog-mark.svg";
const brokenImage = "data:image/png;base64,broken";

/**
 * Story-only image transport interception: no .invalid image reaches DNS or the network.
 * The real component still owns consent and creates its img only after a click. The original
 * requested URL remains observable for play assertions. Browser network acceptance belongs
 * to regression's Playwright route interception, not this DOM transport substitute.
 */
function interceptStoryImages() {
  const original = HTMLImageElement.prototype.setAttribute;
  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
  const substitute = (image: HTMLImageElement, value: string) => {
    if (value === imageResourceCases[0]!.expectedResolution) return localImage;
    if (!/^https:\/\/[^/]+\.invalid(?:\/|$)/u.test(value)) return value;
    original.call(image, "data-story-requested-src", value);
    return value === sources[0] || value === sources[1] ? localImage : brokenImage;
  };
  HTMLImageElement.prototype.setAttribute = function (name, value) {
    return original.call(
      this,
      name,
      name.toLowerCase() === "src" ? substitute(this, value) : value
    );
  };
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    ...srcDescriptor,
    set(value: string) {
      srcDescriptor.set!.call(this, substitute(this, value));
    },
  });
  return () => {
    HTMLImageElement.prototype.setAttribute = original;
    Object.defineProperty(HTMLImageElement.prototype, "src", srcDescriptor);
  };
}

function ImageStates({ dark = false }: { dark?: boolean }) {
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
  return (
    <div
      data-visual-evidence-surface
      style={{
        padding: 32,
        background: "var(--nature-bg)",
        color: "var(--nature-text)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div data-visual-evidence-target style={{ display: "grid", gap: 24 }}>
        <section aria-label="等待主动加载">
          <h2>等待主动加载</h2>
          <ConversationImage {...externalImages.message} src={sources[0]!} alt="外部图片 A" />
          <ConversationImage {...externalImages.message} src={sources[1]!} alt="外部图片 B" />
        </section>
        <section aria-label="已授权本地资源">
          <h2>已授权本地资源</h2>
          <ConversationImage {...imageResourceCases[0]!.input} />
        </section>
        <section aria-label="失败与重试">
          <h2>失败与重试</h2>
          <ConversationImage
            {...externalImages.message}
            src={sources[2]!}
            alt="损坏图片"
            resourceContext={{
              resolveAuthorizedImage: (src) =>
                src === sources[2] ? { src: "/share-target-sw.js" } : null,
            }}
          />
        </section>
        <section aria-label="缺少授权上下文">
          <h2>缺少授权上下文</h2>
          <ConversationImage {...imageResourceCases[2]!.input} />
          <p>图片之外的说明始终可读。</p>
        </section>
      </div>
    </div>
  );
}

const meta = {
  title: "Public/Conversation Image",
  component: ImageStates,
  tags: ["autodocs"],
  beforeEach: interceptStoryImages,
  parameters: {
    publicSurface: true,
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "受限图片状态概览：等待主动加载、可信 resolver 授权、本地失败重试与缺少上下文。外图使用仅 Story 生效的确定性传输替身，浏览器网络验收由正式路由 regression 负责。",
      },
    },
    viewport: {
      options: {
        image393: {
          name: "Image 393 × 852",
          styles: { width: "393px", height: "852px" },
          type: "mobile",
        },
        image320: {
          name: "Image 320 × 800",
          styles: { width: "320px", height: "800px" },
          type: "mobile",
        },
      },
    },
  },
} satisfies Meta<typeof ImageStates>;
export default meta;
type Story = StoryObj<typeof meta>;

const verifyGallery: Story["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const waiting = canvas.getByRole("region", { name: "等待主动加载" });
  expect(waiting.querySelector("img, [src], [srcset], link")).toBeNull();
  const authorized = canvas.getByRole("region", { name: "已授权本地资源" });
  await waitFor(() =>
    expect(within(authorized).getByRole("status").textContent).toBe("图片已加载")
  );
  const failure = canvas.getByRole("region", { name: "失败与重试" });
  await waitFor(() =>
    expect(within(failure).getByRole("status").textContent).toContain("加载失败")
  );
  await userEvent.click(within(failure).getByRole("button", { name: "重试加载图片" }));
  await waitFor(() =>
    expect(within(failure).getByRole("status").textContent).toContain("加载失败")
  );
  for (const action of waiting.querySelectorAll<HTMLElement>("button, a")) {
    action.focus();
    expect(document.activeElement).toBe(action);
    const minimum = matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches
      ? 36
      : 44;
    expect(action.getBoundingClientRect().height).toBeGreaterThanOrEqual(minimum);
  }
};

export const StateGallery: Story = { play: verifyGallery };
export const Dark: Story = { args: { dark: true }, play: verifyGallery };
export const Mobile: Story = {
  globals: { viewport: { value: "image393", isRotated: false } },
  play: verifyGallery,
};
export const NarrowDark: Story = {
  args: { dark: true },
  globals: { viewport: { value: "image320", isRotated: false } },
  play: verifyGallery,
};
export const LoadOneImage: Story = {
  play: async (context) => {
    await verifyGallery(context);
    const waiting = within(context.canvasElement).getByRole("region", { name: "等待主动加载" });
    await userEvent.click(within(waiting).getAllByRole("button", { name: "加载图片" })[0]!);
    await waitFor(() => expect(waiting.querySelectorAll("img").length).toBe(1));
    expect(waiting.querySelector("img")!.dataset.storyRequestedSrc).toBe(sources[0]);
    expect(within(waiting).getAllByRole("button", { name: "加载图片" }).length).toBe(1);
  },
};
