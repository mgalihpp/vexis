import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { SpikeTimeframe, Watch } from "@/features/notifications/notifications";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { useNotifications } from "@/stores/notifications";
import { usePools } from "@/stores/pools";
import { useSettings } from "@/stores/settings";
import { useWallets } from "@/stores/wallets";
import { getWatch } from "../notifications.functions";
import { playAlert } from "../sound";

const MAX_WATCHED = 20;

/** Polls the favorite wallets and pools and turns what changed into notices. Renders nothing. */
export function NotificationWatcher() {
  const { notify, spikeMultiplier, spikeTimeframe, spikeMin, spikeMinCurrency, intervalSec } = useSettings();
  const solPrice = useQuery(pricesQuery).data?.sol ?? null;
  const favoriteWallets = useWallets((s) => s.favorites);
  const favoritePools = usePools((s) => s.favorites);
  const poolOverrides = usePools((s) => s.alertOverrides);
  const ingest = useNotifications((s) => s.ingest);

  const wallets = notify.outOfRange || notify.positions ? favoriteWallets.slice(0, MAX_WATCHED) : [];
  const pools = notify.volumeSpike ? favoritePools.slice(0, MAX_WATCHED) : [];

  const poolTimeframes = pools.map((pool) => ({
    address: pool.address,
    timeframe: poolOverrides[pool.address]?.timeframe ?? spikeTimeframe,
  }));

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["watch", wallets, poolTimeframes],
    queryFn: async (): Promise<Watch> => {
      const groups = new Map<SpikeTimeframe, string[]>();
      for (const pool of poolTimeframes) {
        const group = groups.get(pool.timeframe) ?? [];
        group.push(pool.address);
        groups.set(pool.timeframe, group);
      }
      const walletWatch = wallets.length
        ? await getWatch({ data: { wallets, pools: [], timeframe: spikeTimeframe } })
        : { wallets: [], pools: [] };
      const poolWatches = await Promise.all(
        [...groups].map(([timeframe, group]) =>
          getWatch({ data: { wallets: [], pools: group, timeframe } }),
        ),
      );
      return { wallets: walletWatch.wallets, pools: poolWatches.flatMap((watch) => watch.pools) };
    },
    enabled: wallets.length > 0 || pools.length > 0,
    refetchInterval: intervalSec * 1000,
    // Desktop notifications and sounds are only useful if polling continues while the tab is hidden.
    refetchIntervalInBackground: notify.browser || notify.sound,
    staleTime: 0,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: each fetched poll is applied exactly once.
  useEffect(() => {
    if (!data) return;
    const names = Object.fromEntries(pools.map((p) => [p.address, `${p.name} ${p.binStep}`]));
    const spikeMinUsd = spikeMinCurrency === "usd" ? spikeMin : solPrice === null ? null : spikeMin * solPrice;
    const prefs = { ...notify, spikeMultiplier, spikeTimeframe, spikeMinUsd, currency: spikeMinCurrency, solPrice };
    const added = ingest(data, prefs, names, poolOverrides);
    if (notify.sound) playAlert(added.map((n) => n.kind));
    if (!notify.browser || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    for (const n of added) new Notification(n.title, { body: n.body, icon: "/logo.png", tag: n.id });
  }, [dataUpdatedAt]);

  return null;
}
