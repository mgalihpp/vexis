// Creates an invite and prints its join link. The token is shown once; only its hash is stored.
// Run: bun run db:invite [--email someone@x.com] [--days 7] [--uses 1] [--note "for Budi"] [--by <admin user id>]
// Make an existing user an admin: bun run db:invite --admin someone@x.com

import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { closeDb, createDb } from "../src/client.server.ts";
import { createInvite } from "../src/queries.server.ts";
import { users } from "../src/schema.ts";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    days: { type: "string", default: "7" },
    uses: { type: "string", default: "1" },
    note: { type: "string" },
    by: { type: "string" },
    admin: { type: "string" },
  },
});

const db = createDb(url, { max: 1 });
try {
  if (values.admin) {
    const [user] = await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.email, values.admin.toLowerCase()))
      .returning({ id: users.id });
    console.log(user ? `${values.admin} is now an admin.` : `No user with email ${values.admin}.`);
  } else {
    const days = Number(values.days);
    const { token, invite } = await createInvite(db, {
      createdBy: values.by,
      email: values.email?.toLowerCase(),
      note: values.note,
      maxUses: Number(values.uses),
      expiresAt: new Date(Date.now() + days * 86_400_000),
    });
    if (!invite) throw new Error("Invite was not created");
    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    console.log(`Invite ${invite.id} (${invite.maxUses} use, expires ${invite.expiresAt.toISOString()})`);
    console.log(`Code: ${token}`);
    console.log(`Link: ${origin}/login?invite=${token}`);
  }
} finally {
  await closeDb(db);
}
