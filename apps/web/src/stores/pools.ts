import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PoolAlertOverride } from "@/features/notifications/notifications";

export interface FavoritePool {
  address: string;
  name: string;
  binStep: number;
  tokenXSymbol?: string;
  tokenXIcon?: string | null;
  tokenYSymbol?: string;
  tokenYIcon?: string | null;
}

// Pools the user opened in analytics, newest first. The analytics page opens the newest one by default.
const MAX_HISTORY = 10;

interface PoolState {
  favorites: FavoritePool[];
  history: FavoritePool[];
  alertOverrides: Record<string, PoolAlertOverride>;
  toggleFavorite: (pool: FavoritePool) => void;
  recordHistory: (pool: FavoritePool) => void;
  updateFavoriteMetadata: (pool: FavoritePool) => void;
  setAlertOverride: (address: string, override: PoolAlertOverride | null) => void;
}

// skipHydration for the same reason as the wallet store; the app shell rehydrates after mount.
export const usePools = create<PoolState>()(
  persist(
    (set) => ({
      favorites: [],
      history: [],
      alertOverrides: {},
      recordHistory: (pool) =>
        set((s) => ({
          history: [pool, ...s.history.filter((p) => p.address !== pool.address)].slice(0, MAX_HISTORY),
        })),
      toggleFavorite: (pool) =>
        set((s) => ({
          favorites: s.favorites.some((p) => p.address === pool.address)
            ? s.favorites.filter((p) => p.address !== pool.address)
            : [...s.favorites, pool],
          alertOverrides: s.favorites.some((p) => p.address === pool.address)
            ? Object.fromEntries(Object.entries(s.alertOverrides).filter(([address]) => address !== pool.address))
            : s.alertOverrides,
        })),
      updateFavoriteMetadata: (pool) =>
        set((s) => ({
          favorites: s.favorites.map((favorite) =>
            favorite.address === pool.address ? { ...favorite, ...pool } : favorite,
          ),
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
