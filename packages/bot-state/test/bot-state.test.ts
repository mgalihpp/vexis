import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BotId, deriveHealth, isInRange, parseJournal, type Snapshot, tallyActivity } from "../src/index.ts";
import { openBotStore } from "../src/store.server.ts";

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  at: 1_000_000,
  pool: "pool",
  activeBin: 10,
  position: { address: "pos", lower: 8, upper: 12 },
  wallet: { sol: "1", x: "0", y: "0" },
  ...over,
});

describe("parseJournal", () => {
  test("maps every tiang entry kind and skips torn or unknown lines", () => {
    const text = [
      JSON.stringify({ ts: 1, kind: "open", position: "P1", lower: 5, upper: 6, signature: "SIG1" }),
      '{"ts": 5, "kind": "err',
      JSON.stringify({
        ts: 2,
        kind: "rebalance",
        from: "AAAAxxxxBBBB",
        to: null,
        closeSignatures: ["C1"],
        openSignature: null,
      }),
      JSON.stringify({ ts: 3, kind: "halt", reason: "stale-chain" }),
      JSON.stringify({ ts: 4, kind: "teleport" }),
      "",
    ].join("\n");
    expect(parseJournal("tiang", text)).toEqual([
      { at: 1, kind: "opened", title: "Position opened", detail: "bins 5–6", signature: "SIG1", seq: 0 },
      { at: 2, kind: "rebalanced", title: "Rebalanced", detail: "closed AAAA…BBBB", signature: "C1", seq: 2 },
      { at: 3, kind: "halted", title: "Halted", detail: "stale-chain", seq: 3 },
    ]);
  });

  test("reads auto-rebalance local timestamps and keeps dedupe counts", () => {
    const line = JSON.stringify({
      at: "2026-10-31 08:15:00",
      kind: "rebalanceNeeded",
      title: "Rebalance needed",
      count: 4,
    });
    const [event] = parseJournal("auto-rebalance", line);
    expect(event).toEqual({
      at: new Date(2026, 9, 31, 8, 15, 0).getTime(),
      kind: "out-of-range",
      title: "Rebalance needed",
      detail: undefined,
      signature: undefined,
      repeats: 4,
      seq: 0,
    });
  });
});

describe("deriveHealth", () => {
  test("HALT beats a fresh heartbeat", () => {
    expect(deriveHealth({ haltReason: "manual", snapshot: snap(), now: 1_000_000, staleAfterMs: 60_000 })).toEqual({
      state: "halted",
      reason: "manual",
    });
  });

  test("goes stale only past the threshold", () => {
    const at = (now: number) => deriveHealth({ haltReason: null, snapshot: snap(), now, staleAfterMs: 60_000 });
    expect(at(1_060_000)).toEqual({ state: "live", ageMs: 60_000 });
    expect(at(1_060_001)).toEqual({ state: "stale", ageMs: 60_001 });
  });

  test("no snapshot means unknown, not stale", () => {
    expect(deriveHealth({ haltReason: null, snapshot: null, now: 0, staleAfterMs: 1 })).toEqual({ state: "unknown" });
  });
});

test("isInRange treats both edges as inside and no position as null", () => {
  expect(isInRange(snap({ activeBin: 8 }))).toBe(true);
  expect(isInRange(snap({ activeBin: 13 }))).toBe(false);
  expect(isInRange(snap({ position: null }))).toBeNull();
});

test("tallyActivity counts deduped repeats and ignores events before the window", () => {
  const tally = tallyActivity(
    "b" as BotId,
    [
      { at: 5, kind: "rebalanced", title: "", seq: 0 },
      { at: 20, kind: "rebalanced", title: "", repeats: 3, seq: 1 },
      { at: 21, kind: "error", title: "", seq: 2 },
      { at: 22, kind: "fees", title: "", seq: 3 },
    ],
    10,
  );
  expect(tally).toEqual({ id: "b" as BotId, rebalances: 3, errors: 1, feeClaims: 1 });
});

test("openBotStore resolves dirs against bots.json and summarizes from disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "vexis-"));
  await mkdir(join(root, "state", "t"), { recursive: true });
  await writeFile(
    join(root, "bots.json"),
    JSON.stringify({ bots: [{ id: "t", name: "T", kind: "tiang", dir: "state/t" }] }),
  );
  await writeFile(
    join(root, "state", "t", "journal.jsonl"),
    `${JSON.stringify({ ts: 7, kind: "error", message: "rpc" })}\n`,
  );
  await writeFile(join(root, "state", "t", "snapshot.json"), JSON.stringify(snap({ at: 100 })));

  const store = await openBotStore(join(root, "bots.json"));
  const source = store.find("t");
  if (!source) throw new Error("source missing");
  const summary = await store.summary(source, 200);

  expect(summary.health).toEqual({ state: "live", ageMs: 100 });
  expect(summary.lastEvent?.detail).toBe("rpc");
  expect(store.find("nope")).toBeUndefined();

  await writeFile(join(root, "state", "t", "HALT"), "2026-10-31 manual\n");
  expect((await store.summary(source, 200)).health).toEqual({ state: "halted", reason: "2026-10-31 manual" });
});
