import type { OfficeAgent } from "@vexis/db/office";
import { type Ctx, canvas, shade } from "./world";

// The seven characters as 12×22 pixel sprites (14×24 with the outline): four humans for the LLM agents, three
// bots for the code agents. Each frame is drawn once and cached.

type Human = {
  kind: "human";
  skin: string;
  skinSh: string;
  hair: string;
  hairSh: string;
  hairHi: string;
  shirt: string;
  shirtSh: string;
  shirtHi: string;
  pants: string;
  pantsSh: string;
  shoe: string;
  acc: "cap" | "glasses" | "badge" | "tie";
  accent: string;
};
type Bot = { kind: "bot"; led: string; body: string };
export type Look = Human | Bot;

const human = (skin: string, hair: string, shirt: string, pants: string, acc: Human["acc"], accent = ""): Human => ({
  kind: "human",
  skin,
  skinSh: shade(skin, -0.18),
  hair,
  hairSh: shade(hair, -0.3),
  hairHi: shade(hair, 0.22),
  shirt,
  shirtSh: shade(shirt, -0.24),
  shirtHi: shade(shirt, 0.25),
  pants,
  pantsSh: shade(pants, -0.25),
  shoe: "#17151d",
  acc,
  accent,
});

export const LOOKS: Record<OfficeAgent, Look> = {
  scout: human("#f1c27d", "#3b2a20", "#3fa7d6", "#2b3a55", "cap", "#baf448"),
  strategist: human("#c68642", "#1c1c1c", "#d97757", "#3a2f2a", "glasses"),
  risk: human("#e0ac69", "#7a4b2a", "#2fa37f", "#2a3340", "badge"),
  manager: human("#8d5524", "#2a1a12", "#8b7cf6", "#2a2a3a", "tie", "#e5484d"),
  monitor: { kind: "bot", led: "#5fd4ff", body: "#5f7ea3" },
  executor: { kind: "bot", led: "#baf448", body: "#6c8a3c" },
  bookkeeper: { kind: "bot", led: "#f5c451", body: "#a3844f" },
};

export type Pose = "walk" | "sit" | "type" | "stand";
/** The face a bot shows; humans ignore it. */
export type Expr = "idle" | "think" | "wait" | "err" | "off";

const EYE = "#17141f";

