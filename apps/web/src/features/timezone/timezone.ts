import { utcStamp } from "@/features/portfolio/money";
import { useSettings } from "@/stores/settings";

/** Fixed offsets east of UTC, in minutes. Fixed rather than named zones, so there is no daylight saving to model. */
export const UTC_OFFSETS = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120, 180, 210, 240, 270,
  300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765, 780, 840,
];

/** `UTC`, `UTC+7`, `UTC-3:30`. */
export function offsetLabel(offset: number) {
  if (offset === 0) return "UTC";
  const abs = Math.abs(offset);
  const minutes = abs % 60;
  return `UTC${offset < 0 ? "-" : "+"}${Math.floor(abs / 60)}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/** The UTC offset the user picked, in minutes east of UTC. `auto` resolves to the browser's current offset. */
export const useTzOffset = () => {
  const picked = useSettings((s) => s.timezoneOffset);
  return picked === "auto" ? -new Date().getTimezoneOffset() : picked;
};

/** `utcStamp` in the picked zone. */
export function useStamp() {
  const offset = useTzOffset();
  return (ms: number, joiner = " ") => utcStamp(ms, joiner, offset);
}
