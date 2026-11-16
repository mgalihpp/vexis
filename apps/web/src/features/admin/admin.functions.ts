import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@vexis/db/client";
import { listHeartbeats } from "@vexis/db/heartbeat-queries";
import { SCHEDULES } from "@vexis/shared/heartbeat";
import { requireViewer } from "@/features/auth/auth.middleware";

/** Every schedule the runtimes write a heartbeat for; a schedule with no row yet has null times. */
export const getHeartbeats = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(async ({ context }) => {
    if (context.viewer.role !== "admin") throw redirect({ to: "/" });
    const rows = new Map((await listHeartbeats(getDb())).map((r) => [r.name, r]));
    const now = Date.now();
    return {
      now,
      schedules: Object.entries(SCHEDULES).map(([name, spec]) => {
        const row = rows.get(name);
        return {
          name,
          runtime: spec.runtime,
          staleMs: spec.staleMs,
          lastTickAt: row?.lastTickAt?.getTime() ?? null,
          lastError: row?.lastError ?? null,
          lastErrorAt: row?.lastErrorAt?.getTime() ?? null,
          alerting: row?.alertedAt != null,
        };
      }),
    };
  });