function drawHuman(c: Ctx, q: Human, dir: number, f: number, pose: Pose, blink: boolean) {
  const p = (x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x + 1, y + 1, w, h);
  };
  const walk = pose === "walk";
  const sit = pose === "sit" || pose === "type";
  const by = walk ? f % 2 : pose === "stand" || pose === "sit" ? f : 0;
  const sw = walk ? ([0, 1, 0, -1][f] ?? 0) : 0;
  if (dir === 3) {
    if (!sit) {
      if (!walk || f % 2 === 0) {
        p(4, 16, 4, 4, q.pants);
        p(6, 16, 2, 4, q.pantsSh);
        p(4, 20, 5, 1, q.shoe);
      } else if (f === 1) {
        p(6, 16, 2, 4, q.pants);
        p(7, 20, 3, 1, q.shoe);
        p(3, 16, 2, 3, q.pantsSh);
        p(2, 19, 3, 1, q.shoe);
      } else {
        p(3, 16, 2, 4, q.pants);
        p(3, 20, 3, 1, q.shoe);
        p(6, 16, 2, 3, q.pantsSh);
        p(6, 19, 3, 1, q.shoe);
      }
    }
    p(3, 10 + by, 6, 6, q.shirt);
    p(3, 15 + by, 6, 1, q.shirtSh);
    p(3, 10 + by, 1, 6, q.shirtSh);
    p(5, 10 + by, 3, 1, q.shirtHi);
    if (q.acc === "tie") p(8, 11 + by, 1, 3, q.accent);
    p(5 + sw, 10 + by, 2, 5, q.shirtSh);
    p(5 + sw, 15 + by, 2, 1, q.skin);
    p(5, 9 + by, 2, 1, q.skinSh);
    p(3, 1 + by, 7, 8, q.skin);
    p(3, 8 + by, 7, 1, q.skinSh);
    p(10, 5 + by, 1, 2, q.skin);
    p(2, 0 + by, 8, 3, q.hair);
    p(2, 3 + by, 3, 4, q.hair);
    p(2, 7 + by, 2, 1, q.hairSh);
    p(4, 0 + by, 4, 1, q.hairHi);
    p(5, 5 + by, 1, 2, q.skinSh);
    if (blink) p(8, 6 + by, 1, 1, EYE);
    else p(8, 5 + by, 1, 2, EYE);
    p(8, 7 + by, 1, 1, q.skinSh);
    if (q.acc === "cap") {
      p(2, 0 + by, 8, 2, q.accent);
      p(8, 2 + by, 3, 1, shade(q.accent, -0.3));
      p(3, 0 + by, 3, 1, shade(q.accent, 0.3));
    }
    if (q.acc === "glasses") {
      p(7, 5 + by, 3, 2, "#cfe6ff");
      p(6, 5 + by, 1, 1, "#22222a");
      p(8, 6 + by, 1, 1, EYE);
    }
    return;
  }
  if (!sit) {
    const lL = walk && f === 1 ? 1 : 0;
    const lR = walk && f === 3 ? 1 : 0;
    p(3, 16, 3, 4 - lL, q.pants);
    p(6, 16, 3, 4 - lR, q.pantsSh);
    p(2, 20 - lL, 4, 1, q.shoe);
    p(6, 20 - lR, 4, 1, q.shoe);
  }
  p(2, 10 + by, 8, 6, q.shirt);
  p(8, 10 + by, 2, 6, q.shirtSh);
  p(2, 15 + by, 8, 1, q.shirtSh);
  const typing = pose === "type" ? f : -1;
  const la = 10 + by + Math.max(0, sw) - (typing === 0 ? 1 : 0);
  const ra = 10 + by + Math.max(0, -sw) - (typing === 1 ? 1 : 0);
  p(0, la, 2, 5, q.shirt);
  p(10, ra, 2, 5, q.shirtSh);
  p(0, la + 5, 2, 1, q.skin);
  p(10, ra + 5, 2, 1, q.skinSh);
  p(5, 9 + by, 2, 1, q.skinSh);
  if (dir === 1) {
    p(2, 1 + by, 8, 8, q.hair);
    p(1, 1 + by, 1, 6, q.hair);
    p(10, 1 + by, 1, 6, q.hair);
    p(8, 2 + by, 2, 6, q.hairSh);
    p(3, 0 + by, 6, 1, q.hair);
    p(4, 1 + by, 3, 1, q.hairHi);
    p(1, 5 + by, 1, 2, q.skinSh);
    p(10, 5 + by, 1, 2, q.skinSh);
    if (q.acc === "cap") {
      p(2, 0 + by, 8, 3, q.accent);
      p(3, 0 + by, 3, 1, shade(q.accent, 0.3));
      p(5, 3 + by, 2, 1, shade(q.accent, -0.3));
    }
    return;
  }
  p(4, 10 + by, 4, 1, q.shirtHi);
  if (q.acc === "tie") {
    p(5, 11 + by, 2, 1, q.accent);
    p(5, 12 + by, 2, 3, shade(q.accent, -0.15));
  }
  if (q.acc === "badge") {
    p(3, 12 + by, 2, 2, "#f5c451");
    p(3, 12 + by, 1, 1, "#fff1b8");
  }
  p(2, 1 + by, 8, 8, q.skin);
  p(9, 2 + by, 1, 6, q.skinSh);
  p(2, 8 + by, 8, 1, q.skinSh);
  p(2, 0 + by, 8, 3, q.hair);
  p(1, 1 + by, 1, 5, q.hair);
  p(10, 1 + by, 1, 5, q.hair);
  p(2, 3 + by, 1, 2, q.hair);
  p(9, 3 + by, 1, 2, q.hair);
  p(4, 0 + by, 3, 1, q.hairHi);
  if (q.acc === "glasses") {
    p(3, 5 + by, 2, 2, "#cfe6ff");
    p(7, 5 + by, 2, 2, "#cfe6ff");
    p(5, 5 + by, 2, 1, "#22222a");
    p(4, 6 + by, 1, 1, EYE);
    p(7, 6 + by, 1, 1, EYE);
  } else if (blink) {
    p(4, 6 + by, 1, 1, EYE);
    p(7, 6 + by, 1, 1, EYE);
  } else {
    p(4, 5 + by, 1, 2, EYE);
    p(7, 5 + by, 1, 2, EYE);
  }
  p(3, 7 + by, 1, 1, "#e58a80");
  p(8, 7 + by, 1, 1, "#e58a80");
  p(5, 7 + by, 2, 1, shade(q.skin, -0.35));
  if (q.acc === "cap") {
    p(2, 0 + by, 8, 2, q.accent);
    p(1, 2 + by, 10, 1, shade(q.accent, -0.3));
    p(4, 0 + by, 3, 1, shade(q.accent, 0.3));
  }
}

