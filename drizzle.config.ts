import { defineConfig } from "drizzle-kit";

// `generate` needs only schema + out + dialect (no DB connection). Migration
// application is done by scripts/db-migrate.ts / db-reset-test.ts, which load
// .env.local themselves so no secret ever reaches the command line.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://unused" },
});
