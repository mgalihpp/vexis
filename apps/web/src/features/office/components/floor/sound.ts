// Small square-wave cues, off until the owner turns sound on. The AudioContext is created on that click, since
// browsers only allow audio after a user gesture.

type Cue = "message" | "approval" | "decided";

export function createSound() {
  let ctx: AudioContext | null = null;

  const tone = (freq: number, dur: number, type: OscillatorType, vol: number, at = 0) => {
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };

  return {
    /** Turns sound on (true) or off; false when the browser has no audio. */
    enable(on: boolean) {
      if (!on) {
        void ctx?.close();
        ctx = null;
        return true;
      }
      try {
        ctx = new AudioContext();
        return true;
      } catch {
        return false;
      }
    },
    play(cue: Cue) {
      if (cue === "message") tone(880, 0.05, "square", 0.018);
      if (cue === "approval") {
        tone(1047, 0.08, "sine", 0.05);
        tone(1568, 0.14, "sine", 0.05, 0.08);
      }
      if (cue === "decided") for (const [i, f] of [523, 659, 784].entries()) tone(f, 0.12, "triangle", 0.05, i * 0.07);
    },
  };
}
