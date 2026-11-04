// Proves the scoped helpers keep users apart, against the real database in DATABASE_URL.
// Creates two throwaway users, runs the checks, and deletes them (cascading to their rows).
// Run: bun run db:isolation

import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { closeDb, createDb } from "../src/client.server.ts";
import {
  addAgentPool,
  addWallet,
  ensureAgent,
  forUser,
  getAlert,
  listAgentPools,
  listAlerts,
  listWallets,
  removeAgentPool,
  removeWallet,
  updateAgent,
} from "../src/queries.server.ts";
import { agentAlerts, users } from "../src/schema.ts";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
} catch {}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url, { max: 2 });
const run = randomUUID().slice(0, 8);
const ids = { a: `isolation-a-${run}`, b: `isolation-b-${run}` };
let failures = 0;

function check(name: string, ok: boolean) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failures++;
}

try {
  await db.insert(users).values([
    { id: ids.a, name: "Isolation A", email: `${ids.a}@example.test` },
    { id: ids.b, name: "Isolation B", email: `${ids.b}@example.test` },
  ]);
  const A = forUser(db, ids.a);
  const B = forUser(db, ids.b);

  const agentA = await ensureAgent(A, "volume-watch");
  const agentB = await ensureAgent(B, "volume-watch");
  check("ensureAgent stores the default config", (agentA.config as { mult?: number }).mult === 3);

  const poolB = await addAgentPool(B, agentB.id, "PoolB111111111111111111111111111111111111111");
  await addAgentPool(A, agentA.id, "PoolA111111111111111111111111111111111111111");

  const [alertA] = await db
    .insert(agentAlerts)
    .values({ agentId: agentA.id, userId: ids.a, poolAddress: "PoolA", vol1m: 9000, baseline: 1000, ratio: 9 })
    .returning();
  const [alertB] = await db
    .insert(agentAlerts)
    .values({ agentId: agentB.id, userId: ids.b, poolAddress: "PoolB", vol1m: 20000, baseline: 2000, ratio: 10 })
    .returning();
  if (!alertA || !alertB || !poolB) throw new Error("insert returned nothing");

  const alertsA = await listAlerts(A);
  check("A lists only A's alerts", alertsA.length === 1 && alertsA[0]?.id === alertA.id);
  check("A cannot read B's alert by id", (await getAlert(A, alertB.id)) === undefined);
  check("B still reads B's alert", (await getAlert(B, alertB.id))?.id === alertB.id);

  check("A cannot list B's agent pools", (await listAgentPools(A, agentB.id)).length === 0);
  check("A cannot delete B's agent pool", (await removeAgentPool(A, poolB.id)) === false);

  let rejected = false;
  try {
    await addAgentPool(A, agentB.id, "Sneaky1111111111111111111111111111111111111");
  } catch {
    rejected = true;
  }
  check("A cannot attach a pool to B's agent (composite FK)", rejected);

  rejected = false;
  try {
    await db
      .insert(agentAlerts)
      .values({ agentId: agentB.id, userId: ids.a, poolAddress: "x", vol1m: 1, baseline: 1, ratio: 1 });
  } catch {
    rejected = true;
  }
  check("an alert cannot pair B's agent with A's user id", rejected);

  const walletB = await addWallet(B, "WalletB11111111111111111111111111111111111");
  if (!walletB) throw new Error("wallet insert returned nothing");
  await addWallet(A, "WalletB11111111111111111111111111111111111", "same address, own row");
  check(
    "A sees only A's wallet row",
    (await listWallets(A)).every((w) => w.userId === ids.a),
  );
  check("A cannot delete B's wallet", (await removeWallet(A, walletB.id)) === false);

  check("A cannot update B's agent", (await updateAgent(A, "volume-watch", { enabled: true }))?.id === agentA.id);
  const bAgent = await ensureAgent(B, "volume-watch");
  check("B's agent is untouched", bAgent.enabled === false);

  rejected = false;
  try {
    await updateAgent(A, "volume-watch", { config: { mult: -1 } });
  } catch {
    rejected = true;
  }
  check("an invalid config is rejected", rejected);
} finally {
  await db.delete(users).where(inArray(users.id, [ids.a, ids.b]));
  await closeDb(db);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("isolation: all checks passed");
