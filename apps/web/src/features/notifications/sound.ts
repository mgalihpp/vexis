import type { NoticeKind } from "./notifications";

// Alert sounds are synthesized with Web Audio, so there is no audio file to ship or load.
// A soft two-note chime for news, and a quicker, sharper three-note figure for an out-of-range position.

interface Note {
  freq: number;
  at: number;
  length: number;
}

const CHIME: Note[] = [
  { freq: 1046.5, at: 0, length: 0.5 },
  { freq: 1568, at: 0.11, length: 0.7 },
];
const ALERT: Note[] = [
  { freq: 880, at: 0, length: 0.16 },
  { freq: 659.3, at: 0.14, length: 0.16 },
  { freq: 880, at: 0.28, length: 0.3 },
];

const VOLUME = 0.18;

let context: AudioContext | null = null;

/** Browsers start audio suspended until the page has had a user gesture; resuming after one makes later alerts audible. */
function audio() {
  if (typeof AudioContext === "undefined") return null;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function play(notes: Note[], type: OscillatorType) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + 0.02;
  for (const { freq, at, length } of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    // Fast attack and exponential decay, like a struck bell.
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(VOLUME, start + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + length + 0.05);
  }
}

/** One sound per poll, the urgent one if any notice in it is an out-of-range position. */
export function playAlert(kinds: NoticeKind[]) {
  if (kinds.length === 0) return;
  if (kinds.includes("out-of-range")) play(ALERT, "triangle");
  else play(CHIME, "sine");
}
