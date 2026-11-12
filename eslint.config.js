// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // The samples are separate projects with their own tooling
  { ignores: ["dist/**", "coverage/**", "docs/api/**", "samples/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    // Module boundaries: abstractions <- core <- stock; the facade depends on core only.
    files: ["src/abstractions/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/core/**", "**/stock/**", "**/facade/**"], message: "Abstractions depend on nothing." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/stock/**", "**/facade/**"], message: "Core must not depend on extensions or the facade." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/facade/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/stock/**"], message: "The facade must not depend on extension standards." }] },
      ],
    },
  },
);
