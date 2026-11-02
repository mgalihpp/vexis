import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SpikeMultiplier, SpikeTimeframe } from "@/features/notifications/notifications";
import type { Currency } from "@/features/portfolio/portfolio";

/** How numbers move when their value changes. `off` also covers the system's reduced-motion setting. */
export type NumberMotion = "tween" | "roll" | "flash" | "off";

export interface NotifySettings {
  outOfRange: boolean;
  positions: boolean;
  volumeSpike: boolean;
  /** Also show a system notification while the tab is in the background. */
  browser: boolean;
  /** Play a chime when a poll brings new notices. */
  sound: boolean;
}

interface SettingsState {
  /** The currency a wallet opens in from the favorites bar, wallet bar and wallet list. */
  currency: Currency;
  numberMotion: NumberMotion;
  notify: NotifySettings;
  spikeMultiplier: SpikeMultiplier;
  spikeTimeframe: SpikeTimeframe;
  /** A candle under this volume never counts as a spike, in `spikeMinCurrency`. */
  spikeMin: number;
  spikeMinCurrency: Currency;
  intervalSec: number;
  setCurrency: (currency: Currency) => void;
  setNumberMotion: (motion: NumberMotion) => void;
  setNotify: (key: keyof NotifySettings, value: boolean) => void;
  setSpikeMultiplier: (value: SpikeMultiplier) => void;
  setSpikeTimeframe: (value: SpikeTimeframe) => void;
  setSpikeMin: (value: number) => void;
  setSpikeMinCurrency: (value: Currency) => void;
  setIntervalSec: (value: number) => void;
}

// skipHydration for the same reason as the wallet store; the app shell rehydrates after mount.
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      currency: "sol",
      numberMotion: "tween",
      notify: { outOfRange: true, positions: true, volumeSpike: true, browser: false, sound: true },
      spikeMultiplier: 3,
      spikeTimeframe: "1h",
      spikeMin: 1000,
      spikeMinCurrency: "usd",
      intervalSec: 15,
      setCurrency: (currency) => set({ currency }),
      setNumberMotion: (numberMotion) => set({ numberMotion }),
      setNotify: (key, value) => set((s) => ({ notify: { ...s.notify, [key]: value } })),
      setSpikeMultiplier: (spikeMultiplier) => set({ spikeMultiplier }),
      setSpikeTimeframe: (spikeTimeframe) => set({ spikeTimeframe }),
      setSpikeMin: (spikeMin) => set({ spikeMin }),
      setSpikeMinCurrency: (spikeMinCurrency) => set({ spikeMinCurrency }),
      setIntervalSec: (intervalSec) => set({ intervalSec }),
    }),
    {
      name: "vexis-settings",
      skipHydration: true,
      // Settings saved before a notification option existed still get that option's default.
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsState> | undefined;
        return { ...current, ...saved, notify: { ...current.notify, ...saved?.notify } };
      },
    },
  ),
);
