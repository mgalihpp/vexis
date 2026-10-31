import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AutoEntry, Snapshot, TiangEntry } from "@vexis/bot-state";

// Dev stand-in for the real bots: it writes exactly the files they write
// (journal.jsonl / activity.jsonl) plus the snapshot.json heartbeat, so the
// dashboard can be built and checked without a wallet or RPC.

const STATE_ROOT = join(import.meta.dir, "../../../.state");
const TICK_MS = Number(process.env.SIM_TICK_MS ?? 3000);
const HALF_WIDTH = 3;

const randomSig = () =>
  Array.from(
    { length: 64 },
    () => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 58)],
  ).join("");

const localStamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// Bots must write snapshot.json atomically so a reader never sees half a file.
async function writeSnapshot(dir: string, snapshot: Snapshot) {
  const path = join(dir, "snapshot.json");
  await writeFile(`${path}.tmp`, JSON.stringify(snapshot));
  await rename(`${path}.tmp`, path);
}

interface SimBot {
  dir: string;
  pool: string;
  pair: string;
  activeBin: number;
  position: { address: string; lower: number; upper: number };
  sol: number;
  log(
    entry: "open" | "rebalance" | "fees" | "error",
    detail: { from?: string; to?: string; message?: string },
  ): Promise<void>;
}

function makeTiang(dir: string): SimBot {
  const append = (e: TiangEntry) => appendFile(join(dir, "journal.jsonl"), `${JSON.stringify(e)}\n`);
  const bot: SimBot = {
    dir,
    pool: "5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6",
    pair: "HYPE-SOL",
    activeBin: 4521,
    position: { address: randomSig().slice(0, 44), lower: 4521, upper: 4523 },
    sol: 4.2,
    async log(kind, d) {
      const ts = Date.now();
      if (kind === "open")
        await append({
          ts,
          kind: "open",
          position: bot.position.address,
          lower: bot.position.lower,
          upper: bot.position.upper,
          signature: randomSig(),
        });
      if (kind === "rebalance")
        await append({
          ts,
          kind: "rebalance",
          from: d.from ?? "",
          to: d.to ?? null,
          closeSignatures: [randomSig()],
          openSignature: randomSig(),
        });
      if (kind === "error") await append({ ts, kind: "error", message: d.message ?? "" });
    },
  };
  return bot;
}

function makeAuto(dir: string): SimBot {
  const append = (e: AutoEntry) => appendFile(join(dir, "activity.jsonl"), `${JSON.stringify(e)}\n`);
  const bot: SimBot = {
    dir,
    pool: "BGm1tav58oGcsQJehL9WXBFXF7D27vZsKefj4xJKD5Y",
    pair: "SOL-USDC",
    activeBin: -1200,
    position: { address: randomSig().slice(0, 44), lower: -1200 - HALF_WIDTH, upper: -1200 + HALF_WIDTH },
    sol: 12.8,
    async log(kind, d) {
      const at = localStamp();
      if (kind === "open")
        await append({ at, kind: "startup", title: "Bot started", detail: `dry run · pool ${bot.pool.slice(0, 4)}` });
      if (kind === "rebalance")
        await append({ at, kind: "rebalanced", title: "Rebalanced", detail: bot.pair, signature: randomSig() });
      if (kind === "fees")
        await append({
          at,
          kind: "feesSwept",
          title: "Fees swept to SOL",
          detail: `${bot.pair} · ~0.0${Math.ceil(Math.random() * 9)} SOL`,
          signature: randomSig(),
        });
      if (kind === "error") await append({ at, kind: "failed", title: "Rebalance failed", detail: d.message });
    },
  };
  return bot;
}

async function tick(bot: SimBot) {
  bot.activeBin += Math.round((Math.random() - 0.5) * 2.4);
  const { lower, upper } = bot.position;
  if (bot.activeBin < lower || bot.activeBin > upper) {
    if (Math.random() < 0.15) {
      await bot.log("error", { message: "Transaction simulation failed: slippage tolerance exceeded" });
    } else {
      const from = bot.position.address;
      const width = upper - lower;
      const nextLower = bot.activeBin - Math.floor(width / 2);
      bot.position = { address: randomSig().slice(0, 44), lower: nextLower, upper: nextLower + width };
      await bot.log("rebalance", { from, to: bot.position.address });
    }
  } else if (Math.random() < 0.05) {
    bot.sol += 0.01;
    await bot.log("fees", {});
  }
  await writeSnapshot(bot.dir, {
    at: Date.now(),
    pool: bot.pool,
    pair: bot.pair,
    activeBin: bot.activeBin,
    position: bot.position,
    wallet: { sol: bot.sol.toFixed(3), x: "0", y: "0" },
  });
}

const bots = [makeTiang(join(STATE_ROOT, "sim-tiang")), makeAuto(join(STATE_ROOT, "sim-auto"))];
for (const bot of bots) {
  await mkdir(bot.dir, { recursive: true });
  await bot.log("open", {});
}
console.log(`simulating ${bots.length} bots into ${STATE_ROOT} every ${TICK_MS}ms`);

const timer = setInterval(() => {
  for (const bot of bots) tick(bot).catch((error) => console.error(error));
}, TICK_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}
