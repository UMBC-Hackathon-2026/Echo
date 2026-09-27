import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the tsconfig "@/*" -> "./*" path alias so tests can import project modules.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `import 'server-only'` throws under its default export; in tests resolve
      // it to the empty (react-server) module so content can be imported.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // DB-backed suites make many sequential round-trips to a remote Postgres;
    // the default 5s is too tight for the multi-step Phase 4 flow under load.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
