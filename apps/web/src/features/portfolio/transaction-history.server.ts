import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { PositionEvent, PositionHistory } from "./portfolio";

/** One wallet's closed-position events by position address. A closed position's history is final. */
export type HistoryCache = Map<string, PositionEvent[]>;

/** A position whose history the Transactions tab lists. `closedAt` is null while it is open. */
export type HistoryRef = Omit<PositionHistory, "events">;

const closedSet = (closed: HistoryRef[]) => new Set(closed.map((p) => p.position));

/** A position that closed since the snapshot was taken is listed as closed; its history is then final. */
const stillActive = (active: HistoryRef[], closed: HistoryRef[]) => {
  const done = closedSet(closed);
  return active.filter((p) => !done.has(p.position));
};

/**
 * Positions to fetch, most recent activity first: every active position (newest opened first),
 * then closed positions missing from the cache, latest close first. `skip` holds what this job
 * already tried, so a failure waits for the next job.
 */
export function historyQueue(
  active: HistoryRef[],
  closed: HistoryRef[],
  cache: HistoryCache,
  skip: ReadonlySet<string>,
): HistoryRef[] {
  const open = stillActive(active, closed).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
  const missing = closed.filter((p) => !cache.has(p.position)).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  return [...open, ...missing].filter((p) => !skip.has(p.position));
}

/** The histories fetched so far for the known positions, and how many positions are known. */
export function collectHistories(
  active: HistoryRef[],
  closed: HistoryRef[],
  activeEvents: ReadonlyMap<string, PositionEvent[]>,
  cache: HistoryCache,
): { histories: PositionHistory[]; total: number } {
  const open = stillActive(active, closed);
  const histories = [
    ...open.flatMap((p) => {
      const events = activeEvents.get(p.position);
      return events ? [{ ...p, events }] : [];
    }),
    ...closed.flatMap((p) => {
      const events = cache.get(p.position);
      return events ? [{ ...p, events }] : [];
    }),
  ];
  return { histories, total: open.length + closed.length };
}

const Event = z.object({
  id: z.string(),
  signature: z.string(),
  type: z.string(),
  at: z.number(),
  amountX: z.number(),
  amountY: z.number(),
  amountXUsd: z.number(),
  amountYUsd: z.number(),
  totalUsd: z.number(),
});
const HistoryFile = z.object({ version: z.literal(1), positions: z.record(z.string(), z.array(Event)) });

const historyFile = (dir: string, wallet: string) => join(dir, `${wallet}.history.json`);

/** A missing, corrupt or older-format file reads as an empty cache; it is only a cache. */
export async function readHistoryCache(dir: string, wallet: string): Promise<HistoryCache> {
  try {
    const parsed = HistoryFile.safeParse(JSON.parse(await readFile(historyFile(dir, wallet), "utf8")));
    return new Map(parsed.success ? Object.entries(parsed.data.positions) : []);
  } catch {
    return new Map();
  }
}

export async function writeHistoryCache(dir: string, wallet: string, cache: HistoryCache): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = historyFile(dir, wallet);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ version: 1, positions: Object.fromEntries(cache) }));
  await rename(tmp, file);
}
