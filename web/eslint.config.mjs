import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/db/index",
          message: "Użyj funkcji z /db/queries/ zamiast bezpośredniego dostępu do Drizzle."
        }]
      }]
    }
  },
  {
    // db/queries/ is the only place allowed to import @/db/index directly
    files: ["./src/db/queries/**/*.ts"],
    rules: {
      "no-restricted-imports": "off"
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
