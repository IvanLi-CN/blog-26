import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import "@/styles/nature-restored.css";
import "../../../site/components/projects/project-poster-radius.css";

const meta = {
  title: "Public/Projects/ProjectPoster",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    backgrounds: {
      default: "public dark",
      values: [{ name: "public dark", value: "#0f1613" }],
    },
    docs: {
      description: {
        component:
          "Mock-only visual contract for the Astro ProjectPoster mobile surface. The compact poster keeps the public mobile shell radius and the 4:5 project-poster ratio.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type PosterState = "loading" | "loaded" | "failed";

function ProjectPosterStateContract({
  state = "loaded",
  embedded = false,
}: {
  state?: PosterState;
  embedded?: boolean;
}) {
  const isLoaded = state === "loaded";

  const poster = (
    <article
      className="project-poster is-compact relative mx-auto flex aspect-[4/5] max-w-[22rem] flex-col justify-end overflow-hidden border p-5"
      data-testid="project-poster-mobile"
      style={{
        borderColor: "rgba(156, 190, 170, 0.24)",
        background:
          "radial-gradient(circle at 14% 12%, rgba(108, 146, 184, 0.24), transparent 30%), linear-gradient(160deg, rgba(24, 36, 44, 0.96), rgba(24, 36, 44, 0.82))",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 24px 54px rgba(0, 0, 0, 0.3)",
      }}
    >
      {state !== "failed" && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 scale-105 bg-[radial-gradient(circle_at_24%_18%,rgba(144,215,180,0.38),transparent_28%),linear-gradient(160deg,#263d4a,#15272e_64%,#101b1b)] ${
            isLoaded ? "opacity-100" : "opacity-70 blur-xl"
          }`}
          data-testid="project-poster-media-state"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,12,8,0.04),rgba(4,12,8,0.72))]"
      />
      <span className="relative text-xs uppercase tracking-[0.14em]" style={{ color: "#9db6a8" }}>
        Public Product
      </span>
      <strong className="relative mt-2 text-xl">Project poster</strong>
      <span className="relative mt-1 text-sm" style={{ color: "#c0d2c6" }}>
        {state === "loading"
          ? "Low-resolution preview remains visible"
          : state === "failed"
            ? "Domain fallback and project copy remain readable"
            : "Responsive poster image loaded"}
      </span>
    </article>
  );

  if (embedded) {
    return <div className="p-0">{poster}</div>;
  }

  return (
    <main
      data-ui-theme="dark"
      className="min-h-screen p-3 sm:p-6"
      style={{ background: "#0f1613", color: "#e6f1eb" }}
    >
      {poster}
    </main>
  );
}

function ProjectPosterStateGallery() {
  return (
    <main
      data-ui-theme="dark"
      className="min-h-screen p-3 sm:p-6"
      style={{ background: "#0f1613", color: "#e6f1eb" }}
    >
      <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
        {(
          [
            ["Loading preview", "loading"],
            ["Loaded image", "loaded"],
            ["Delivery failure", "failed"],
          ] as const
        ).map(([label, state]) => (
          <section key={state} className="grid gap-2">
            <p className="m-0 text-sm font-semibold" style={{ color: "#c9ded0" }}>
              {label}
            </p>
            <ProjectPosterStateContract state={state} embedded={true} />
          </section>
        ))}
      </div>
    </main>
  );
}

export const States: Story = {
  name: "渐进加载状态总览",
  render: () => <ProjectPosterStateGallery />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Loading preview")).toBeVisible();
    await expect(canvas.getByText("Loaded image")).toBeVisible();
    await expect(canvas.getByText("Delivery failure")).toBeVisible();
    await expect(
      canvas.getByText("Domain fallback and project copy remain readable")
    ).toBeVisible();
  },
};

export const Mobile: Story = {
  name: "移动端加载预览",
  render: () => <ProjectPosterStateContract state="loading" />,
  parameters: {
    viewport: {
      options: {
        projectPosterMobile: {
          name: "Project poster mobile",
          styles: { width: "393px", height: "852px" },
          type: "mobile",
        },
      },
    },
  },
  globals: {
    viewport: { value: "projectPosterMobile", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const poster = canvas.getByTestId("project-poster-mobile");
    await expect(canvas.getByTestId("project-poster-media-state")).toBeVisible();
    await expect(poster).toBeVisible();
    const aspectRatio = await poster.evaluate((element) => getComputedStyle(element).aspectRatio);
    expect(aspectRatio).toBe("4 / 5");
    const borderRadius = await poster.evaluate((element) => getComputedStyle(element).borderRadius);
    expect(borderRadius).toBe("14px");
  },
};

export const Loaded: Story = {
  name: "资源加载完成",
  render: () => <ProjectPosterStateContract state="loaded" />,
};

export const Fallback: Story = {
  name: "资源加载失败回退",
  render: () => <ProjectPosterStateContract state="failed" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId("project-poster-media-state")).not.toBeInTheDocument();
    await expect(
      canvas.getByText("Domain fallback and project copy remain readable")
    ).toBeVisible();
  },
};
