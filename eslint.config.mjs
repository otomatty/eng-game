import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

/**
 * ESLint Flat Config（厳格ルール）
 * - typescript-eslint: strictTypeChecked + stylisticTypeChecked（型情報を用いた検査）
 * - react / react-hooks / jsx-a11y: React ベストプラクティスとアクセシビリティ
 * - @next/next: Next.js（Core Web Vitals）
 */
export default tseslint.config(
  {
    // Lint 対象外
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "drizzle/**",
      ".open-next/**",
      ".wrangler/**",
      "next-env.d.ts",
      "cloudflare-env.d.ts",
      "worker-configuration.d.ts",
      "*.config.mjs",
      "*.config.ts",
      "*.config.js",
    ],
  },

  // ベース（全 JS/TS）
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // 型情報を使うための parserOptions
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  // React / Hooks / a11y / Next（.tsx 中心だが ts にも適用して問題ない設定のみ）
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // React 17+ / Next の JSX 変換では import 不要
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // 厳格運用の追加・調整
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // server-only 等の副作用 import を許容
      "@typescript-eslint/no-import-type-side-effects": "off",
      // 数値・真偽値のテンプレートリテラル埋め込みは慣用的で安全なため許可
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },

  // テストファイルは一部の型厳格ルールを緩める（モック・意図的な不正入力のため）
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}", "src/test/**/*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
