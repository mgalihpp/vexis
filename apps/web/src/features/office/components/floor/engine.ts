import { OFFICE_AGENTS, type OfficeAgent } from "@vexis/db/office";
import { type Actor, createScene, ROOMS, type SceneData } from "./scene";
import { canvas, clamp, findPath, type Spot, seatOf, T, WH, WW } from "./world";

// Runs the floor: the animation loop, the agents' walks, the camera (zoom, pan, follow) and clicks. React hands it
// the latest data through `read()` every frame and owns the overlay's content; the engine only moves the overlay's
// boxes to where their agent or room is on screen.

export type FloorInput = {
  data: SceneData;
  selected: OfficeAgent;
  follow: boolean;
  /** Agents whose speech bubble is showing; they skip the small mark over their head. */
  talking: Set<string>;
};

type Walker = Actor & {
  seat: Spot;
  path: [number, number][];
  face: number;
  /** When a walker that arrived heads back to its seat. */
  backAt: number | null;
};

const MAX_ZOOM = 3.2;

export function createFloor(opts: {
  view: HTMLCanvasElement;
  overlay: HTMLElement;
  read: () => FloorInput;
  onSelect: (agent: OfficeAgent) => void;
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
    };
  });

  function moveTo(a: Walker, to: Spot, carry: boolean) {
    const tiles = findPath([Math.floor(a.x), Math.floor(a.y)], [Math.floor(to[0]), Math.floor(to[1])]) ?? [];
    a.path = tiles.slice(1).map(([x, y]) => [x + 0.5, y + 0.5]);
    a.path.push([to[0], to[1]]);
    a.face = to[2];
    a.sitting = false;
    a.moving = true;
    a.carry = carry;
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
        a.backAt = now + 1500;
      } else a.carry = false;
    }
  }

  // --- camera -----------------------------------------------------------------------------------
  const cam = { z: 1, x: WW / 2, y: WH / 2 };
  const target = { ...cam };
  const clampCam = (c: typeof cam) => {
    const vw = WW / c.z;
    const vh = WH / c.z;
    c.x = clamp(c.x, vw / 2, WW - vw / 2);
    c.y = clamp(c.y, vh / 2, WH - vh / 2);
  };
  function zoomAt(f: number, sx = 0.5, sy = 0.5) {
    const vw = WW / target.z;
    const vh = WH / target.z;
    const wx = target.x - vw / 2 + sx * vw;
    const wy = target.y - vh / 2 + sy * vh;
    target.z = clamp(target.z * f, 1, MAX_ZOOM);
    target.x = wx - (sx - 0.5) * (WW / target.z);
    target.y = wy - (sy - 0.5) * (WH / target.z);
    clampCam(target);
    view.dataset.zoomed = String(target.z > 1.01);
  }
  const toScreen = (wx: number, wy: number) => {
    const vw = WW / cam.z;
    const vh = WH / cam.z;
    return [((wx - (cam.x - vw / 2)) / vw) * 100, ((wy - (cam.y - vh / 2)) / vh) * 100] as const;
  };
  const toWorld = (cx: number, cy: number) => {
    const rc = view.getBoundingClientRect();
    const vw = WW / cam.z;
    const vh = WH / cam.z;
    return [cam.x - vw / 2 + ((cx - rc.left) / rc.width) * vw, cam.y - vh / 2 + ((cy - rc.top) / rc.height) * vh];
  };

  // --- input ------------------------------------------------------------------------------------
  let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5 && target.z > 1.01) {
      drag.moved = true;
      view.setPointerCapture(e.pointerId);
      view.dataset.drag = "true";
      opts.onPan();
    }
    if (drag.moved) {
      target.x -= (dx / view.clientWidth) * (WW / cam.z);
      target.y -= (dy / view.clientHeight) * (WH / cam.z);
      clampCam(target);
      cam.x = target.x;
      cam.y = target.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  };
  const onUp = (e: PointerEvent) => {
    if (drag && !drag.moved) {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      let best: Walker | null = null;
      let bd = 14;
      for (const a of walkers) {
        const d = Math.hypot(a.x * T - (wx ?? 0), a.y * T - (a.sitting ? 10 : 12) - (wy ?? 0));
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (best) opts.onSelect(best.id);
    }
    drag = null;
    delete view.dataset.drag;
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
  view.addEventListener("wheel", onWheel, { passive: false });

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(view.clientWidth * dpr));
    if (view.width !== w) {
      view.width = w;
      view.height = Math.round((w * WH) / WW);
    }
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

    if (input.follow && !following && target.z < 1.8) zoomAt(1.9 / target.z);
    following = input.follow;
    const sel = walkers.find((a) => a.id === input.selected);
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

    scene.render(now, { data: input.data, actors: walkers, selected: input.selected, talking: input.talking });
    if (vg) {
      const vw = WW / cam.z;
      const vh = WH / cam.z;
      vg.imageSmoothingEnabled = false;
      vg.fillStyle = "#07070a";
      vg.fillRect(0, 0, view.width, view.height);
      vg.drawImage(
        world,
        clamp(cam.x - vw / 2, 0, WW - vw),
        clamp(cam.y - vh / 2, 0, WH - vh),
        vw,
        vh,
        0,
        0,
        view.width,
        view.height,
      );
    }
    placeOverlay();
    raf = requestAnimationFrame(frame);
  };

  function placeOverlay() {
    overlay.style.setProperty("--s", (view.clientWidth / (WW / cam.z)).toFixed(3));
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
  }

  raf = requestAnimationFrame(frame);

  return {
    /** Sends `agent` to `to` and back to its seat; ignored while it is already out. */
    walk(agent: OfficeAgent, to: Spot, carry: boolean) {
      const a = walkers.find((w) => w.id === agent);
      if (!a || a.moving || a.backAt !== null || reduced) return;
      moveTo(a, to, carry);
    },
    zoom(f: number) {
      zoomAt(f);
    },
    fit() {
      target.z = 1;
      target.x = WW / 2;
      target.y = WH / 2;
      view.dataset.zoomed = "false";
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      view.removeEventListener("pointerdown", onDown);
      view.removeEventListener("pointermove", onMove);
      view.removeEventListener("pointerup", onUp);
      view.removeEventListener("pointercancel", onCancel);
      view.removeEventListener("wheel", onWheel);
    },
  };
}

export type Floor = ReturnType<typeof createFloor>;
