import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { env } from "@/lib/env";

let _client: Client | undefined;

export function libsql(): Client {
  if (!_client) {
    _client = createClient({
      url: env("TURSO_DATABASE_URL"),
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!_db) {
    _db = drizzle(libsql(), { schema });
  }
  return _db;
}

export { schema };
