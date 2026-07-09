import { join } from "path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/db/client";
import { applyConfigEnv } from "./config";

/**
 * Runs once per server boot (from instrumentation.ts): applies config-file
 * env defaults and brings the database up to the current schema, so a fresh
 * clone needs no manual migrate step.
 */

let done: Promise<void> | undefined;

export function bootstrap(): Promise<void> {
  done ??= run();
  return done;
}

async function run(): Promise<void> {
  applyConfigEnv();
  await migrate(db(), { migrationsFolder: join(process.cwd(), "drizzle") });
}
