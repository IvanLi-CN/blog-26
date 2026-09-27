import "@fontsource-variable/inter";
import type { Preview } from "@storybook/react-vite";
import { MINIMAL_VIEWPORTS } from "storybook/viewport";
import "../apps/admin/src/styles.css";

const memoViewports = {
  ...MINIMAL_VIEWPORTS,
  memoDesktop: {
    name: "Memo desktop 1440 × 1000",
    styles: { width: "1440px", height: "1000px" },
    type: "desktop",
  },
  memo393: {
    name: "Memo mobile 393 × 852",
    styles: { width: "393px", height: "852px" },
    type: "mobile",
  },
  memo320: {
    name: "Memo narrow 320 × 780",
    styles: { width: "320px", height: "780px" },
    type: "mobile",
  },
};

const preview: Preview = {
  decorators: [
    (Story, context) => {
      if (context.parameters.publicSurface || context.parameters.adminFullscreen) {
        return <Story />;
      }

      return (
        <div className="min-h-screen bg-background p-6 text-foreground">
          <div className="mx-auto max-w-3xl">
            <Story />
          </div>
        </div>
      );
    },
  ],
  parameters: {
    viewport: { options: memoViewports },
    docs: {
      toc: true,
    },
    backgrounds: {
      default: "admin dark",
      values: [
        { name: "admin dark", value: "hsl(222 47% 11%)" },
        { name: "admin light", value: "hsl(210 33% 98%)" },
      ],
    },
  },
};

export default preview;
