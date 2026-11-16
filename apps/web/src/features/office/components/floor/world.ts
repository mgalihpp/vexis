import type { OfficeAgent } from "@vexis/db/office";

// The office floor's map: a 30×18 grid of 16 px tiles, the desks, the spots agents walk to and the tiles they
// cannot cross. Plain data and a path finder; nothing here draws.

export const T = 16;
export const W = 30;
export const H = 18;
export const WW = W * T;
export const WH = H * T;

export type Ctx = CanvasRenderingContext2D;

export const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export const rect = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A small seeded generator, so the painted floor is the same on every load. */
export function rng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (h: string) => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (v: number[]) => `#${v.map((x) => x.toString(16).padStart(2, "0")).join("")}`;

/** Darkens (k < 0) or lightens (k > 0) a hex color. */
export const shade = (h: string, k: number) =>
  hex(rgb(h).map((v) => clamp(Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k), 0, 255)));

export const mix = (a: string, b: string, t: number) => {
  const B = rgb(b);
  return hex(rgb(a).map((v, i) => Math.round(v + ((B[i] ?? 0) - v) * t)));
};

export const alpha = (h: string, a: number) => `rgba(${rgb(h).join(",")},${a})`;

// A 3×5 pixel font for the screens inside the world.
const GLYPHS: Record<string, string> = {
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "111001111100111",
  "3": "111001111001111",
  "4": "101101111001001",
  "5": "111100111001111",
  "6": "111100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001111",
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  "-": "000000111000000",
  ".": "000000000000010",
  "/": "001001010100100",
  ":": "000010000010000",
  $: "011110010011110",
  "!": "010010010000010",
  " ": "000000000000000",
};

export function pixelText(c: Ctx, s: string, x: number, y: number, col: string) {
  c.fillStyle = col;
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[" "] ?? "";
    for (let i = 0; i < 15; i++) if (g[i] === "1") c.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
    cx += 4;
  }
}

/** Desks, left to right. The Executor has none: it stands on its charging pad. */
export const DESKS: { tx: number; ty: number; owner: OfficeAgent }[] = [
  { tx: 2, ty: 5, owner: "scout" },
  { tx: 6, ty: 5, owner: "strategist" },
  { tx: 12, ty: 5, owner: "risk" },
  { tx: 16, ty: 5, owner: "manager" },
  { tx: 21, ty: 6, owner: "monitor" },
  { tx: 24, ty: 6, owner: "bookkeeper" },
];

/** A spot in tile units with the direction to face on arrival (0 down, 1 up, 2 left, 3 right). */
export type Spot = readonly [number, number, number];

export const EXECUTOR_PAD: Spot = [28.5, 6.75, 0];

/** Where a colleague drops a paper at each desk. */
export const DROP: Partial<Record<OfficeAgent, Spot>> = {
  strategist: [8.5, 6.7, 2],
  risk: [11.5, 6.7, 3],
  manager: [15.5, 6.7, 3],
};

export const ERRAND_SPOT = {
  screen: [22, 3.7, 1],
  terminal: [26, 4.7, 1],
  cabinet: [28.5, 8.7, 3],
} as const satisfies Record<string, Spot>;

/** Where an idle agent drifts while the office has nothing to run; `stay` is how long it lingers, in ms. */
export const STROLLS: readonly { spot: Spot; stay: readonly [number, number] }[] = [
  { spot: [1.5, 12.3, 1], stay: [5_000, 9_000] },
  { spot: [3.5, 12.3, 1], stay: [3_000, 6_000] },
  { spot: [2.5, 15.8, 1], stay: [4_000, 7_000] },
  { spot: [17.5, 12.3, 1], stay: [3_500, 7_000] },
  { spot: [23.3, 14.4, 2], stay: [5_000, 9_000] },
  { spot: [27.5, 12.2, 1], stay: [6_000, 12_000] },
  { spot: [11.5, 3.8, 1], stay: [4_000, 8_000] },
];

export function seatOf(agent: OfficeAgent): Spot {
  if (agent === "executor") return EXECUTOR_PAD;
  const d = DESKS.find((q) => q.owner === agent);
  return d ? [d.tx + 1, d.ty + 1.6, 1] : EXECUTOR_PAD;
}

const blocked = new Set<string>();
const key = (x: number, y: number) => `${x},${y}`;
const block = (x: number, y: number, w = 1, h = 1) => {
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) blocked.add(key(x + i, y + j));
};

/** The wall between the work rooms and the lounge; the gaps are each room's doorway. */
export const HALF_WALLS: readonly (readonly [number, number])[] = [
  [0, 3],
  [6, 13],
  [16, 23],
  [26, 29],
];

/** The lounge's three corners, in tiles: pantry on the left, sofa and TV in the middle, arcade on the right. */
export const LOUNGE = {
  counter: [0, 10],
  cooler: [3, 10],
  table: [1, 14],
  tv: [10, 10],
  rug: [9, 12, 4, 4],
  lamps: [
    [8, 10],
    [13, 10],
  ],
  sofa: [9, 16],
  vending: [17, 10],
  pingPong: [19, 13],
  arcade: [27, 10],
  arcadeRug: [26, 10, 4, 5],
  beanbags: [
    [26, 13],
    [28, 13],
  ],
  plants: [
    [0, 16],
    [8, 16],
    [13, 16],
    [29, 16],
  ],
} as const;

block(0, 0, W, 3);
block(10, 3, 1, 6);
block(20, 3, 1, 6);
block(0, 3, 2, 1);
block(9, 3);
block(25, 3, 2, 1);
block(28, 3, 2, 2);
block(29, 8);
block(19, 8);
for (const [a, b] of HALF_WALLS) block(a, 9, b - a + 1, 1);
block(...LOUNGE.counter, 3, 2);
block(...LOUNGE.cooler, 1, 2);
block(...LOUNGE.table, 2, 1);
block(...LOUNGE.tv, 2, 2);
block(...LOUNGE.sofa, 4, 1);
block(...LOUNGE.vending, 2, 2);
block(...LOUNGE.pingPong, 4, 2);
block(...LOUNGE.arcade, 2, 2);
for (const [x, y] of LOUNGE.beanbags) block(x, y);
for (const [x, y] of LOUNGE.plants) block(x, y);
for (const [x, y] of LOUNGE.lamps) block(x, y);
for (const d of DESKS) block(d.tx, d.ty, 2, 1);

type Tile = [number, number];

/** Shortest tile path from `s` to `e` (both included), or null when none exists. */
export function findPath(s: Tile, e: Tile): Tile[] | null {
  if (s[0] === e[0] && s[1] === e[1]) return [s];
  const prev = new Map<string, Tile | null>([[key(s[0], s[1]), null]]);
  const queue: Tile[] = [s];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as Tile;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cur[0] + dx;
      const ny = cur[1] + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = key(nx, ny);
      const end = nx === e[0] && ny === e[1];
      if (prev.has(k) || (blocked.has(k) && !end)) continue;
      prev.set(k, cur);
      if (end) {
        const path: Tile[] = [[nx, ny]];
        for (let p: Tile | null | undefined = cur; p; p = prev.get(key(p[0], p[1]))) path.unshift(p);
        return path;
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}
