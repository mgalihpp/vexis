// Moves stored secrets to the current schemes: wallet secret keys from AES under WALLET_ENC_KEY to a sealed box,
// RPC URLs to RPC_ENC_KEY (and their host to the clear column), users' LLM keys to LLM_ENC_KEY.
// Run: bun run db:rewrap                (dry run: counts only, writes nothing)
//      bun run db:rewrap --apply        (writes; safe to repeat, rows already current are skipped)
//      bun run db:rewrap --keygen       (prints a new WALLET_PUBLIC_KEY / WALLET_PRIVATE_KEY pair, touches no database)
// Needs, in the environment of whoever runs it: DATABASE_URL, WALLET_PUBLIC_KEY, WALLET_ENC_KEY (the old key),
// RPC_ENC_KEY and LLM_ENC_KEY (new, different from the keys they were split from), and for reading `v1` TOKEN_ENC_KEY.
// Never prints a secret, only counts. Each write only lands if the row still holds the value that was read.

import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { and, eq, isNull, sql } from "drizzle-orm";
import { closeDb, createDb } from "../src/client.server.ts";
import { type Rewrap, rewrapSymmetric, rewrapWalletSecret } from "../src/rewrap.ts";
import { officeConfig, rebalanceWallets } from "../src/schema.ts";
import { generateWalletKeypair } from "../src/secret.ts";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {}

const { values } = parseArgs({ options: { apply: { type: "boolean" }, keygen: { type: "boolean" } } });

if (values.keygen) {
  const pair = generateWalletKeypair();
  console.log(`WALLET_PUBLIC_KEY="${pair.publicKey}"   # web app and office`);
  console.log(`WALLET_PRIVATE_KEY="${pair.privateKey}"   # runner only`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
for (const name of ["WALLET_PUBLIC_KEY", "WALLET_ENC_KEY", "RPC_ENC_KEY", "LLM_ENC_KEY"]) {
  if (!process.env[name]) throw new Error(`${name} is not set`);
}
if (process.env.RPC_ENC_KEY === process.env.WALLET_ENC_KEY)
  throw new Error("RPC_ENC_KEY must differ from WALLET_ENC_KEY");
if (process.env.LLM_ENC_KEY === process.env.TOKEN_ENC_KEY)
  throw new Error("LLM_ENC_KEY must differ from TOKEN_ENC_KEY");

const db = createDb(url, { max: 1 });
const apply = values.apply === true;
const tally = { current: 0, rewrap: 0, unreadable: 0, written: 0, raced: 0 };

const count = (r: Rewrap) => {
  tally[r.state]++;
  return r;
};
const hostOf = (plain: string) => (URL.canParse(plain) ? new URL(plain).host : null);

async function swap(write: () => Promise<{ length: number }>) {
  if (!apply) return;
  const rows = await write();
  if (rows.length > 0) tally.written++;
  else tally.raced++;
}

try {
  for (const w of await db.select().from(rebalanceWallets)) {
    const set: Partial<typeof rebalanceWallets.$inferInsert> = {};
    const secret = count(rewrapWalletSecret(w.secretKey));
    if (secret.state === "rewrap") set.secretKey = secret.next;
    if (w.rpcUrl) {
      const rpc = count(rewrapSymmetric(w.rpcUrl, "RPC_ENC_KEY"));
      if (rpc.state === "rewrap") set.rpcUrl = rpc.next;
      if (rpc.state !== "unreadable" && !w.rpcHost) set.rpcHost = hostOf(rpc.plain ?? "");
    }
    if (Object.keys(set).length > 0)
      await swap(() =>
        db
          .update(rebalanceWallets)
          .set(set)
          .where(
            and(
              eq(rebalanceWallets.userId, w.userId),
              eq(rebalanceWallets.secretKey, w.secretKey),
              w.rpcUrl === null ? isNull(rebalanceWallets.rpcUrl) : eq(rebalanceWallets.rpcUrl, w.rpcUrl),
            ),
          )
          .returning({ id: rebalanceWallets.userId }),
      );
  }

  for (const o of await db.select().from(officeConfig)) {
    const set: Partial<typeof officeConfig.$inferInsert> = {};
    if (o.officeSecretKey) {
      const secret = count(rewrapWalletSecret(o.officeSecretKey));
      if (secret.state === "rewrap") set.officeSecretKey = secret.next;
    }
    if (o.officeRpcUrl) {
      const rpc = count(rewrapSymmetric(o.officeRpcUrl, "RPC_ENC_KEY"));
      if (rpc.state === "rewrap") set.officeRpcUrl = rpc.next;
      if (rpc.state !== "unreadable" && !o.officeRpcHost) set.officeRpcHost = hostOf(rpc.plain ?? "");
    }
    const keys = { ...o.llmKeys } as Record<string, string>;
    let keysChanged = false;
    for (const [provider, blob] of Object.entries(keys)) {
      const key = count(rewrapSymmetric(blob, "LLM_ENC_KEY"));
      if (key.state === "rewrap") {
        keys[provider] = key.next;
        keysChanged = true;
      }
    }
    if (keysChanged) set.llmKeys = keys;
    if (Object.keys(set).length > 0)
      await swap(() =>
        db
          .update(officeConfig)
          .set(set)
          .where(
            and(
              eq(officeConfig.userId, o.userId),
              o.officeSecretKey === null
                ? isNull(officeConfig.officeSecretKey)
                : eq(officeConfig.officeSecretKey, o.officeSecretKey),
              o.officeRpcUrl === null
                ? isNull(officeConfig.officeRpcUrl)
                : eq(officeConfig.officeRpcUrl, o.officeRpcUrl),
              sql`${officeConfig.llmKeys} = ${JSON.stringify(o.llmKeys)}::jsonb`,
            ),
          )
          .returning({ id: officeConfig.userId }),
      );
  }
} finally {
  await closeDb(db);
}

console.log(`${apply ? "Applied" : "Dry run (nothing written; pass --apply)"}:`, JSON.stringify(tally));
if (tally.unreadable > 0) console.log("Some values open with no key given here; their users have to save them again.");
