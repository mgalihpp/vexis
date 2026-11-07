import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/stores/settings";

const TWEEN_MS = 620;
/** One digit is 1.2em tall; the strip moves in the same unit. */
const DIGIT_H = 1.2;

const isDigit = (char: string) => char >= "0" && char <= "9";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// One observer and one frame loop for every number: a refetch changes dozens at once, and a loop or a forced layout
// per number made scrolling stutter. A number off screen just takes its new text.
const onScreen = new WeakMap<Element, boolean>();
let observer: IntersectionObserver | undefined;

function watch(node: Element) {
  if (typeof IntersectionObserver !== "function") return () => {};
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) onScreen.set(entry.target, entry.isIntersecting);
  });
  observer.observe(node);
  return () => {
    observer?.unobserve(node);
    onScreen.delete(node);
  };
}

/** Each step returns true once it is done. */
const steps = new Set<(now: number) => boolean>();
let frame = 0;

function tick(now: number) {
  for (const step of steps) if (step(now)) steps.delete(step);
  frame = steps.size > 0 ? requestAnimationFrame(tick) : 0;
}

function animate(step: (now: number) => boolean) {
  steps.add(step);
  if (!frame) frame = requestAnimationFrame(tick);
  return () => {
    steps.delete(step);
  };
}

const EASE = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const DELTA_KEYFRAMES: Keyframe[] = [
  { offset: 0, opacity: 0, transform: "translateY(0.35em)", easing: EASE },
  { offset: 0.18, opacity: 1, transform: "translateY(0)", easing: EASE },
  { offset: 0.7, opacity: 1, easing: EASE },
  { offset: 1, opacity: 0, transform: "translateY(-0.8em)" },
];

interface RollCell {
  strip: HTMLSpanElement;
  to: number;
}

/** Builds one column per digit showing the old value, so the next frame can roll it to the new one. */
function buildRoll(node: HTMLSpanElement, oldText: string, newText: string) {
  node.textContent = "";
  const sameShape =
    oldText.length === newText.length && [...newText].every((char, i) => isDigit(char) === isDigit(oldText[i] ?? ""));
  const cells: RollCell[] = [];

  [...newText].forEach((char, i) => {
    if (!isDigit(char)) {
      const fixed = document.createElement("span");
      fixed.className = "num-roll-cell";
      fixed.dataset.static = "";
      fixed.textContent = char;
      node.append(fixed);
      return;
    }
    const box = document.createElement("span");
    box.className = "num-roll-cell";
    const strip = document.createElement("span");
    strip.className = "num-roll-strip";
    for (let d = 0; d < 10; d++) {
      const digit = document.createElement("span");
      digit.className = "num-roll-digit";
      digit.textContent = String(d);
      strip.append(digit);
    }
    const start = sameShape ? Number(oldText[i] ?? char) : Number(char);
    strip.style.transform = `translateY(${-start * DIGIT_H}em)`;
    box.append(strip);
    node.append(box);
    cells.push({ strip, to: Number(char) });
  });

  return { cells, sameShape };
}

/**
 * A number that moves when it changes. The style comes from Settings → Numbers; `off` (or the
 * system's reduced-motion setting) swaps the text with no motion.
 *
 * The first render is always the plain formatted value, so the server and the client agree and
 * nothing animates on first paint. Animation starts on the second value only.
 */
export function AnimatedNumber({
  value,
  format = (v) => Math.round(v).toLocaleString("en-US"),
  className = "",
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const motion = useSettings((s) => s.numberMotion);
  // React owns this text node only for the first render; every later change is written by the effect.
  const [initial] = useState(() => format(value));
  const el = useRef<HTMLSpanElement>(null);
  const sr = useRef<HTMLSpanElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const stop = useRef<() => void>(undefined);
  const fmt = useRef(format);
  fmt.current = format;
  const text = format(value);

  useEffect(() => {
    const node = el.current;
    return node ? watch(node) : undefined;
  }, []);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const f = fmt.current;
    const visible = onScreen.get(node) ?? true;
    const mode = motion === "off" || !visible || prefersReducedMotion() ? "off" : motion;
    const from = shown.current;
    const to = value;

    stop.current?.();
    node.classList.remove("num-roll");
    // Roll keeps every digit of every wheel in the DOM, so it reads the plain text instead.
    node.removeAttribute("aria-hidden");
    if (sr.current) sr.current.textContent = "";

    // Same value, different formatter (a currency switch): swap the text, never animate it.
    if (from === to) {
      node.textContent = text;
      return;
    }

    if (mode === "off" || !Number.isFinite(from) || !Number.isFinite(to)) {
      shown.current = to;
      node.textContent = f(to);
      return;
    }

    if (mode === "flash") {
      shown.current = to;
      node.textContent = f(to);
      const delta = to - from;
      const badge = chip.current;
      if (badge && delta !== 0) {
        badge.textContent = `${delta > 0 ? "+" : "-"}${f(Math.abs(delta))}`;
        badge.className = `num-delta ${delta > 0 ? "text-profit" : "text-loss"}`;
        for (const running of badge.getAnimations()) running.cancel();
        badge.animate(DELTA_KEYFRAMES, 1050);
      }
      return;
    }

    if (mode === "roll") {
      const oldText = f(from);
      const newText = f(to);
      const { cells, sameShape } = buildRoll(node, oldText, newText);
      node.classList.add("num-roll");
      node.setAttribute("aria-hidden", "true");
      if (sr.current) sr.current.textContent = newText;
      shown.current = to;
      if (!sameShape) return;
      // Paint the old digits first so the transition has a starting value to leave from.
      void node.offsetWidth;
      for (const cell of cells) cell.strip.style.transform = `translateY(${-cell.to * DIGIT_H}em)`;
      return;
    }

    const start = performance.now();
    stop.current = animate((now) => {
      const p = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - p) ** 3;
      shown.current = p < 1 ? from + (to - from) * eased : to;
      node.textContent = f(shown.current);
      return p >= 1;
    });
    return stop.current;
  }, [value, text, motion]);

  return (
    <span className="num-wrap">
      <span ref={el} className={className}>
        {initial}
      </span>
      <span ref={sr} className="num-sr" />
      <span ref={chip} className="num-delta" aria-hidden="true" />
    </span>
  );
}
