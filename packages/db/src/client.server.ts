import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

/**
 * `prepare: false` because Supabase's transaction pooler (port 6543) does not support prepared
 * statements. The pooler does the pooling, so a small client-side `max` is enough.
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { prepare: false, max: options.max ?? 5 });
  return drizzle({ client, schema });
}

let shared: Db | undefined;

/** Process-wide client from `DATABASE_URL`, created on first use. */
export function getDb(): Db {
  if (shared) return shared;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  shared = createDb(url);
  return shared;
}

export async function closeDb(db: Db) {
  await db.$client.end();
}
