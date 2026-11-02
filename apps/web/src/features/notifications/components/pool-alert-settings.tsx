import { BellRingIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { SegmentedControl } from "@/components/grouped-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { PoolView } from "@/features/analytics/analytics.types";
import { type PoolAlertOverride, SPIKE_TIMEFRAMES, type SpikeTimeframe } from "@/features/notifications/notifications";
import type { Currency } from "@/features/portfolio/portfolio";
import { usePools } from "@/stores/pools";
import { useSettings } from "@/stores/settings";

export function PoolAlertSettings({ pool }: { pool: PoolView }) {
  const isFavorite = usePools((s) => s.favorites.some((favorite) => favorite.address === pool.address));
  const override = usePools((s) => s.alertOverrides[pool.address]);
  const setAlertOverride = usePools((s) => s.setAlertOverride);
  const { spikeTimeframe, spikeMultiplier, spikeMin, spikeMinCurrency } = useSettings();
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(Boolean(override));
  const [draft, setDraft] = useState<PoolAlertOverride>(() =>
    fromGlobal({ spikeTimeframe, spikeMultiplier, spikeMin, spikeMinCurrency }),
  );

  useEffect(() => {
    if (!open) return;
    setCustomize(Boolean(override));
    setDraft(override ?? fromGlobal({ spikeTimeframe, spikeMultiplier, spikeMin, spikeMinCurrency }));
  }, [open, override, spikeTimeframe, spikeMultiplier, spikeMin, spikeMinCurrency]);

  const save = () => {
    setAlertOverride(pool.address, customize ? draft : null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Configure volume alert for ${pool.name}`}
        aria-pressed={Boolean(override)}
        title={
          isFavorite
            ? override
              ? "Custom volume alert"
              : "Configure volume alert"
            : "Add this pool to favorites to configure alerts"
        }
        disabled={!isFavorite}
        onClick={() => setOpen(true)}
        // Centered with auto margins, not a translate: Button nudges itself with translate-y-px on press, which would replace -translate-y-1/2 and make it jump.
        className={`absolute inset-y-0 right-16 my-auto ${override ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
      >
        <BellRingIcon />
      </Button>
      <DialogContent className="max-w-sm">
        <DialogTitle>Volume alert</DialogTitle>
        <DialogDescription>{pool.name} · Set a pool-specific alert or use global defaults.</DialogDescription>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2.5">
          <span className="text-sm font-medium">Customize this pool</span>
          <Switch checked={customize} onCheckedChange={setCustomize} />
        </div>
        <div className={`mt-3 flex flex-col gap-3 ${customize ? "" : "pointer-events-none opacity-50"}`}>
          <SettingRow label="Timeframe">
            <SegmentedControl
              value={draft.timeframe}
              onChange={(timeframe) => setDraft((current) => ({ ...current, timeframe }))}
              options={SPIKE_TIMEFRAMES.map((timeframe) => ({ value: timeframe, label: timeframe }))}
            />
          </SettingRow>
          <SettingRow label="Spike level">
            <SegmentedControl
              value={draft.multiplier}
              onChange={(multiplier) => setDraft((current) => ({ ...current, multiplier }))}
              options={[
                { value: "off", label: "Off" },
                ...([2, 3, 5, 10] as const).map((value) => ({ value, label: `${value}x` })),
              ]}
            />
          </SettingRow>
          <SettingRow label="Minimum volume">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step="any"
                aria-label="Pool minimum volume"
                value={draft.minVolume}
                onChange={(event) => {
                  const minVolume = Number(event.target.value);
                  if (Number.isFinite(minVolume) && minVolume >= 0) setDraft((current) => ({ ...current, minVolume }));
                }}
                className="h-7 w-20 rounded-md bg-foreground/[0.07] px-2 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
              />
              <SegmentedControl
                value={draft.minCurrency}
                onChange={(minCurrency) => setDraft((current) => ({ ...current, minCurrency }))}
                options={[
                  { value: "usd", label: "USD" },
                  { value: "sol", label: "SOL" },
                ]}
              />
            </div>
          </SettingRow>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {customize
            ? "These settings override the global pool alert defaults."
            : "This pool follows the global alert settings."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save}>
            Save alert
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      <span className="shrink-0 text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

function fromGlobal(settings: {
  spikeTimeframe: SpikeTimeframe;
  spikeMultiplier: PoolAlertOverride["multiplier"];
  spikeMin: number;
  spikeMinCurrency: Currency;
}): PoolAlertOverride {
  return {
    timeframe: settings.spikeTimeframe,
    multiplier: settings.spikeMultiplier,
    minVolume: settings.spikeMin,
    minCurrency: settings.spikeMinCurrency,
  };
}
