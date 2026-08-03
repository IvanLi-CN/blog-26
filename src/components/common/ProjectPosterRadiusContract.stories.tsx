import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import "@/styles/nature-restored.css";

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
          "Mock-only visual contract for the Astro ProjectPoster mobile surface. The compact poster keeps the public mobile shell radius instead of retaining the desktop hero radius.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function ProjectPosterRadiusContract() {
  return (
    <main
      data-ui-theme="dark"
      className="min-h-screen p-3"
      style={{ background: "#0f1613", color: "#e6f1eb" }}
    >
      <article
        className="project-poster-radius-contract is-compact mx-auto flex max-w-[22rem] flex-col justify-end overflow-hidden border p-5"
        data-testid="project-poster-mobile"
      >
        <span className="text-xs uppercase tracking-[0.14em]" style={{ color: "#9db6a8" }}>
          Public Product
        </span>
        <strong className="mt-2 text-xl">Project poster</strong>
        <span className="mt-1 text-sm" style={{ color: "#9db6a8" }}>
          Compact mobile surface
        </span>
      </article>
      <style>{`
        .project-poster-radius-contract {
          aspect-ratio: 3 / 4;
          border-color: rgba(156, 190, 170, 0.24);
          border-radius: 1.6rem;
          background:
            radial-gradient(circle at 14% 12%, rgba(108, 146, 184, 0.24), transparent 30%),
            linear-gradient(160deg, rgba(24, 36, 44, 0.96), rgba(24, 36, 44, 0.82));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 24px 54px rgba(0, 0, 0, 0.3);
        }

        @media (max-width: 767px) {
          .project-poster-radius-contract,
          .project-poster-radius-contract.is-compact {
            border-radius: var(--nature-radius-md);
          }
        }
      `}</style>
    </main>
  );
}

export const Mobile: Story = {
  render: () => <ProjectPosterRadiusContract />,
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
    await expect(poster).toBeVisible();
    const borderRadius = await poster.evaluate((element) => getComputedStyle(element).borderRadius);
    expect(borderRadius).toBe("14px");
  },
};
