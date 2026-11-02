import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  diffWatch,
  EMPTY_SEEN,
  type Notice,
  type NotifyPrefs,
  type PoolAlertOverride,
  type Seen,
  type Watch,
} from "@/features/notifications/notifications";

const MAX_NOTICES = 100;

interface NotificationState {
  items: Notice[];
  seen: Seen;
  /** Applies one poll and returns the notices it added, newest first. */
  ingest: (
    watch: Watch,
    prefs: NotifyPrefs,
    poolNames: Record<string, string>,
    poolOverrides?: Record<string, PoolAlertOverride>,
  ) => Notice[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

// skipHydration for the same reason as the wallet store; the app shell rehydrates after mount.
export const useNotifications = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      seen: EMPTY_SEEN,
      ingest: (watch, prefs, poolNames, poolOverrides) => {
        const { seen, notices } = diffWatch(get().seen, watch, prefs, poolNames, Date.now(), poolOverrides);
        const known = new Set(get().items.map((n) => n.id));
        const added = notices.filter((n) => !known.has(n.id)).reverse();
        set((s) => ({ seen, items: [...added, ...s.items].slice(0, MAX_NOTICES) }));
        return added;
      },
      markRead: (id) => set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      clear: () => set({ items: [] }),
    }),
    { name: "vexis-notifications", version: 1, skipHydration: true },
  ),
);
