import net from "node:net";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

const STALL_MS = 30_000;

/**
 * The VPS's provider NAT sometimes drops a pooler connection without a reset, and postgres-js has no
 * query timeout, so a query on it waited for minutes and held a pool slot until every request 504'd.
 * A socket with no traffic for `stallMs` is destroyed, which fails the in-flight query. Plain TCP
 * only: postgres-js strips socket listeners when it upgrades to TLS (`sslmode` in the URL).
 */
export function stallGuardedSocket(o: { host: string[]; port: number[]; path?: string }, stallMs = STALL_MS) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = o.path ? net.connect(o.path) : net.connect(o.port[0] as number, o.host[0] as string);
    socket.setTimeout(stallMs);
    socket.once("error", reject);
    socket.once("timeout", () => socket.destroy(new Error("database socket stalled")));
    socket.once("connect", () => {
      socket.off("error", reject);
      socket.on("timeout", () => socket.destroy(new Error("database socket stalled")));
      resolve(socket);
    });
  });
}

/**
 * `prepare: false` because Supabase's transaction pooler (port 6543) does not support prepared
 * statements. The pooler does the pooling, so a small client-side `max` is enough.
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    prepare: false,
    max: options.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 10,
    socket: stallGuardedSocket,
  } as postgres.Options<Record<string, postgres.PostgresType>>);
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
