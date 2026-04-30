import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig } from "vite";

const repoRoot = resolve(import.meta.dirname, "..");

const config: StorybookConfig = {
  stories: ["../apps/admin/src/**/*.stories.@(ts|tsx|mdx)", "../src/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (baseConfig) =>
    mergeConfig(baseConfig, {
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          "@": resolve(repoRoot, "src"),
          "~": resolve(repoRoot, "apps/admin/src"),
        },
      },
    }),
};

export default config;
