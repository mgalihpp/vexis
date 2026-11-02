import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENT = 8;

interface WalletState {
  favorites: string[];
  recent: string[];
  toggleFavorite: (wallet: string) => void;
  visit: (wallet: string) => void;
  clearRecent: () => void;
}

// skipHydration keeps the server render and the first client render identical;
// WalletStoreHydrator reads localStorage after mount.
export const useWallets = create<WalletState>()(
  persist(
    (set) => ({
      favorites: [],
      recent: [],
      toggleFavorite: (wallet) =>
        set((s) => ({
          favorites: s.favorites.includes(wallet) ? s.favorites.filter((w) => w !== wallet) : [...s.favorites, wallet],
        })),
      visit: (wallet) =>
        set((s) => ({ recent: [wallet, ...s.recent.filter((w) => w !== wallet)].slice(0, MAX_RECENT) })),
      clearRecent: () => set({ recent: [] }),
    }),
    { name: "vexis-wallets", skipHydration: true },
  ),
);
