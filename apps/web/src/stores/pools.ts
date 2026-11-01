import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FavoritePool {
  address: string;
  name: string;
  binStep: number;
}

interface PoolState {
  favorites: FavoritePool[];
  toggleFavorite: (pool: FavoritePool) => void;
}

// skipHydration for the same reason as the wallet store; the app shell rehydrates after mount.
export const usePools = create<PoolState>()(
  persist(
    (set) => ({
      favorites: [],
      toggleFavorite: (pool) =>
        set((s) => ({
          favorites: s.favorites.some((p) => p.address === pool.address)
            ? s.favorites.filter((p) => p.address !== pool.address)
            : [...s.favorites, pool],
        })),
    }),
    { name: "vexis-pools", skipHydration: true },
  ),
);
