import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    "public/sw.js",
    "public/sw.js.map",
    // Skrypty k6 (Faza 34) — uruchamiane przez binarny runtime k6, nie Node.
    // Importują moduły `k6/*` i `https://jslib.k6.io/...`, których ESLint
    // projektu nie rozwiązuje. Lintowanie ich tu nie ma sensu.
    "load-tests/**",
  ]),
  {
    // Reguły React Compiler / React 19 — `set-state-in-effect`, `refs`,
    // `purity` — domyślnie są ERROR w `eslint-config-next`. Wprowadzamy je
    // jako WARN, żeby CI nie blokował legitnych pre-existing wzorców
    // (callback-refs w `nip-validated-input.tsx`, `Date.now()` w
    // defaultach formularzy). Refaktor tych wzorców jest świadomie
    // odłożony do osobnej iteracji — lint pokazuje je w PR-ze, więc nie
    // znikają z radaru.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    // Pliki E2E (Playwright) używają `use` jako Playwright fixture API —
    // ESLint myli to z React `use` hook. Wyłączamy rules-of-hooks dla
    // wszystkich plików w `e2e/` (poza katalogiem React nie ma).
    files: ["e2e/**/*.ts", "e2e/**/*.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
]);

export default eslintConfig;
