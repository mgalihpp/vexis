import { type TouchEvent, useRef } from "react";

const MIN_DX = 64;
const MAX_MS = 600;

/** The tab a finished touch moves to, or null when it was not a horizontal swipe. */
export function swipeTarget(index: number, count: number, dx: number, dy: number, ms: number) {
  if (index < 0 || ms > MAX_MS || Math.abs(dx) < MIN_DX || Math.abs(dx) < 2 * Math.abs(dy)) return null;
  const next = dx < 0 ? index + 1 : index - 1;
  return next >= 0 && next < count ? next : null;
}

type Start = { x: number; y: number; t: number; scrollers: [Element, number][] };

/**
 * Touch handlers that call `go` with the neighbouring tab on a horizontal swipe. A touch on a chart,
 * a form control or a portalled dialog is ignored, and so is one that scrolled a table sideways:
 * the swipe only counts when every horizontal scroller under the finger was already at its edge.
 */
export function useTabSwipe(index: number, count: number, go: (index: number) => void) {
  const start = useRef<Start | null>(null);
  return {
    onTouchStart(e: TouchEvent<HTMLElement>) {
      const target = e.target as Element;
      start.current = null;
      const touch = e.touches[0];
      if (!touch || e.touches.length > 1 || !e.currentTarget.contains(target)) return;
      if (target.closest("input, textarea, select, [role=slider], .recharts-wrapper, [data-no-swipe]")) return;
      const scrollers: [Element, number][] = [];
      for (let el: Element | null = target; el && el !== e.currentTarget; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth) scrollers.push([el, el.scrollLeft]);
      }
      start.current = { x: touch.clientX, y: touch.clientY, t: e.timeStamp, scrollers };
    },
    onTouchEnd(e: TouchEvent<HTMLElement>) {
      const s = start.current;
      start.current = null;
      const touch = e.changedTouches[0];
      if (!s || !touch || s.scrollers.some(([el, left]) => el.scrollLeft !== left)) return;
      const next = swipeTarget(index, count, touch.clientX - s.x, touch.clientY - s.y, e.timeStamp - s.t);
      if (next !== null) go(next);
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}
