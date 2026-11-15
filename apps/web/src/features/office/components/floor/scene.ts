import type { OfficeAgent } from "@vexis/db/office";
import type { DeskStatus } from "../../office";
import { type Expr, type Pose, SPRITE_H, SPRITE_W, sprite } from "./sprites";
import { alpha, type Ctx, canvas, DESKS, HALF_WALLS, mix, pixelText, rect, rng, shade, T, W, WH, WW } from "./world";

// Draws one frame of the floor into the world canvas: the painted rooms (once), the sky in the windows by the
// UTC hour, the wall screens and desks fed from real data, then props and agents sorted by depth.

/** What the page knows; every screen in the room shows only this. */
export type SceneData = {
  statuses: Record<OfficeAgent, DeskStatus>;
  /** The office is paused: screens go dark and the alarm lights turn. */
  stopped: boolean;
  /** Unfinished proposals, and whether one waits for the owner. */
  board: { cards: number; hot: boolean };
  positions: number;
  executing: boolean;
  solUsd: number | null;
};

export type Actor = {
  id: OfficeAgent;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  sitting: boolean;
  carry: boolean;
  ph: number;
};

export const STATUS_COLOR: Record<DeskStatus, string> = {
  idle: "#6b7280",
  thinking: "#baf448",
  waiting: "#f5c451",
  error: "#ff6b6b",
  off: "#3f3f46",
};

const EXPR: Record<DeskStatus, Expr> = { idle: "idle", thinking: "think", waiting: "wait", error: "err", off: "off" };

const ROOM = {
  A: { wall: "#22304e", top: "#3a4a72", base: "#141c30", trim: "#4a5c88" },
  B: { wall: "#33233f", top: "#56406a", base: "#1d1426", trim: "#6b5284" },
  C: { wall: "#232a33", top: "#3d4855", base: "#14181e", trim: "#4f5d6e" },
};
const roomOf = (x: number) => (x < 10 ? ROOM.A : x < 20 ? ROOM.B : ROOM.C);
const WINDOWS = [
  { x: 8, w: 2 },
  { x: 11, w: 2 },
  { x: 18, w: 2 },
  { x: 23, w: 2 },
];

/** Room labels, in tile units, for the overlay. */
export const ROOMS = [
  { label: "RESEARCH", x: 5, y: 8.35 },
  { label: "RISK ROOM", x: 14.6, y: 8.35 },
  { label: "ENGINE ROOM", x: 25, y: 8.6 },
  { label: "LOUNGE", x: 10, y: 17.45 },
];

// Sky colors across the UTC day: hour, top, bottom, night amount.
const SKY: [number, string, string, number][] = [
  [0, "#070b24", "#16194a", 1],
  [4.5, "#0d1032", "#2a2156", 0.95],
  [6, "#ff8f6b", "#ffd29a", 0.45],
  [7.5, "#5fb0ff", "#bfe4ff", 0.05],
  [16.5, "#5aa8ff", "#cde9ff", 0.05],
  [18, "#ff7a55", "#ffc27a", 0.4],
  [19.3, "#2b2154", "#5a2f6e", 0.85],
  [21, "#070b24", "#16194a", 1],
  [24, "#070b24", "#16194a", 1],
];

function sky(h: number) {
  let i = 0;
  while (i < SKY.length - 2 && h >= (SKY[i + 1]?.[0] ?? 24)) i++;
  const a = SKY[i] ?? SKY[0];
  const b = SKY[i + 1] ?? a;
  if (!a || !b) return { top: "#070b24", bot: "#16194a", night: 1, h };
  const t = (h - a[0]) / (b[0] - a[0] || 1);
  return { top: mix(a[1], b[1], t), bot: mix(a[2], b[2], t), night: a[3] + (b[3] - a[3]) * t, h };
}
type Sky = ReturnType<typeof sky>;

export type Scene = ReturnType<typeof createScene>;

