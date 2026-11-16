// Turns users' virtual offices on and off, and holds the global kill switch.
// Run: bun run db:office --enable someone@x.com [--vexis-usd 0.5]   (creates the office, or sets its Vexis-key cap)
//      bun run db:office --disable someone@x.com                      (removes the office; its history stays)
//      bun run db:office --stop-all                                   (pauses every office, rejects unexecuted proposals)
//      bun run db:office --resume-all                                 (lifts --stop-all; other pauses stay)
//      bun run db:office --list

import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { closeDb, createDb } from "../src/client.server.ts";
import { disableOffice, enableOffice, listOffices, stopAllOffices } from "../src/office.server.ts";
import { ADMIN_STOP } from "../src/office.ts";
import { forUser } from "../src/queries.server.ts";
import { officeConfig, users } from "../src/schema.ts";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const { values } = parseArgs({
  options: {
    enable: { type: "string" },
    disable: { type: "string" },
    "vexis-usd": { type: "string", default: "0" },
    "stop-all": { type: "boolean" },
    "resume-all": { type: "boolean" },
    list: { type: "boolean" },
  },
});

const db = createDb(url, { max: 1 });

async function userIdOf(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
  if (!user) throw new Error(`No user with email ${email}`);
  return user.id;
}

try {
  if (values.enable) {
    const usd = Number(values["vexis-usd"]);
    if (!Number.isFinite(usd) || usd < 0) throw new Error("--vexis-usd must be a number, 0 or more");
    await enableOffice(forUser(db, await userIdOf(values.enable)), usd);
    console.log(`Office on for ${values.enable}, Vexis-key cap $${usd} a day.`);
  } else if (values.disable) {
    await disableOffice(forUser(db, await userIdOf(values.disable)));
    console.log(`Office off for ${values.disable}.`);
  } else if (values["stop-all"]) {
    await stopAllOffices(db, ADMIN_STOP);
    console.log("Every office is paused and every unexecuted proposal rejected.");
  } else if (values["resume-all"]) {
    const rows = await db
      .update(officeConfig)
      .set({ paused: false, pausedReason: null, pausedUntil: null })
      .where(and(eq(officeConfig.paused, true), eq(officeConfig.pausedReason, ADMIN_STOP)))
      .returning({ userId: officeConfig.userId });
    console.log(`Resumed ${rows.length} office(s).`);
  } else if (values.list) {
    const offices = await listOffices(db);
    const emails = new Map(
      (await db.select({ id: users.id, email: users.email }).from(users)).map((u) => [u.id, u.email]),
    );
    for (const o of offices) {
      const pause = o.paused ? `paused (${o.pausedReason ?? "by owner"})` : "running";
      console.log(`${emails.get(o.userId) ?? o.userId}  ${pause}  keys ${o.keySource}  cap $${o.vexisDailyUsd}`);
    }
    console.log(`${offices.length} office(s)`);
  } else {
    console.log("Pass --enable <email>, --disable <email>, --stop-all, --resume-all or --list.");
  }
} finally {
  await closeDb(db);
}
