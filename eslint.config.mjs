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
  }
);

export default eslintConfig;