function drawBot(c: Ctx, a: Bot, dir: number, f: number, pose: Pose, expr: Expr, blink: boolean) {
  const p = (x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x + 1, y + 1, w, h);
  };
  const led = expr === "err" ? "#ff6b6b" : expr === "off" ? "#3f3f46" : a.led;
  const m = "#b4bfd0";
  const mSh = "#7e8aa0";
  const bd = a.body;
  const scr = "#0a1220";
  p(5, 0, 2, 1, f % 2 ? led : shade(led, -0.55));
  p(6, 1, 1, 2, mSh);
  p(1, 3, 10, 8, m);
  p(1, 3, 10, 1, "#dbe2ec");
  p(1, 10, 10, 1, mSh);
  p(10, 4, 1, 6, mSh);
  p(0, 5, 1, 3, mSh);
  p(11, 5, 1, 3, mSh);
  if (dir === 1) {
    p(2, 5, 8, 4, mSh);
    for (let k = 3; k < 9; k += 2) p(k, 6, 1, 2, "#5d6880");
  } else if (dir === 3) {
    p(5, 5, 5, 4, scr);
    p(8, 6, 1, 2, led);
  } else {
    p(2, 5, 8, 4, scr);
    if (expr === "err") {
      for (const [x, y] of [
        [2, 5],
        [4, 5],
        [3, 6],
        [2, 7],
        [4, 7],
        [7, 5],
        [9, 5],
        [8, 6],
        [7, 7],
        [9, 7],
      ] as const)
        p(x, y, 1, 1, "#ff6b6b");
    } else if (expr === "think") {
      p(3, 7, 2, 1, led);
      p(7, 7, 2, 1, led);
      p(2 + (f % 4) * 2, 5, 1, 1, shade(led, -0.3));
    } else if (expr === "wait") {
      p(3, 5, 2, 2, led);
      p(7, 5, 2, 2, led);
    } else if (blink || expr === "off") {
      p(3, 7, 2, 1, led);
      p(7, 7, 2, 1, led);
    } else {
      p(3, 6, 2, 2, led);
      p(7, 6, 2, 2, led);
    }
  }
  p(5, 11, 2, 1, "#3a4150");
  p(2, 12, 8, 6, bd);
  p(2, 12, 8, 1, shade(bd, 0.25));
  p(9, 12, 1, 6, shade(bd, -0.25));
  p(2, 17, 8, 1, shade(bd, -0.25));
  if (dir !== 1) {
    p(4, 14, 4, 2, scr);
    p(5, 14, 2 + (f % 2), 1, led);
  }
  const lift = pose === "type" ? f : 0;
  p(0, 12 - lift, 2, 5, mSh);
  p(10, 12 - (pose === "type" ? 1 - f : 0), 2, 5, mSh);
  p(0, 17 - lift, 2, 1, "#4a5368");
  p(10, 17, 2, 1, "#4a5368");
  if (pose !== "sit" && pose !== "type") {
    p(3, 18, 6, 2, "#3a4150");
    p(3, 18, 6, 1, "#555f73");
    p(4, 20, 4, 1, f % 2 ? "#ffd27a" : "#ff9a5a");
    p(5, 21, 2, 1, f % 2 ? "#ff9a5a" : "rgba(255,154,90,.4)");
  }
}

export const SPRITE_W = 14;
export const SPRITE_H = 24;

const cache = new Map<string, HTMLCanvasElement>();

/** One frame, outlined (lime when selected). `dir` 2 is the mirrored side view. */
export function sprite(
  agent: OfficeAgent,
  dir: number,
  f: number,
  pose: Pose,
  expr: Expr,
  blink: boolean,
  selected: boolean,
) {
  const k = [agent, dir, f, pose, expr, blink ? 1 : 0, selected ? 1 : 0].join("|");
  const hit = cache.get(k);
  if (hit) return hit;
  const look = LOOKS[agent];
  const base = canvas(SPRITE_W, SPRITE_H);
  const bc = base.getContext("2d");
  if (!bc) return base;
  const flip = dir === 2;
  const d = flip ? 3 : dir;
  if (look.kind === "bot") drawBot(bc, look, d, f, pose, expr, blink);
  else drawHuman(bc, look, d, f, pose, blink);
  let src = base;
  if (flip) {
    src = canvas(SPRITE_W, SPRITE_H);
    const fc = src.getContext("2d");
    fc?.translate(SPRITE_W, 0);
    fc?.scale(-1, 1);
    fc?.drawImage(base, 0, 0);
  }
  const silhouette = canvas(SPRITE_W, SPRITE_H);
  const sc = silhouette.getContext("2d");
  const out = canvas(SPRITE_W, SPRITE_H);
  const oc = out.getContext("2d");
  if (!sc || !oc) return src;
  sc.drawImage(src, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = selected ? "#baf448" : "#100d16";
  sc.fillRect(0, 0, SPRITE_W, SPRITE_H);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const)
    oc.drawImage(silhouette, dx, dy);
  oc.drawImage(src, 0, 0);
  if (cache.size > 900) cache.clear();
  cache.set(k, out);
  return out;
}
