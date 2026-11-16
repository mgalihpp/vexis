import { eq } from "drizzle-orm";
import type { Db } from "./client.server.ts";
import type { Beat } from "./heartbeat.ts";
import { serviceHeartbeats } from "./schema.ts";

/** A finished tick, or the error a tick ended with. A failed tick leaves `last_tick_at` alone, except in a new row, where it starts the staleness clock. */
export async function recordTick(db: Db, name: string, at: Date, error: string | null) {
  const patch = error === null ? { lastTickAt: at } : { lastError: error.slice(0, 500), lastErrorAt: at };
  await db
    .insert(serviceHeartbeats)
    .values({ name, lastTickAt: at, ...patch })
    .onConflictDoUpdate({ target: serviceHeartbeats.name, set: patch });
}

export const listHeartbeats = (db: Db): Promise<Beat[]> => db.select().from(serviceHeartbeats);

/** `at` opens the alert for a schedule, null closes it. */
export async function setAlerted(db: Db, name: string, at: Date | null) {
  await db.update(serviceHeartbeats).set({ alertedAt: at }).where(eq(serviceHeartbeats.name, name));
}
