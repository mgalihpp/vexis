// A sound the user picked replaces the built-in chimes. It is kept in localStorage as a data URL,
// which is why the size is capped: the whole origin shares roughly 5 MB.

const KEY = "vexis-custom-sound";
export const MAX_SOUND_BYTES = 700 * 1024;

export interface CustomSound {
  name: string;
  data: string;
}

let cached: CustomSound | null | undefined;

export function getCustomSound(): CustomSound | null {
  if (typeof localStorage === "undefined") return null;
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<CustomSound>) : null;
    cached =
      parsed && typeof parsed.name === "string" && typeof parsed.data === "string"
        ? { name: parsed.name, data: parsed.data }
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Stores the file as the alert sound. Resolves to an error message, or null on success. */
export async function saveCustomSound(file: File): Promise<string | null> {
  if (!file.type.startsWith("audio/")) return "That is not an audio file.";
  if (file.size > MAX_SOUND_BYTES)
    return `Keep it under ${Math.round(MAX_SOUND_BYTES / 1024)} KB, a short clip is enough.`;
  try {
    const sound = { name: file.name, data: await readAsDataUrl(file) };
    localStorage.setItem(KEY, JSON.stringify(sound));
    cached = sound;
    return null;
  } catch {
    return "Could not save the sound, browser storage is full.";
  }
}

export function clearCustomSound() {
  localStorage.removeItem(KEY);
  cached = null;
}

/** Plays the custom sound; false when there is none, so the caller can fall back to the built-in one. */
export function playCustomSound() {
  const sound = getCustomSound();
  if (!sound) return false;
  const audio = new Audio(sound.data);
  audio.volume = 0.8;
  audio.play().catch(() => {});
  return true;
}