export function createScene(world: HTMLCanvasElement, reduced: boolean) {
  const wg = world.getContext("2d") as Ctx;
  const r = (x: number, y: number, w: number, h: number, col: string) => rect(wg, x, y, w, h, col);
  const bg = paintBackground();
  const mask = paintNightMask();
  const glows = new Map<string, HTMLCanvasElement>();
  const glow = (col: string, rad: number) => {
    const k = col + rad;
    let g = glows.get(k);
    if (!g) {
      g = canvas(rad * 2, rad * 2);
      const c = g.getContext("2d") as Ctx;
      const gr = c.createRadialGradient(rad, rad, 0, rad, rad, rad);
      gr.addColorStop(0, col);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gr;
      c.fillRect(0, 0, rad * 2, rad * 2);
      glows.set(k, g);
    }
    return g;
  };
  const vignette = wg.createRadialGradient(WW / 2, WH / 2, WH * 0.4, WW / 2, WH / 2, WW * 0.62);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.42)");
  const skyline = WINDOWS.map((w, wi) => {
    const rr = rng(40 + wi);
    const blocks: { x: number; w: number; h: number; lights: [number, number][] }[] = [];
    const ww = w.w * T - 8;
    for (let x = 0; x < ww; ) {
      const bw = 3 + Math.floor(rr() * 5);
      const bh = 5 + Math.floor(rr() * 14);
      const lights: [number, number][] = [];
      for (let yy = 2; yy < bh - 1; yy += 2)
        for (let xx = 1; xx < bw - 1; xx += 2) if (rr() < 0.45) lights.push([xx, yy]);
      blocks.push({ x, w: bw, h: bh, lights });
      x += bw + (rr() < 0.3 ? 1 : 0);
    }
    const stars: [number, number, number][] = [];
    for (let s = 0; s < 6; s++) stars.push([1 + Math.floor(rr() * (ww - 2)), 1 + Math.floor(rr() * 12), rr() * 6]);
    return { blocks, stars };
  });

  let RT = 0;
  let data: SceneData;
  let actors: Actor[] = [];
  let selected: OfficeAgent = "manager";
  const statusOf = (id: OfficeAgent): DeskStatus => data.statuses[id];
  const sittingOf = (id: OfficeAgent) => actors.find((a) => a.id === id)?.sitting ?? true;

  function screen(x: number, y: number, w: number, h: number, bgc: string, content: () => void) {
    if (data.stopped) {
      r(x, y, w, h, "#020203");
      return;
    }
    r(x, y, w, h, bgc);
    wg.save();
    wg.beginPath();
    wg.rect(x, y, w, h);
    wg.clip();
    content();
    wg.restore();
    for (let yy = y + 1; yy < y + h; yy += 2) r(x, yy, w, 1, "rgba(0,0,0,.16)");
  }

  function drawWindows(sk: Sky) {
    WINDOWS.forEach((w, wi) => {
      const x = w.x * T + 4;
      const y = 9;
      const ww = w.w * T - 8;
      const hh = 28;
      const gr = wg.createLinearGradient(0, y, 0, y + hh);
      gr.addColorStop(0, sk.top);
      gr.addColorStop(1, sk.bot);
      wg.fillStyle = gr;
      wg.fillRect(x, y, ww, hh);
      const sl = skyline[wi];
      if (!sl) return;
      if (sk.night > 0.5)
        for (const [sx, sy, ph] of sl.stars) {
          wg.globalAlpha = (sk.night - 0.5) * 2 * (reduced ? 1 : 0.4 + 0.6 * Math.abs(Math.sin(RT * 1.4 + ph)));
          r(x + sx, y + sy, 1, 1, "#fff");
        }
      wg.globalAlpha = 1;
      if (wi === 3) {
        if (sk.h >= 5.5 && sk.h <= 18.8) {
          const t = (sk.h - 5.5) / 13.3;
          const sx = x + 2 + t * (ww - 8);
          const sy = y + 4 + Math.abs(t - 0.5) * 30;
          r(sx, sy, 5, 5, "#fff3b0");
          r(sx + 1, sy - 1, 3, 7, "#fff3b0");
          r(sx - 1, sy + 1, 7, 3, "#fff3b0");
        } else {
          r(x + ww - 9, y + 4, 5, 5, "#e9e6d2");
          r(x + ww - 7, y + 4, 3, 3, sk.top);
        }
      }
      if (sk.night < 0.6 && !reduced) {
        wg.globalAlpha = 0.8 * (1 - sk.night);
        const cx = x + ((RT * 2 + wi * 13) % (ww + 16)) - 10;
        r(cx, y + 6, 8, 2, "#ffffff");
        r(cx + 2, y + 5, 4, 1, "#ffffff");
        wg.globalAlpha = 1;
      }
      const silC = mix("#2a3550", "#0a0d1c", sk.night);
      for (const b of sl.blocks) {
        r(x + b.x, y + hh - b.h, b.w, b.h, silC);
        if (sk.night > 0.35) for (const [lx, ly] of b.lights) r(x + b.x + lx, y + hh - b.h + ly, 1, 1, "#ffd98a");
      }
      r(x + ww / 2 - 1, y, 2, hh, "#5c6886");
      r(x, y + 12, ww, 1, "#5c6886");
      r(x, y, ww, 1, "rgba(255,255,255,.18)");
    });
  }

  function drawWallScreens(sk: Sky) {
    // Market screen, research room: the SOL price the footer shows, or a dash.
    screen(51, 9, 74, 30, "#06100b", () => {
      for (let k = 0; k < 5; k++) r(51, 14 + k * 5, 74, 1, "#0c2016");
      pixelText(wg, "SOL/USD", 54, 12, "#7fa58a");
      pixelText(wg, data.solUsd === null ? "-" : `$${data.solUsd.toFixed(2)}`, 54, 20, "#baf448");
      const tick = reduced ? 0 : Math.floor(RT * 20) % 150;
      pixelText(wg, "SIMULATION - NOTHING IS SIGNED", 125 - tick, 31, "#4ad69b");
    });
    // Proposal board, risk room: one card per unfinished proposal; the newest blinks while one waits for the owner.
    pixelText(wg, "PROPOSAL", 233, 11, "#5a3a1e");
    const cards = Math.min(6, data.board.cards);
    for (let i = 0; i < cards; i++) {
      const cx = 229 + (i % 3) * 14;
      const cy = 18 + Math.floor(i / 3) * 10;
      const hot = data.board.hot && i === cards - 1 && !data.stopped;
      if (hot && (reduced || Math.floor(RT * 4) % 2)) r(cx - 1, cy - 1, 13, 10, "#f5c451");
      r(cx, cy, 11, 8, "#f1ede4");
      r(cx + 2, cy + 3, 7, 1, "#9aa3b5");
      r(cx + 2, cy + 5, 5, 1, "#9aa3b5");
      r(cx + 4, cy - 1, 3, 2, hot ? "#f5c451" : "#e5484d");
    }
    // UTC clock, risk room.
    const ang = ((sk.h % 12) / 12) * Math.PI * 2;
    const mang = (sk.h % 1) * Math.PI * 2;
    r(279, 17, 2, 2, "#16131d");
    for (let i = 1; i < 4; i++) r(279.5 + Math.sin(ang) * i, 17.5 - Math.cos(ang) * i, 1, 1, "#16131d");
    for (let i = 1; i < 5; i++) r(279.5 + Math.sin(mang) * i, 17.5 - Math.cos(mang) * i, 1, 1, "#e5484d");
    // Positions screen, engine room: one bar per open position.
    screen(339, 10, 26, 23, "#071022", () => {
      pixelText(wg, `POS ${data.positions}`, 341, 12, "#5fd4ff");
      for (let i = 0; i < Math.min(3, data.positions); i++) {
        const y = 19 + i * 5;
        r(341, y + 1, 22, 2, "#1d2b45");
        r(341, y + 1, 1, 2, "#2c4a7a");
        r(362, y + 1, 1, 2, "#2c4a7a");
      }
    });
    // Executor's terminal: simulating while a proposal executes.
    screen(403, 10, 26, 21, data.executing ? "#0b1f06" : "#071022", () => {
      if (data.executing) {
        pixelText(wg, "SIM", 405, 12, "#baf448");
        const k = reduced ? 0.5 : (RT % 3) / 3;
        r(405, 26, 22, 3, "#173008");
        r(405, 26, Math.round(22 * k), 3, "#baf448");
        for (let j = 0; j < 2; j++) r(405, 19 + j * 3, 6 + ((j * 7 + Math.floor(RT * 8)) % 16), 1, "#7fbf3a");
      } else {
        pixelText(wg, "IDLE", 405, 12, "#2c4a7a");
        r(405, 20, 2, 3, reduced || Math.floor(RT * 2) % 2 ? "#5fd4ff" : "#071022");
      }
    });
  }

  function deskScreen(owner: OfficeAgent, x: number, y: number) {
    const st = statusOf(owner);
    const active = st === "thinking" || st === "waiting";
    screen(x, y, 14, 9, "#081120", () => {
      if (st === "off") return;
      if (!sittingOf(owner) && !active) {
        const t = reduced ? 0 : RT * 6;
        const bx = (1 + Math.abs((t % 20) - 10) * 0.9) | 0;
        const byy = (1 + Math.abs(((t * 0.7) % 10) - 5) * 0.8) | 0;
        r(x + bx, y + byy, 3, 1, "#baf448");
        r(x + bx + 1, y + byy + 1, 1, 1, "#baf448");
        return;
      }
      if (st === "error") {
        pixelText(wg, "ERR", x + 1, y + 2, "#ff6b6b");
        return;
      }
      const k = reduced ? 0 : Math.floor(RT * (active ? 6 : 1.5));
      if (owner === "scout") {
        for (let i = 0; i < 4; i++) {
          const hi = k % 4 === i;
          r(x + 1, y + 1 + i * 2, hi ? 12 : 4 + ((i * 5 + k) % 7), 1, hi ? "#baf448" : "#3a6a9a");
        }
      } else if (owner === "strategist") {
        for (let i = 0; i < 12; i++) r(x + 1 + i, y + Math.round(4 + Math.sin((i + k) * 0.6) * 3), 1, 1, "#ffb36b");
        r(x + 1, y + 8, 12, 1, "#3a2a1e");
      } else if (owner === "risk") {
        for (let i = 0; i < 4; i++) {
          r(x + 1, y + 1 + i * 2, 1, 1, i <= k % 5 ? "#4ad69b" : "#2a4a3a");
          r(x + 3, y + 1 + i * 2, 8, 1, "#2f5f50");
        }
      } else if (owner === "manager") {
        r(x + 2, y + 1, 10, 7, "#d8d4ea");
        for (let i = 0; i < 3; i++) r(x + 3, y + 2 + i * 2, 8 - ((i * 2 + k) % 4), 1, "#8b7cf6");
      } else if (owner === "monitor") {
        const a2 = reduced ? 0 : RT * 3;
        r(x + 6, y + 4, 2, 1, "#5fd4ff");
        for (let i = 1; i < 5; i++) r(x + 7 + Math.cos(a2) * i, y + 4.5 + Math.sin(a2) * i * 0.8, 1, 1, "#5fd4ff");
      } else {
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 3; j++)
            r(x + 1 + j * 4, y + 1 + i * 2, 3, 1, (i + j + k) % 5 === 0 ? "#f5c451" : "#5a4a2a");
      }
    });
  }

  function desk(d: (typeof DESKS)[number]) {
    const x = d.tx * T;
    const y = d.ty * T;
    r(x + 1, y + 2, 30, 1, "#93704f");
    r(x + 1, y + 3, 30, 8, "#7a573c");
    r(x + 1, y + 3, 30, 1, "#a07a55");
    r(x + 1, y + 11, 30, 5, "#5a3e2b");
    r(x + 1, y + 11, 30, 1, "#3e2a1d");
    r(x + 3, y + 12, 9, 3, "#4d3524");
    r(x + 7, y + 13, 2, 1, "#a07a55");
    r(x + 20, y + 12, 9, 3, "#4d3524");
    r(x + 24, y + 13, 2, 1, "#a07a55");
    r(x + 1, y + 16, 30, 1, "rgba(0,0,0,.35)");
    r(x + 8, y - 8, 16, 12, "#1a1c25");
    r(x + 8, y - 8, 16, 1, "#2e3240");
    deskScreen(d.owner, x + 9, y - 7);
    r(x + 23, y + 2, 1, 1, STATUS_COLOR[statusOf(d.owner)]);
    r(x + 15, y + 4, 2, 2, "#1a1c25");
    r(x + 12, y + 6, 8, 1, "#1a1c25");
    r(x + 10, y + 7, 12, 3, "#262935");
    for (let k = 0; k < 5; k++) r(x + 11 + k * 2, y + 8, 1, 1, "#4a4f60");
    r(x + 2, y + 5, 5, 4, "#e9e6dc");
    r(x + 3, y + 6, 3, 1, "#a8a49a");
    r(x + 3, y + 7, 2, 1, "#a8a49a");
    r(x + 26, y + 5, 3, 4, "#e5e7eb");
    r(x + 29, y + 6, 1, 2, "#e5e7eb");
    r(x + 26, y + 5, 3, 1, "#5b3a22");
    if (!reduced && Math.floor(RT * 2 + d.tx) % 3 !== 0) {
      wg.globalAlpha = 0.5;
      r(x + 27, y + 2 - (Math.floor(RT * 3) % 3), 1, 2, "#e5e7eb");
      wg.globalAlpha = 1;
    }
    if (d.owner === "bookkeeper") {
      r(x + 2, y + 1, 6, 2, "#a3844f");
      r(x + 2, y - 1, 6, 2, "#6c4f8a");
      r(x + 2, y - 3, 6, 2, "#3fa7d6");
    }
    if (d.owner === "monitor") {
      r(x + 25, y - 4, 6, 7, "#1a1c25");
      r(x + 26, y - 3, 4, 5, data.stopped ? "#020203" : "#0b2a3a");
      r(x + 27, y - 2, 2, 2, data.stopped ? "#020203" : "#5fd4ff");
    }
    if (d.owner === "strategist") {
      r(x + 3, y - 2, 4, 4, "#9a5b3a");
      r(x + 2, y - 7, 6, 5, "#3c9a5c");
      r(x + 4, y - 9, 2, 3, "#4ab06a");
    }
    if (d.owner === "manager") {
      r(x + 2, y + 1, 7, 2, "#2b2f3a");
      r(x + 3, y + 1, 5, 1, "#d4af37");
    }
    if (d.owner === "risk") {
      r(x + 3, y - 3, 4, 5, "#2fa37f");
      r(x + 4, y - 2, 2, 3, "#f5c451");
    }
    if (d.owner === "scout") {
      r(x + 3, y - 1, 3, 3, "#3fa7d6");
      r(x + 5, y + 1, 2, 2, "#9aa3b5");
    }
  }

  function chair(d: (typeof DESKS)[number]) {
    const cx = (d.tx + 1) * T;
    const sy = (d.ty + 1.6) * T;
    const cc = d.owner === "monitor" || d.owner === "bookkeeper" ? "#3a4150" : "#2f3a52";
    r(cx - 6, sy - 3, 12, 6, cc);
    r(cx - 6, sy - 3, 12, 1, shade(cc, 0.2));
    r(cx - 6, sy + 2, 12, 1, shade(cc, -0.3));
    r(cx - 1, sy + 3, 2, 3, "#1c2130");
    r(cx - 6, sy + 6, 12, 1, "#1c2130");
    r(cx - 6, sy + 7, 2, 1, "#0f1218");
    r(cx + 4, sy + 7, 2, 1, "#0f1218");
  }

  // Props with the y they sort by, so agents walk in front of and behind them.
  const props: { y: number; draw: () => void }[] = [];
  const prop = (y: number, draw: () => void) => props.push({ y, draw });
  for (const d of DESKS) prop((d.ty + 1) * T - 1, () => desk(d));
  for (const d of DESKS) prop((d.ty + 1.6) * T + 1, () => chair(d));
  prop(4 * T - 1, () => {
    r(1, 14, 30, 50, "#4a3324");
    r(1, 14, 30, 2, "#6a4a34");
    r(1, 62, 30, 2, "#2e2016");
    const cols = ["#d97757", "#3fa7d6", "#baf448", "#8b7cf6", "#f5c451", "#2fa37f", "#e5484d"];
    [18, 30, 42, 54].forEach((yy, row) => {
      r(3, yy + 8, 26, 2, "#35251a");
      for (let k = 0; k < 7; k++) {
        const tall = (k + row) % 3 === 0;
        r(3 + k * 4, yy + (tall ? 0 : 2), 3, tall ? 8 : 6, cols[(k + row * 2) % 7] ?? "#fff");
        r(3 + k * 4, yy + (tall ? 1 : 3), 3, 1, "rgba(255,255,255,.25)");
      }
    });
  });
  prop(4 * T - 1, () => {
    const x = 9 * T;
    const y = 3 * T;
    r(x + 4, y + 9, 8, 6, "#9a5b3a");
    r(x + 4, y + 9, 8, 1, "#b06a45");
    r(x + 2, y, 12, 10, "#2f7d4a");
    r(x + 5, y - 5, 6, 7, "#3c9a5c");
    r(x + 1, y + 3, 3, 4, "#3c9a5c");
    r(x + 12, y + 2, 3, 4, "#256b3e");
    r(x + 6, y - 4, 2, 2, "#5ccf7d");
  });
  prop(4 * T - 1, () => {
    const x = 25 * T;
    const y = 3 * T;
    r(x + 1, y + 2, 30, 13, "#2b3241");
    r(x + 1, y + 2, 30, 2, "#3b4558");
    r(x + 1, y + 15, 30, 1, "#141820");
    for (let k = 0; k < 6; k++)
      r(
        x + 4 + k * 4,
        y + 6,
        2,
        2,
        data.stopped ? "#3a1212" : Math.floor(RT * 3 + k) % 3 || reduced ? "#1c2a1c" : "#baf448",
      );
    r(x + 4, y + 10, 24, 2, "#1c222c");
  });
  prop(5 * T - 1, () => {
    for (let i = 0; i < 2; i++) {
      const x = 28 * T + i * 16 + 1;
      r(x, 14, 14, 66, "#121820");
      r(x, 14, 14, 2, "#2a3340");
      r(x + 13, 16, 1, 64, "#0a0d12");
      r(x, 78, 14, 2, "#07090c");
      for (let k = 0; k < 10; k++) {
        r(x + 1, 19 + k * 6, 12, 4, "#1b222c");
        r(x + 2, 20 + k * 6, 6, 1, "#2a3442");
        const v = Math.sin(k * 12.9 + i * 78.2 + Math.floor(reduced ? 0 : RT * 4) * 3.1) * 43758.5;
        const on = v - Math.floor(v);
        r(
          x + 10,
          20 + k * 6,
          1,
          1,
          data.stopped ? "#ff6b6b" : on > 0.6 ? "#4ad69b" : on > 0.35 ? "#baf448" : "#1d2a2a",
        );
        r(x + 11, 21 + k * 6, 1, 1, data.stopped ? "#ff6b6b" : on > 0.8 ? "#5fd4ff" : "#1d2a2a");
      }
    }
    r(28 * T + 2, 70, 3, 10, "#f5c451");
    r(28 * T + 2, 72, 3, 1, "#1a1f26");
    r(28 * T + 2, 75, 3, 1, "#1a1f26");
  });
  prop(9 * T - 1, () => {
    const x = 19 * T;
    const y = 8 * T;
    r(x + 2, y + 2, 12, 13, "#4b5566");
    r(x + 2, y + 2, 12, 2, "#6b7588");
    r(x + 4, y + 3, 8, 1, "#1b1f27");
    r(x + 11, y + 6, 1, 1, "#3a4150");
    r(x + 3, y + 8, 10, 6, "#3a4252");
    for (let k = 0; k < 4; k++) r(x + 4 + k * 2, y + 9 + (k % 2), 1, 3, "#e8e6dd");
  });
  prop(10 * T - 1, () => {
    const x = 29 * T;
    const y = 8 * T;
    r(x + 1, y - 8, 14, 39, "#56606f");
    r(x + 1, y - 8, 14, 2, "#737d8f");
    r(x + 14, y - 6, 1, 37, "#3c4552");
    for (let k = 0; k < 3; k++) {
      const yy = y - 4 + k * 11;
      r(x + 2, yy, 12, 9, "#4b5566");
      r(x + 6, yy + 4, 4, 1, "#a7b2c4");
    }
  });
  for (const [a0, a1] of HALF_WALLS)
    prop(10 * T - 2, () => {
      for (let x = a0; x <= a1; x++) {
        const c = roomOf(x);
        const px = x * T;
        const y = 9 * T;
        r(px, y + 2, T, 4, c.top);
        r(px, y + 2, T, 1, c.trim);
        r(px, y + 6, T, 9, c.wall);
        r(px, y + 14, T, 2, c.base);
        r(px, y + 16, T, 2, "rgba(0,0,0,.25)");
        if (x === a0) r(px, y + 2, 1, 13, shade(c.top, 0.15));
        if (x === a1) r(px + 15, y + 2, 1, 13, shade(c.wall, -0.3));
        if ((x * 7) % 5 === 0) {
          r(px + 4, y - 2, 8, 4, "#7a573c");
          r(px + 5, y - 6, 6, 5, "#3c9a5c");
          r(px + 6, y - 7, 2, 2, "#5ccf7d");
        }
      }
    });
  prop(12 * T - 1, () => {
    const y = 11 * T;
    r(0, y - 4, 48, 6, "#8a6a4a");
    r(0, y - 4, 48, 1, "#a88866");
    r(0, y + 2, 48, 13, "#5a3e2b");
    r(15, y + 3, 1, 12, "#3e2a1d");
    r(31, y + 3, 1, 12, "#3e2a1d");
    r(18, y - 18, 14, 15, "#3a3f4b");
    r(18, y - 18, 14, 2, "#4f5566");
    r(20, y - 14, 10, 4, "#1b1f27");
    r(28, y - 13, 1, 1, "#4ad69b");
    r(22, y - 9, 6, 3, "#1b1f27");
    r(23, y - 6, 4, 3, "#e5e7eb");
    r(4, y - 9, 4, 5, "#e5e7eb");
    r(9, y - 8, 4, 4, "#3fa7d6");
    r(36, y - 10, 8, 6, "#c9a066");
    r(37, y - 11, 6, 1, "#e8c890");
  });
  prop(12 * T - 1, () => {
    const x = 5 * T;
    const y = 11 * T;
    r(x + 3, y - 14, 10, 9, "#5fa8ff");
    r(x + 4, y - 13, 3, 6, "#a8d0ff");
    r(x + 5, y - 15, 6, 1, "#3d7fd0");
    r(x + 2, y - 5, 12, 19, "#d8dee9");
    r(x + 2, y - 5, 12, 1, "#f2f5fa");
    r(x + 5, y, 6, 3, "#5d6675");
    r(x + 6, y + 1, 1, 1, "#ff6b6b");
    r(x + 9, y + 1, 1, 1, "#5fa8ff");
    r(x + 13, y - 4, 1, 18, "#a7b0c0");
  });
  prop(12 * T - 1, () => {
    for (let i = 0; i < 2; i++) {
      const x = (13 + i) * T;
      const y = 11 * T;
      r(x + 1, y - 20, 14, 35, i ? "#3b2a5a" : "#1f3a5a");
      r(x + 1, y - 20, 14, 2, i ? "#5a4580" : "#2f5a8a");
      r(x + 14, y - 18, 1, 33, "#0d0f18");
      r(x + 2, y - 18, 12, 4, "#0d0f18");
      pixelText(wg, i ? "LP" : "VX", x + 4, y - 18, i ? "#f5c451" : "#baf448");
      r(x + 2, y - 13, 12, 10, "#05060a");
      if (!data.stopped && !reduced) {
        const t = RT * 3;
        if (i === 0) {
          r(x + 3 + (Math.floor(t) % 9), y - 6, 2, 2, "#baf448");
          r(x + 3 + ((Math.floor(t * 0.7) + 4) % 9), y - 11, 2, 1, "#ff6b6b");
          r(x + 3, y - 4, 10, 1, "#2a6a3a");
        } else
          for (let k = 0; k < 5; k++) r(x + 3 + k * 2, y - 4 - (Math.floor(t + k * 3) % 7), 1, 1 + (k % 2), "#f5c451");
      }
      r(x + 2, y - 2, 12, 5, "#2a2d38");
      r(x + 4, y - 1, 2, 2, "#e5484d");
      r(x + 9, y - 1, 2, 2, "#5fd4ff");
      r(x + 2, y + 3, 12, 12, i ? "#2e2148" : "#18304a");
    }
  });
  prop(12 * T - 1, () => {
    const x = 24 * T;
    const y = 11 * T;
    r(x + 1, y - 22, 30, 37, "#8a2c36");
    r(x + 1, y - 22, 30, 2, "#b23a46");
    r(x + 30, y - 20, 1, 35, "#4a1820");
    r(x + 3, y - 18, 20, 26, "#1a1f2a");
    const cols = ["#baf448", "#5fd4ff", "#f5c451", "#ff6b6b", "#8b7cf6"];
    for (let rw = 0; rw < 4; rw++)
      for (let k = 0; k < 4; k++) {
        r(x + 4 + k * 5, y - 16 + rw * 6, 3, 4, cols[(rw + k) % 5] ?? "#fff");
        r(x + 4 + k * 5, y - 12 + rw * 6, 4, 1, "#3a4150");
      }
    r(x + 25, y - 18, 4, 8, "#2a2d38");
    r(x + 26, y - 16, 2, 1, data.stopped ? "#3a1212" : "#4ad69b");
    r(x + 5, y + 10, 16, 3, "#0d0f18");
  });
  prop(12 * T - 1, () => {
    const x = 29 * T;
    const y = 11 * T;
    r(x + 4, y + 8, 8, 7, "#b06a45");
    r(x + 2, y - 4, 12, 13, "#2f7d4a");
    r(x + 5, y - 9, 6, 7, "#3c9a5c");
    r(x + 1, y, 3, 4, "#3c9a5c");
  });
  prop(15 * T - 1, () => {
    const x = 2 * T;
    const y = 14 * T;
    r(x, y + 3, 32, 4, "#7a573c");
    r(x, y + 3, 32, 1, "#a07a55");
    r(x + 1, y + 7, 30, 3, "#5a3e2b");
    r(x + 2, y + 10, 2, 4, "#3e2a1d");
    r(x + 28, y + 10, 2, 4, "#3e2a1d");
    r(x + 4, y + 1, 8, 3, "#3fa7d6");
    r(x + 5, y + 2, 5, 1, "#baf448");
    r(x + 20, y + 1, 4, 3, "#e5e7eb");
  });
  prop(16 * T - 1, () => {
    const x = 17 * T;
    const y = 14 * T;
    r(x, y + 2, 64, 22, "#1f5a46");
    r(x, y + 2, 64, 1, "#2f8a6a");
    r(x, y + 24, 64, 4, "#143a2e");
    r(x + 31, y, 2, 26, "#e8e6dd");
    r(x + 1, y + 13, 62, 1, "#e8e6dd");
    r(x + 2, y + 28, 2, 4, "#0d1a14");
    r(x + 60, y + 28, 2, 4, "#0d1a14");
    if (!reduced && !data.stopped)
      r(x + 8 + Math.abs(((RT * 30) % 96) - 48), y + 8 + Math.abs(Math.sin(RT * 6)) * -4, 2, 2, "#ffffff");
    r(x + 4, y + 10, 4, 5, "#e5484d");
    r(x + 56, y + 10, 4, 5, "#3fa7d6");
  });
  prop(16 * T, () => {
    for (const [tx, ty, cc] of [
      [23, 15, "#5a3fa0"],
      [25, 16, "#c0602a"],
    ] as const) {
      const x = tx * T;
      const y = ty * T;
      r(x + 1, y + 4, 14, 11, cc);
      r(x + 2, y + 2, 12, 4, shade(cc, 0.2));
      r(x + 1, y + 13, 14, 2, shade(cc, -0.3));
      r(x + 4, y + 4, 4, 2, shade(cc, 0.35));
    }
  });
  prop(17 * T - 1, () => {
    const x = T;
    const y = 16 * T;
    r(x, y - 4, 64, 8, "#4a2a3a");
    r(x + 2, y - 3, 60, 2, "#6e3a52");
    r(x, y + 4, 64, 10, "#5a3045");
    r(x + 2, y + 4, 28, 4, "#7a4462");
    r(x + 34, y + 4, 28, 4, "#7a4462");
    r(x - 2, y - 2, 4, 16, "#3e2230");
    r(x + 62, y - 2, 4, 16, "#3e2230");
    r(x + 6, y - 6, 8, 5, "#baf448");
    r(x + 48, y - 6, 8, 5, "#5fd4ff");
  });
  prop(17 * T, () => {
    for (const [tx, ty] of [
      [0, 16],
      [29, 16],
    ] as const) {
      const x = tx * T;
      const y = ty * T;
      r(x + 4, y + 8, 8, 7, "#9a5b3a");
      r(x + 2, y - 2, 12, 11, "#2f7d4a");
      r(x + 5, y - 7, 6, 7, "#3c9a5c");
      r(x + 12, y + 1, 3, 4, "#256b3e");
    }
  });

  function poseOf(a: Actor): { pose: Pose; f: number } {
    const st = statusOf(a.id);
    if (a.moving) return { pose: "walk", f: reduced ? 0 : Math.floor(RT * 8) % 4 };
    if (a.sitting && st === "thinking" && !data.stopped)
      return { pose: "type", f: reduced ? 0 : Math.floor(RT * 9) % 2 };
    if (a.sitting) return { pose: "sit", f: reduced ? 0 : Math.floor((RT + a.ph) * 1.2) % 2 };
    return { pose: "stand", f: reduced ? 0 : Math.floor((RT + a.ph) * 1.2) % 2 };
  }

  function drawActor(a: Actor, bubble: boolean) {
    const { pose, f } = poseOf(a);
    const st = statusOf(a.id);
    const bot = a.id === "monitor" || a.id === "executor" || a.id === "bookkeeper";
    const blink = !reduced && (RT + a.ph * 2) % 3.6 < 0.13;
    const frame = bot && pose !== "walk" && pose !== "type" && !reduced ? Math.floor(RT * 6) % 2 : f;
    const s = sprite(a.id, a.dir, frame, pose, data.stopped ? "err" : EXPR[st], blink, a.id === selected);
    const px = Math.round(a.x * T);
    const py = Math.round(a.y * T);
    const hover = bot && !a.sitting && !reduced ? Math.round(Math.sin(RT * 3 + a.ph) * 1.2) - 2 : 0;
    const dx = px - SPRITE_W / 2;
    const dy = a.sitting ? py - 16 : py - (SPRITE_H - 1) + hover;
    if (!a.sitting) {
      wg.globalAlpha = bot ? 0.25 : 0.35;
      r(px - 5, py - 1, 10, 2, "#000");
      r(px - 4, py - 2, 8, 1, "#000");
      wg.globalAlpha = 1;
    }
    if (a.id === selected && !a.sitting) {
      const k = reduced ? 0 : Math.floor(RT * 4) % 2;
      r(px - 7 - k, py - 1, 2, 1, "#baf448");
      r(px + 5 + k, py - 1, 2, 1, "#baf448");
    }
    wg.drawImage(s, dx, dy);
    if (a.carry) {
      const cx = a.dir === 2 ? dx - 1 : dx + 9;
      const cy = dy + 12;
      r(cx, cy, 5, 6, "#f6f4ec");
      r(cx, cy, 5, 1, "#ffffff");
      r(cx + 1, cy + 2, 3, 1, "#9aa3b5");
      r(cx + 1, cy + 4, 2, 1, "#9aa3b5");
      r(cx - 1, cy - 1, 7, 1, "#100d16");
    }
    if (!bubble) emote(a, st, px, dy);
  }

  /** A small mark over the head: "…" while thinking, "!" while waiting or stopped, "x" on error. */
  function emote(a: Actor, st: DeskStatus, px: number, top: number) {
    const e = data.stopped ? "!" : st === "thinking" ? "..." : st === "waiting" ? "!" : st === "error" ? "x" : "";
    if (!e) return;
    const y = top - 9 + (reduced ? 0 : Math.round(Math.sin(RT * 5 + a.ph)));
    if (e === "...") {
      r(px - 6, y, 12, 7, "#100d16");
      r(px - 5, y + 1, 10, 5, "#f6f6ef");
      r(px - 1, y + 7, 2, 1, "#100d16");
      for (let i = 0; i < 3; i++)
        r(px - 4 + i * 3, y + 3 - (!reduced && Math.floor(RT * 4) % 3 === i ? 1 : 0), 2, 2, "#16131d");
      return;
    }
    r(px - 4, y - 1, 9, 9, "#100d16");
    r(px - 3, y, 7, 7, e === "x" || data.stopped ? "#ff6b6b" : "#f5c451");
    const g = e === "!" ? "010010010000010" : "101101010101101";
    for (let i = 0; i < 15; i++) if (g[i] === "1") r(px - 1 + (i % 3), y + 1 + Math.floor(i / 3), 1, 1, "#100d16");
  }

  function render(
    now: number,
    next: { data: SceneData; actors: Actor[]; selected: OfficeAgent; talking: Set<string> },
  ) {
    RT = now / 1000;
    data = next.data;
    actors = next.actors;
    selected = next.selected;
    const d = new Date(now);
    const sk = sky(d.getUTCHours() + d.getUTCMinutes() / 60);
    wg.drawImage(bg, 0, 0);
    drawWindows(sk);
    if (sk.night < 0.7) {
      wg.globalAlpha = 0.07 * (1 - sk.night);
      for (const w of WINDOWS) {
        const x = w.x * T + 4;
        const ww = w.w * T - 8;
        wg.fillStyle = "#fff4d6";
        wg.beginPath();
        wg.moveTo(x, 44);
        wg.lineTo(x + ww, 44);
        wg.lineTo(x + ww + 22, 120);
        wg.lineTo(x + 18, 120);
        wg.closePath();
        wg.fill();
      }
      wg.globalAlpha = 1;
    }
    drawWallScreens(sk);
    const items: { y: number; draw: () => void }[] = [...props];
    for (const a of actors) items.push({ y: a.y * T, draw: () => drawActor(a, next.talking.has(a.id)) });
    items.sort((p, q) => p.y - q.y);
    for (const i of items) i.draw();
    if (sk.night > 0.02) {
      wg.globalAlpha = sk.night * 0.55;
      wg.drawImage(mask, 0, 0);
      wg.globalAlpha = 1;
    }
    wg.globalCompositeOperation = "lighter";
    if (!data.stopped) {
      for (const dk of DESKS) {
        wg.globalAlpha = 0.18 + sk.night * 0.25;
        wg.drawImage(glow(alpha(STATUS_COLOR[statusOf(dk.owner)], 0.55), 22), dk.tx * T + 16 - 22, dk.ty * T - 25);
      }
      wg.globalAlpha = 0.25 + sk.night * 0.3;
      wg.drawImage(glow("rgba(95,212,255,.5)", 20), 332, 2);
      wg.drawImage(glow(data.executing ? "rgba(186,244,72,.7)" : "rgba(95,212,255,.4)", 22), 394, -2);
      wg.drawImage(glow("rgba(186,244,72,.35)", 34), 54, -10);
      wg.drawImage(glow("rgba(255,90,110,.5)", 26), 24 * T - 10, 11 * T - 32);
      wg.drawImage(glow("rgba(95,180,255,.45)", 22), 13.5 * T - 22, 11 * T - 30);
    }
    wg.globalAlpha = 1;
    wg.globalCompositeOperation = "source-over";
    if (data.stopped) {
      const k = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(RT * 6);
      wg.globalAlpha = 0.12 + 0.1 * k;
      r(0, 0, WW, WH, "#ff2a2a");
      wg.globalAlpha = 1;
      [80, 240, 400].forEach((bx, i) => {
        r(bx - 3, 1, 6, 3, "#5a1414");
        r(bx - 2, 0, 4, 2, k > 0.5 ? "#ff6b6b" : "#a12a2a");
        wg.globalCompositeOperation = "lighter";
        wg.globalAlpha = 0.35 + 0.4 * k;
        const sweep = reduced ? 0 : Math.sin(RT * 4 + i) * 60;
        wg.fillStyle = "rgba(255,60,60,.25)";
        wg.beginPath();
        wg.moveTo(bx, 3);
        wg.lineTo(bx + sweep - 18, 120);
        wg.lineTo(bx + sweep + 18, 120);
        wg.closePath();
        wg.fill();
        wg.globalAlpha = 1;
        wg.globalCompositeOperation = "source-over";
      });
    }
    wg.fillStyle = vignette;
    wg.fillRect(0, 0, WW, WH);
  }

  return { render };
}

