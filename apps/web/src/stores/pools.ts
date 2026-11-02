import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PoolAlertOverride } from "@/features/notifications/notifications";

export interface FavoritePool {
  address: string;
  name: string;
  binStep: number;
}

interface PoolState {
  favorites: FavoritePool[];
  alertOverrides: Record<string, PoolAlertOverride>;
  toggleFavorite: (pool: FavoritePool) => void;
  setAlertOverride: (address: string, override: PoolAlertOverride | null) => void;
}

// skipHydration for the same reason as the wallet store; the app shell rehydrates after mount.
export const usePools = create<PoolState>()(
  persist(
    (set) => ({
      favorites: [],
      alertOverrides: {},
      toggleFavorite: (pool) =>
        set((s) => ({
          favorites: s.favorites.some((p) => p.address === pool.address)
            ? s.favorites.filter((p) => p.address !== pool.address)
            : [...s.favorites, pool],
          alertOverrides: s.favorites.some((p) => p.address === pool.address)
            ? Object.fromEntries(Object.entries(s.alertOverrides).filter(([address]) => address !== pool.address))
            : s.alertOverrides,
        })),
      setAlertOverride: (address, override) =>
        set((s) => {
          const alertOverrides = { ...s.alertOverrides };
          if (override) alertOverrides[address] = override;
          else delete alertOverrides[address];
          return { alertOverrides };
        }),
    }),
    { name: "vexis-pools", skipHydration: true },
  ),
);
