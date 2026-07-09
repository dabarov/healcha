import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { join } from "path";

config({ path: ".env" });

// Same default as src/lib/config.ts — a local file DB under HEALCHA_DATA_DIR.
const dataDir = process.env.HEALCHA_DATA_DIR || join(process.cwd(), "local", "data");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || `file:${join(dataDir, "healcha.db")}`,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
