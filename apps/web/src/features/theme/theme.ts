import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "vexis-theme";
const DEFAULT: Theme = "dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Runs in <head> before first paint so the stored theme applies without a flash.
// Dark is the default whenever nothing is stored or storage is unavailable.
export const themeScript = `(function(){var t;try{t=localStorage.getItem("${KEY}")}catch(e){}t=t||"${DEFAULT}";var d=t==="system"?matchMedia("${DARK_QUERY}").matches:t!=="light";document.documentElement.classList.toggle("dark",d)})()`;

const apply = (theme: Theme) => {
  const dark = theme === "system" ? matchMedia(DARK_QUERY).matches : theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
};

const stored = (): Theme => {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" || t === "system" ? t : DEFAULT;
  } catch {
    return DEFAULT;
  }
};

export function useTheme() {
  // The server cannot know the stored theme; the real value is read after mount.
  const [theme, setThemeState] = useState<Theme>(DEFAULT);
  useEffect(() => setThemeState(stored()), []);

  // Follow the OS while "system" is selected.
  useEffect(() => {
    if (theme !== "system") return;
    const media = matchMedia(DARK_QUERY);
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: Theme) => {
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setThemeState(next);
  };

  return { theme, setTheme };
}
