import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];
// Augment: add overrides to relax strict rules for server and tests
eslintConfig.push(
  {
    files: [
      "src/server/**/*.ts",
      "src/server/**/*.tsx",
      "src/lib/__tests__/**/*.ts",
      "src/components/memos/__tests__/**/*.ts",
      "src/components/memos/__tests__/**/*.tsx",
      // 添加需要使用 any 类型的文件
      "src/components/editor/types/*.ts",
      "src/store/*.ts",
      "src/lib/sync-events.ts",
      "src/lib/content-sources/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/components/ui/*.tsx"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  // 全局规则：未使用变量警告而非错误
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);

export default eslintConfig;