function paintBackground() {
  const bg = canvas(WW, WH);
  const b = bg.getContext("2d") as Ctx;
  const R = (x: number, y: number, w: number, h: number, col: string) => rect(b, x, y, w, h, col);
  const rr = rng(11);
  for (let y = 3; y < 18; y++)
    for (let x = 0; x < W; x++) {
      const px = x * T;
      const py = y * T;
      if (y >= 9) {
        R(px, py, T, T, (x + y) % 2 ? "#3b3530" : "#433c36");
        for (let k = 0; k < 5; k++)
          R(px + Math.floor(rr() * 15), py + Math.floor(rr() * 15), 1, 1, rr() < 0.5 ? "#4e4740" : "#322d29");
        R(px, py, T, 1, "rgba(255,255,255,.035)");
        R(px, py, 1, T, "rgba(0,0,0,.08)");
        continue;
      }
      const rm = roomOf(x === 10 ? 9 : x === 20 ? 19 : x);
      if (rm === ROOM.A) {
        R(px, py, T, T, "#233353");
        if ((x + y) % 2 === 0)
          for (const [dx, dy] of [
            [7, 3],
            [3, 7],
            [11, 7],
            [7, 11],
          ] as const)
            R(px + dx, py + dy, 2, 2, "#2b3e64");
        else R(px + 7, py + 7, 2, 2, "#1d2b47");
        for (let k = 0; k < 6; k++)
          R(px + Math.floor(rr() * 16), py + Math.floor(rr() * 16), 1, 1, rr() < 0.5 ? "#2a3b5f" : "#1c2945");
      } else if (rm === ROOM.B) {
        const cols = ["#5a3b2c", "#63412f", "#553729", "#5e3e2d"];
        for (let row = 0; row < 4; row++) {
          const yy = py + row * 4;
          const off = ((y * 4 + row) * 7) % 16;
          R(px, yy, T, 4, cols[(x + row + y) % 4] ?? "#5a3b2c");
          R(px, yy + 3, T, 1, "#3f2a1f");
          R(px + off, yy, 1, 3, "#3f2a1f");
          R(px, yy, T, 1, "rgba(255,220,180,.06)");
          if (rr() < 0.4) R(px + Math.floor(rr() * 12), yy + 1, 3, 1, "rgba(0,0,0,.12)");
        }
      } else {
        R(px, py, T, T, "#262c35");
        R(px, py, T, 1, "#323a45");
        R(px, py, 1, T, "#323a45");
        R(px + 15, py, 1, T, "#1a1f26");
        R(px, py + 15, T, 1, "#1a1f26");
        for (let k = 3; k < 14; k += 3) R(px + 2, py + k, 12, 1, "#20262e");
        for (const [dx, dy] of [
          [2, 2],
          [13, 2],
          [2, 13],
          [13, 13],
        ] as const)
          R(px + dx, py + dy, 1, 1, "#4a5564");
      }
    }
  for (let k = 0; k < 32; k += 4) {
    R(27 * T + k, 3 * T + 30, 2, 2, "#f5c451");
    R(27 * T + k + 2, 3 * T + 30, 2, 2, "#1a1f26");
  }
  const pdx = 28.5 * T;
  const pdy = 6.75 * T;
  R(pdx - 9, pdy - 4, 18, 8, "#1a2b12");
  R(pdx - 8, pdy - 3, 16, 6, "#253d17");
  R(pdx - 9, pdy - 4, 18, 1, "#3f5e22");
  R(pdx - 3, pdy - 1, 6, 2, "#3f5e22");
  // Lounge rug with the Vexis mark.
  const rx = 7 * T;
  const ry = 13 * T;
  const rw = 6 * T;
  const rh = 4 * T;
  R(rx, ry, rw, rh, "#2b3a14");
  R(rx + 3, ry + 3, rw - 6, rh - 6, "#1f2a0f");
  for (let k = 6; k < rw - 6; k += 6) {
    R(rx + k, ry + 1, 3, 1, "#4a6420");
    R(rx + k, ry + rh - 2, 3, 1, "#4a6420");
  }
  for (let k = 6; k < rh - 6; k += 6) {
    R(rx + 1, ry + k, 1, 3, "#4a6420");
    R(rx + rw - 2, ry + k, 1, 3, "#4a6420");
  }
  const vx = rx + rw / 2;
  const vy = ry + rh / 2 - 8;
  for (let i = 0; i < 12; i++) {
    R(vx - 13 + i, vy + i, 3, 2, "#baf448");
    R(vx + 10 - i, vy + i, 3, 2, "#baf448");
  }
  R(vx - 1, vy + 12, 2, 3, "#baf448");
  for (let x = 0; x < W; x++) {
    const c = roomOf(x);
    const px = x * T;
    R(px, 0, T, 4, c.top);
    R(px, 4, T, 1, c.trim);
    R(px, 5, T, 38, c.wall);
    if (c === ROOM.A) {
      R(px, 5, 1, 38, shade(c.wall, -0.15));
      R(px + 8, 5, 1, 38, shade(c.wall, 0.05));
    }
    if (c === ROOM.B)
      for (let yy = 9; yy < 42; yy += 8) {
        R(px + 4, yy, 2, 2, shade(c.wall, 0.12));
        R(px + 12, yy + 4, 2, 2, shade(c.wall, 0.12));
      }
    if (c === ROOM.C) {
      R(px, 5, T, 1, shade(c.wall, 0.12));
      R(px + 15, 5, 1, 38, shade(c.wall, -0.2));
      for (const [dx, dy] of [
        [2, 8],
        [13, 8],
        [2, 39],
        [13, 39],
      ] as const)
        R(px + dx, dy, 1, 1, "#566373");
      R(px, 24, T, 1, shade(c.wall, -0.2));
    }
    R(px, 43, T, 5, c.base);
    R(px, 43, T, 1, shade(c.base, 0.3));
  }
  R(0, 48, WW, 3, "rgba(0,0,0,.28)");
  R(0, 51, WW, 2, "rgba(0,0,0,.12)");
  for (const w of WINDOWS) {
    const px = w.x * T;
    const ww = w.w * T;
    R(px + 2, 7, ww - 4, 32, "#5c6886");
    R(px + 3, 8, ww - 6, 30, "#3a4460");
    R(px + 1, 38, ww - 2, 3, "#7a86a3");
    R(px + 1, 41, ww - 2, 1, "#2a3146");
  }
  R(49, 7, 78, 34, "#0b0c11");
  R(49, 7, 78, 1, "#2a2d38");
  R(85, 41, 6, 2, "#0b0c11");
  R(224, 7, 48, 33, "#6b4a2e");
  R(226, 9, 44, 29, "#a07648");
  R(224, 7, 48, 1, "#8a6440");
  R(337, 8, 30, 27, "#0b0c11");
  R(337, 8, 30, 1, "#2a2d38");
  R(401, 8, 30, 25, "#0b0c11");
  R(401, 8, 30, 1, "#2a2d38");
  R(275, 13, 10, 10, "#d9d4c7");
  R(274, 14, 12, 8, "#d9d4c7");
  R(276, 12, 8, 12, "#d9d4c7");
  R(276, 14, 8, 8, "#f4f1e6");
  for (const x of [10, 20]) {
    const px = x * T;
    R(px + 4, 0, 8, 140, "#4a5574");
    R(px + 4, 0, 1, 140, "#5f6b8e");
    R(px + 11, 0, 1, 140, "#353e58");
    R(px + 4, 126, 8, 18, "#2e3650");
    R(px + 4, 140, 8, 4, "#1a1f30");
    R(px + 12, 51, 3, 93, "rgba(0,0,0,.22)");
  }
  return bg;
}

function paintNightMask() {
  const lights: [number, number, number][] = [
    [80, 96, 70],
    [240, 96, 70],
    [400, 104, 70],
    [120, 220, 80],
    [360, 220, 80],
    [24, 172, 34],
    [216, 172, 34],
    [392, 172, 34],
    [416, 60, 30],
    ...DESKS.map((d): [number, number, number] => [d.tx * T + 16, d.ty * T + 2, 34]),
  ];
  const mask = canvas(WW, WH);
  const m = mask.getContext("2d") as Ctx;
  m.fillStyle = "#05081f";
  m.fillRect(0, 0, WW, WH);
  m.globalCompositeOperation = "destination-out";
  for (const [x, y, rad] of lights) {
    const gr = m.createRadialGradient(x, y, 2, x, y, rad);
    gr.addColorStop(0, "rgba(0,0,0,.95)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    m.fillStyle = gr;
    m.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return mask;
}
