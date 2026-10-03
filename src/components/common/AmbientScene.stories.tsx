import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo } from "react";
import { expect, waitFor, within } from "storybook/test";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";
import AmbientScene, { type AmbientSceneEvidence } from "./AmbientScene";

type Renderer = NonNullable<AmbientSceneEvidence["renderer"]>;
type SceneArgs = {
  theme: "light" | "dark";
  renderer: Renderer;
  viewport: "desktop" | "mobile" | "narrow";
  animated: boolean;
};
const dimensions = { desktop: [1440, 900], mobile: [393, 852], narrow: [320, 780] } as const;
const background =
  "radial-gradient(circle at top, rgba(var(--nature-accent-rgb), .18), transparent 32%), radial-gradient(circle at 80% 10%, rgba(var(--nature-highlight-rgb), .42), transparent 30%), linear-gradient(180deg, var(--nature-bg), var(--nature-bg-deep))";

function ReadingScene({ theme, renderer, viewport, animated }: SceneArgs) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-ui-theme");
    root.setAttribute("data-ui-theme", theme);
    return () => {
      if (previous === null) root.removeAttribute("data-ui-theme");
      else root.setAttribute("data-ui-theme", previous);
    };
  }, [theme]);
  const [width, height] = dimensions[viewport];
  const evidence = useMemo(
    () => ({ width, height, renderer, frameTime: animated ? undefined : 0 }),
    [width, height, renderer, animated]
  );
  const margin = Math.max(16, Math.min(48, Math.round(Math.max(width, height) * 0.02)));
  return (
    <div
      data-ui-theme={theme}
      data-visual-evidence-surface
      style={{
        width: width + margin * 2,
        padding: margin,
        background: "var(--nature-bg)",
        color: "var(--nature-text)",
      }}
    >
      <main
        data-visual-evidence-target
        data-requested-viewport={`${width}x${height}`}
        data-requested-renderer={renderer}
        style={{
          position: "relative",
          isolation: "isolate",
          width,
          height,
          overflow: "hidden",
          background,
        }}
      >
        <AmbientScene evidence={evidence} />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: viewport === "desktop" ? "72px 80px" : "40px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              borderBottom: "1px solid var(--nature-line)",
              paddingBottom: 20,
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 600 }}>Ivan&apos;s Blog</span>
            <span style={{ fontSize: 13, color: "var(--nature-text-soft)" }}>
              文章 · 日常 · 项目
            </span>
          </div>
          <article
            className="nature-surface"
            style={{
              margin: viewport === "desktop" ? "140px auto 0" : "100px auto 0",
              padding: viewport === "desktop" ? "44px 48px" : "30px 24px",
              maxWidth: 740,
            }}
          >
            <p style={{ margin: "0 0 18px", color: "var(--nature-text-soft)", fontSize: 13 }}>
              记录 · 分享 · 生长
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: viewport === "desktop" ? 36 : 26,
                fontWeight: 500,
                lineHeight: 1.5,
                fontFamily: '"Songti SC", "Noto Serif SC", serif',
              }}
            >
              让想法慢慢生长
            </h1>
            <p
              style={{
                margin: "16px 0 0",
                lineHeight: 1.9,
                color: "var(--nature-text-soft)",
                fontSize: 15,
              }}
            >
              这里记录技术、日常与一路生长的想法。留一点空白，让阅读安静地发生。
            </p>
          </article>
        </div>
      </main>
    </div>
  );
}

const meta = {
  title: "Public/AmbientScene",
  component: ReadingScene,
  tags: ["autodocs"],
  args: { theme: "light", renderer: "full", viewport: "desktop", animated: false },
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      description: {
        component:
          "Production ambient coordinator over a mock reading surface. Fixed-frame stories compare SVG with real WebGPU full/conservative detail; AutoMotion exercises production scheduling and fallback. Each evidence surface owns its theme-colored outer margin and its declared CSS viewport.",
      },
    },
    controls: { include: ["theme", "renderer", "viewport", "animated"] },
  },
  argTypes: {
    theme: { control: "select", options: ["light", "dark"] },
    renderer: { control: "select", options: ["svg", "full", "conservative", "auto"] },
    viewport: { control: "select", options: ["desktop", "mobile", "narrow"] },
  },
} satisfies Meta<typeof ReadingScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const ready: Story["play"] = async ({ canvasElement, args }) => {
  const target = canvasElement.querySelector<HTMLElement>("[data-visual-evidence-target]");
  expect(target?.getBoundingClientRect().width).toBe(dimensions[args.viewport][0]);
  expect(target?.getBoundingClientRect().height).toBe(dimensions[args.viewport][1]);
  await expect(
    within(canvasElement).getByRole("heading", { name: "让想法慢慢生长" })
  ).toBeVisible();
  await waitFor(() => expect(target?.querySelector("canvas, svg")).toBeTruthy(), {
    timeout: 10000,
  });
  const actual = target?.querySelector<HTMLElement>(".nature-ambient")?.dataset.ambientRenderer;
  expect(["svg", "webgpu"]).toContain(actual);
  if (args.renderer === "svg") expect(actual).toBe("svg");
  if (actual === "webgpu" && args.renderer !== "auto") {
    expect(target?.querySelector("canvas")?.dataset.ambientTier).toBe(args.renderer);
  }
};

export const DesktopLight: Story = { play: ready };
export const DesktopDark: Story = { args: { theme: "dark" }, play: ready };
export const MobileLight: Story = { args: { viewport: "mobile" }, play: ready };
export const MobileDark: Story = { args: { viewport: "mobile", theme: "dark" }, play: ready };
export const SvgFallback: Story = { args: { renderer: "svg" }, play: ready };
export const Conservative: Story = { args: { renderer: "conservative" }, play: ready };
export const Narrow: Story = { args: { viewport: "narrow", renderer: "svg" }, play: ready };
export const AutoMotion: Story = { args: { renderer: "auto", animated: true }, play: ready };

export const States: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 20 }}>
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme}>
          <h2>{theme === "light" ? "浅色" : "深色"}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {(["svg", "full", "conservative"] as const).map((renderer) => (
              <div key={renderer}>
                <h3>{renderer}</h3>
                <iframe
                  title={`${theme} ${renderer}`}
                  src={`iframe.html?id=public-ambientscene--mobile-light&viewMode=story&args=theme:${theme};renderer:${renderer}`}
                  style={{ width: 427, height: 886, border: 0 }}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};
