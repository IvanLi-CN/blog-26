import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { buildTagHref } from "@/lib/tag-href";
import { NativeTagLink } from "./NativeTagLink";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

function TagsSurface({ dark = false }: { dark?: boolean }) {
  useEffect(() => {
    document.documentElement.dataset.uiTheme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
    };
  }, [dark]);
  return (
    <div
      data-visual-evidence-surface
      style={{
        padding: 24,
        background: "var(--nature-bg)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div data-visual-evidence-content className="flex flex-wrap gap-2">
        {[
          "React",
          "USB-C PD + PPS",
          "I²C",
          "OpenAI-Compatible API",
          "VeryLongClassificationWithoutWhitespaceToVerifyNarrowWrapping",
        ].map((tag) => (
          <NativeTagLink key={tag} href={buildTagHref(tag)} label={tag} />
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Public/Native Tag Link",
  component: TagsSurface,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen", publicSurface: true },
} satisfies Meta<typeof TagsSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

const verify: Story["play"] = async ({ canvasElement }) => {
  const surface = canvasElement.querySelector<HTMLElement>("[data-visual-evidence-surface]");
  if (!surface) throw new Error("Missing evidence surface");
  const boundary = surface.getBoundingClientRect();
  for (const link of canvasElement.querySelectorAll<HTMLAnchorElement>(".native-tag-link")) {
    const rect = link.getBoundingClientRect();
    const minimum = matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches
      ? 32
      : 44;
    if (rect.height < minimum || rect.width < minimum)
      throw new Error("Native tag target too small");
    if (rect.right > boundary.right - 23 || rect.left < boundary.left + 23)
      throw new Error("Tag exceeds source-owned margin");
    link.focus();
    if (document.activeElement !== link) throw new Error("Tag link is not keyboard focusable");
    if (getComputedStyle(link).outlineStyle === "none") throw new Error("Missing focus indicator");
  }
  const special = canvasElement.querySelector<HTMLAnchorElement>('a[href="/tags/I%C2%B2C"]');
  if (!special) throw new Error("Canonical tag spelling was lost");
};

export const Default: Story = { play: verify };
export const Dark: Story = { args: { dark: true }, play: verify };
const mobile = {
  parameters: {
    viewport: {
      options: {
        tags393: {
          name: "Tags 393 × 852",
          styles: { width: "393px", height: "852px" },
          type: "mobile",
        },
      },
    },
  },
  globals: { viewport: { value: "tags393", isRotated: false } },
};
export const Mobile: Story = { ...mobile, play: verify };
export const MobileDark: Story = { ...mobile, args: { dark: true }, play: verify };
