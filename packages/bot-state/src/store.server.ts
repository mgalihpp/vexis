import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { journalFormats, parseJournal } from "./formats.ts";
import { deriveHealth, tallyActivity } from "./health.ts";
import { type BotActivity, type BotEvent, type BotSource, type BotSummary, BotsFile, Snapshot } from "./model.ts";

export const HALT_FILE = "HALT";
export const SNAPSHOT_FILE = "snapshot.json";

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readSnapshot(dir: string): Promise<Snapshot | null> {
  const raw = await readText(join(dir, SNAPSHOT_FILE));
  if (raw === null) return null;
  try {
    const parsed = Snapshot.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // The bot may be mid-write; the next cycle's read gets a whole file.
    return null;
  }
}

export interface BotStore {
  sources: BotSource[];
  find(id: string): BotSource | undefined;
  events(source: BotSource): Promise<BotEvent[]>;
  summary(source: BotSource, now: number): Promise<BotSummary>;
  activity(source: BotSource, since: number): Promise<BotActivity>;
}

// Each `dir` in bots.json is relative to bots.json itself, so the registry
// resolves the same from the dev server, the built output, or a systemd unit.
export async function openBotStore(botsFile: string): Promise<BotStore> {
  const path = resolve(botsFile);
  const text = await readText(path);
  if (text === null) throw new Error(`bots registry not found at ${path}`);
  const root = dirname(path);
  const sources = BotsFile.parse(JSON.parse(text)).bots.map((b) => ({ ...b, dir: resolve(root, b.dir) }));

  const events = async (s: BotSource) =>
    parseJournal(s.kind, (await readText(join(s.dir, journalFormats[s.kind].file))) ?? "");

  return {
    sources,
    find: (id) => sources.find((s) => s.id === id),
    events,
    async summary(s, now) {
      const [halt, snapshot, evts] = await Promise.all([
        readText(join(s.dir, HALT_FILE)),
        readSnapshot(s.dir),
        events(s),
      ]);
      return {
        id: s.id,
        name: s.name,
        kind: s.kind,
        health: deriveHealth({ haltReason: halt?.trim() ?? null, snapshot, now, staleAfterMs: s.staleAfterMs }),
        snapshot,
        lastEvent: evts.at(-1) ?? null,
      };
    },
    async activity(s, since) {
      return tallyActivity(s.id, await events(s), since);
    },
  };
}
