import nextConfig from "eslint-config-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "next-env.d.ts",
      "tests/e2e/**",
    ],
  },
  ...nextConfig,
  {
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ],
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default eslintConfig;
