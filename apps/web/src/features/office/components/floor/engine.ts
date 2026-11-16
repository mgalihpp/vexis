import { OFFICE_AGENTS, type OfficeAgent } from "@vexis/db/office";
import { type Actor, createScene, ROOMS, type SceneData } from "./scene";
import { canvas, clamp, findPath, type Spot, STROLLS, seatOf, T, WH, WW } from "./world";

// Runs the floor: the animation loop, the agents' walks, the camera (zoom, pan, follow) and clicks. React hands it
// the latest data through `read()` every frame and owns the overlay's content; the engine only moves the overlay's
// boxes to where their agent or room is on screen.

export type FloorInput = {
  data: SceneData;
  /** The agent whose card is open; the overlay's `[data-floor-anchor]` box is moved to its head. */
  selected: OfficeAgent | null;
  /** The agent the camera follows: the one picked last, whether or not its card is open. */
  focus: OfficeAgent;
  follow: boolean;
  /** Agents whose speech bubble is showing; they skip the small mark over their head. */
  talking: Set<string>;
  /** While the card is dragged, the anchor stops following its agent so the card stays put. */
  anchorLocked: boolean;
};

type Walker = Actor & {
  seat: Spot;
  path: [number, number][];
  face: number;
  /** When a walker that arrived heads back to its seat. */
  backAt: number | null;
  /** How long it lingers where it arrived before heading back. */
  stay: number;
  /** The earliest it may drift off again. */
  strollAt: number;
  /** The last spot it drifted to, so it does not pick the same one twice. */
  went: number;
};

const MAX_ZOOM = 3.2;

