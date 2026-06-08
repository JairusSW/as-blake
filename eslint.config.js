// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import aseslint from "./tools/assemblyscript-eslint-local.js";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "charts/**",
      ".as-test/**",
      "node_modules/**",
      // Untracked reference clones, not part of this project.
      "dragonbox/**",
      "ryu-js/**",
      "zmij/**",
      "**/*.tmp.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  aseslint.config,
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        WebAssembly: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    rules: {
      // best-effort try/catch (version probes, git lookups) is intentional
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // AssemblyScript is a TS dialect with its own intrinsics and idioms;
    // turn off the rules that fight it.
    files: ["assembly/**/*.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-constant-condition": "off",
      "no-empty": "off",
      "prefer-const": "off",
    },
  },
  {
    // d8 host runner: V8 shell globals.
    files: ["bench/runners/**/*.js"],
    languageOptions: {
      globals: {
        performance: "readonly",
        readbuffer: "readonly",
        read: "readonly",
        print: "readonly",
        writeFile: "readonly",
        arguments: "readonly",
      },
    },
  },
);
