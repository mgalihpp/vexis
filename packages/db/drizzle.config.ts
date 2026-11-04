import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

// The repo-root .env holds the connection strings; drizzle-kit runs from this package.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // No .env file: rely on the environment.
}

const url = process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (or DATABASE_MIGRATE_URL) in the repo-root .env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