export function createFloor(opts: {
  view: HTMLCanvasElement;
  overlay: HTMLElement;
  read: () => FloorInput;
  /** A click on an agent, or null for a click on the empty floor. */
  onSelect: (agent: OfficeAgent | null) => void;
  onPan: () => void;
}) {
  const { view, overlay } = opts;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const vg = view.getContext("2d");
  const world = canvas(WW, WH);
  const scene = createScene(world, reduced);

  const walkers: Walker[] = OFFICE_AGENTS.map((id, i) => {
    const seat = seatOf(id);
    const stand = id === "executor";
    return {
      id,
      seat,
      x: seat[0],
      y: seat[1],
      dir: stand ? 0 : 1,
      face: stand ? 0 : 1,
      moving: false,
      sitting: !stand,
      carry: false,
      ph: i * 1.37,
      path: [],
      backAt: null,
      stay: 1_500,
      strollAt: 0,
      went: -1,
    };
  });

  function moveTo(a: Walker, to: Spot, carry: boolean) {
    const tiles = findPath([Math.floor(a.x), Math.floor(a.y)], [Math.floor(to[0]), Math.floor(to[1])]);
    if (!tiles) return;
    a.path = tiles.slice(1).map(([x, y]) => [x + 0.5, y + 0.5]);
    a.path.push([to[0], to[1]]);
    a.face = to[2];
    a.sitting = false;
    a.moving = true;
    a.carry = carry;
  }

  /** The office is quiet: an agent at its seat gets up now and then for coffee, the arcade or the window. */
  function stroll(a: Walker, input: FloorInput, now: number) {
    if (reduced || input.data.stopped) return;
    if (a.strollAt === 0) {
      a.strollAt = now + 6_000 + a.ph * 2_600;
      return;
    }
    if (now < a.strollAt) return;
    a.strollAt = now + 45_000 + Math.random() * 60_000;
    const busy = (id: OfficeAgent) => {
      const st = input.data.statuses[id];
      return st === "thinking" || st === "waiting";
    };
    if (a.moving || a.backAt !== null) return;
    if (Math.hypot(a.x - a.seat[0], a.y - a.seat[1]) > 0.6 || busy(a.id)) return;
    // One stroll at a time, and only while nothing runs: a working office keeps everyone at their desk.
    if (OFFICE_AGENTS.some(busy) || walkers.some((w) => w.moving || w.backAt !== null)) return;
    const i = Math.floor(Math.random() * (STROLLS.length - 1));
    const k = a.went >= 0 && i >= a.went ? i + 1 : i;
    const s = STROLLS[k];
    if (!s) return;
    a.went = k;
    a.stay = s.stay[0] + Math.random() * (s.stay[1] - s.stay[0]);
    moveTo(a, s.spot, false);
  }

  function step(a: Walker, dt: number, now: number) {
    if (a.backAt !== null && now >= a.backAt) {
      a.backAt = null;
      moveTo(a, a.seat, false);
    }
    if (!a.path.length) return;
    let rem = (a.id === "monitor" || a.id === "executor" || a.id === "bookkeeper" ? 3.1 : 2.9) * dt;
    while (rem > 0 && a.path.length) {
      const [tx, ty] = a.path[0] as [number, number];
      const dx = tx - a.x;
      const dy = ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 0 : 1;
      if (d <= rem) {
        a.x = tx;
        a.y = ty;
        a.path.shift();
        rem -= d;
      } else {
        a.x += (dx / d) * rem;
        a.y += (dy / d) * rem;
        rem = 0;
      }
    }
    if (!a.path.length) {
      a.moving = false;
      a.dir = a.face;
      const home = Math.hypot(a.x - a.seat[0], a.y - a.seat[1]) < 0.05;
      a.sitting = home && a.id !== "executor";
      if (!home) {
        a.backAt = now + a.stay;
      } else a.carry = false;
    }
  }

  // --- camera -----------------------------------------------------------------------------------
  // Zoom 1 covers the view's box (no empty bars; the longer side is cropped and pans). Zooming out goes down to
  // `minZoom`, where the whole floor fits.
  const cam = { z: 1, x: WW / 2, y: WH / 2 };
  const target = { ...cam };
  /** The world area the view shows at zoom `z`, in world pixels. */
  const span = (z: number) => {
    const w = view.clientWidth || WW;
    const h = view.clientHeight || WH;
    const k = Math.max(w / WW, h / WH) * z;
    return [w / k, h / k] as const;
  };
  const minZoom = () => {
    const w = view.clientWidth || WW;
    const h = view.clientHeight || WH;
    return Math.min(w / WW, h / WH) / Math.max(w / WW, h / WH);
  };
  const clampCam = (c: typeof cam) => {
    const [vw, vh] = span(c.z);
    c.x = vw >= WW ? WW / 2 : clamp(c.x, vw / 2, WW - vw / 2);
    c.y = vh >= WH ? WH / 2 : clamp(c.y, vh / 2, WH - vh / 2);
  };
  const pannable = () => {
    const [vw, vh] = span(target.z);
    return vw < WW - 0.5 || vh < WH - 0.5;
  };
  function zoomAt(f: number, sx = 0.5, sy = 0.5) {
    const [vw, vh] = span(target.z);
    const wx = target.x - vw / 2 + sx * vw;
    const wy = target.y - vh / 2 + sy * vh;
    target.z = clamp(target.z * f, minZoom(), MAX_ZOOM);
    const [nw, nh] = span(target.z);
    target.x = wx - (sx - 0.5) * nw;
    target.y = wy - (sy - 0.5) * nh;
    clampCam(target);
    view.dataset.zoomed = String(pannable());
  }
  const toScreen = (wx: number, wy: number) => {
    const [vw, vh] = span(cam.z);
    return [((wx - (cam.x - vw / 2)) / vw) * 100, ((wy - (cam.y - vh / 2)) / vh) * 100] as const;
  };
  const toWorld = (cx: number, cy: number) => {
    const rc = view.getBoundingClientRect();
    const [vw, vh] = span(cam.z);
    return [cam.x - vw / 2 + ((cx - rc.left) / rc.width) * vw, cam.y - vh / 2 + ((cy - rc.top) / rc.height) * vh];
  };

  // --- input ------------------------------------------------------------------------------------
  let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  let hovered: OfficeAgent | null = null;
  const agentAt = (cx: number, cy: number) => {
    const [wx, wy] = toWorld(cx, cy);
    let best: Walker | null = null;
    let bd = 14;
    for (const a of walkers) {
      const d = Math.hypot(a.x * T - (wx ?? 0), a.y * T - (a.sitting ? 10 : 12) - (wy ?? 0));
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  };
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag && e.pointerType === "mouse") {
      hovered = agentAt(e.clientX, e.clientY)?.id ?? null;
      view.dataset.hover = String(hovered !== null);
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5 && pannable()) {
      drag.moved = true;
      view.setPointerCapture(e.pointerId);
      view.dataset.drag = "true";
      opts.onPan();
    }
    if (drag.moved) {
      const [vw, vh] = span(cam.z);
      target.x -= (dx / view.clientWidth) * vw;
      target.y -= (dy / view.clientHeight) * vh;
      clampCam(target);
      cam.x = target.x;
      cam.y = target.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  };
  const onUp = (e: PointerEvent) => {
    if (drag && !drag.moved) opts.onSelect(agentAt(e.clientX, e.clientY)?.id ?? null);
    drag = null;
    delete view.dataset.drag;
  };
  const onLeave = () => {
    hovered = null;
    view.dataset.hover = "false";
  };
  const onCancel = () => {
    drag = null;
    delete view.dataset.drag;
  };
  // Ctrl + wheel (and a trackpad pinch) zooms; a plain wheel keeps scrolling the page.
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rc = view.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, (e.clientX - rc.left) / rc.width, (e.clientY - rc.top) / rc.height);
  };
  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onCancel);
  view.addEventListener("pointerleave", onLeave);
  view.addEventListener("wheel", onWheel, { passive: false });

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(view.clientWidth * dpr));
    const h = Math.max(1, Math.round(view.clientHeight * dpr));
    if (view.width !== w || view.height !== h) {
      view.width = w;
      view.height = h;
    }
    clampCam(target);
    view.dataset.zoomed = String(pannable());
  };
  const observer = new ResizeObserver(resize);
  observer.observe(view);
  resize();

  // --- loop -------------------------------------------------------------------------------------
  let last = performance.now();
  let following = false;
  let raf = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const now = Date.now();
    const input = opts.read();
    for (const a of walkers) step(a, input.data.stopped ? 0 : dt, now);
    for (const a of walkers) stroll(a, input, now);

    if (input.follow && !following && target.z < 1.8) zoomAt(1.9 / target.z);
    following = input.follow;
    const sel = walkers.find((a) => a.id === input.focus);
    if (following && sel) {
      target.x = sel.x * T;
      target.y = sel.y * T - 12;
      clampCam(target);
    }
    const k = reduced ? 1 : 1 - Math.exp(-dt * 9);
    cam.z += (target.z - cam.z) * k;
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;
    clampCam(cam);

    scene.render(now, { data: input.data, actors: walkers, selected: input.selected, hovered, talking: input.talking });
    if (vg) {
      const [vw, vh] = span(cam.z);
      vg.imageSmoothingEnabled = false;
      vg.fillStyle = "#07070a";
      vg.fillRect(0, 0, view.width, view.height);
      const k = view.width / vw;
      vg.drawImage(world, (vw / 2 - cam.x) * k, (vh / 2 - cam.y) * k, WW * k, WH * k);
    }
    placeOverlay(input.selected, input.anchorLocked);
    raf = requestAnimationFrame(frame);
  };

  function placeOverlay(selected: OfficeAgent | null, locked: boolean) {
    overlay.style.setProperty("--s", (view.clientWidth / span(cam.z)[0]).toFixed(3));
    for (const el of overlay.querySelectorAll<HTMLElement>("[data-floor-room]")) {
      const room = ROOMS[Number(el.dataset.floorRoom)];
      if (!room) continue;
      const [x, y] = toScreen(room.x * T, room.y * T);
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
    }
    for (const el of overlay.querySelectorAll<HTMLElement>("[data-floor-agent]")) {
      const a = walkers.find((w) => w.id === el.dataset.floorAgent);
      if (!a) continue;
      const [x, y] = toScreen(a.x * T, a.sitting ? a.y * T - 18 : a.y * T - 26);
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      el.style.visibility = x < -10 || x > 110 || y < -5 || y > 115 ? "hidden" : "visible";
    }
    const anchor = overlay.querySelector<HTMLElement>("[data-floor-anchor]");
    const sel = walkers.find((w) => w.id === selected);
    if (anchor && sel && !locked) {
      const [x, y] = toScreen(sel.x * T, sel.sitting ? sel.y * T - 18 : sel.y * T - 26);
      anchor.style.left = `${x}%`;
      anchor.style.top = `${y}%`;
    }
  }

  raf = requestAnimationFrame(frame);

  return {
    /** Sends `agent` to `to` and back to its seat; ignored while it is already out. */
    walk(agent: OfficeAgent, to: Spot, carry: boolean) {
      const a = walkers.find((w) => w.id === agent);
      if (!a || a.moving || a.backAt !== null || reduced) return;
      a.stay = 1_500;
      moveTo(a, to, carry);
    },
    zoom(f: number) {
      zoomAt(f);
    },
    fit() {
      target.z = minZoom();
      target.x = WW / 2;
      target.y = WH / 2;
      clampCam(target);
      view.dataset.zoomed = String(pannable());
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      view.removeEventListener("pointerdown", onDown);
      view.removeEventListener("pointermove", onMove);
      view.removeEventListener("pointerup", onUp);
      view.removeEventListener("pointercancel", onCancel);
      view.removeEventListener("pointerleave", onLeave);
      view.removeEventListener("wheel", onWheel);
    },
  };
}

export type Floor = ReturnType<typeof createFloor>;
