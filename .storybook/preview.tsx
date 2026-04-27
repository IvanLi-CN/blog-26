import "@fontsource-variable/inter";
import type { Preview } from "@storybook/react-vite";
import "../apps/admin/src/styles.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
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
