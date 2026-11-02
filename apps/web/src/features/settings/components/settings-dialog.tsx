import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ActivityIcon,
  BellIcon,
  ChartCandlestickIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  ClockIcon,
  CoinsIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SettingsIcon,
  StarIcon,
  SunIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  Volume2Icon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Group, Row, RowIcon, SegmentedControl } from "@/components/grouped-list";
import { SolIcon, UsdcIcon } from "@/components/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { BASELINE_BARS, SPIKE_TIMEFRAMES } from "@/features/notifications/notifications";
import { playAlert } from "@/features/notifications/sound";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { useTheme } from "@/features/theme/theme";
import { useIsMobile } from "@/hooks/use-mobile";
import { shortAddr } from "@/lib/format";
import { usePools } from "@/stores/pools";
import { useSettings } from "@/stores/settings";
import { useWallets } from "@/stores/wallets";

export type SettingsSection = "general" | "notifications" | "favorites";

const SECTIONS: { value: SettingsSection; label: string; Icon: typeof SettingsIcon }[] = [
  { value: "general", label: "General", Icon: SettingsIcon },
  { value: "notifications", label: "Notifications", Icon: BellIcon },
  { value: "favorites", label: "Favorites", Icon: StarIcon },
];

export function SettingsDialog({
  open,
  onOpenChange,
  section,
  onSectionChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The open section; null is the section list, which only phones show. */
  section: SettingsSection | null;
  onSectionChange: (section: SettingsSection | null) => void;
}) {
  const isMobile = useIsMobile();
  const page = (value: SettingsSection) => (
    <>
      {value === "general" && <General />}
      {value === "notifications" && <Notifications />}
      {value === "favorites" && <Favorites onNavigate={() => onOpenChange(false)} />}
    </>
  );

  // On phones it is a bottom sheet laid out like iOS Settings: a list of sections, each opening its own page.
  if (isMobile) {
    const current = SECTIONS.find((s) => s.value === section);
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[90dvh] data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
          <div className="relative flex h-11 shrink-0 items-center justify-center px-4">
            {current && (
              <button
                type="button"
                onClick={() => onSectionChange(null)}
                className="absolute left-2 flex items-center text-xs font-medium text-brand"
              >
                <ChevronLeftIcon className="size-4" />
                Settings
              </button>
            )}
            <DrawerTitle className="text-sm font-semibold">{current?.label ?? "Settings"}</DrawerTitle>
            <DrawerDescription className="sr-only">App preferences, notifications and favorites</DrawerDescription>
            <DrawerClose asChild>
              <button type="button" className="absolute right-4 text-xs font-semibold text-brand">
                Done
              </button>
            </DrawerClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-8">
            {current ? (
              page(current.value)
            ) : (
              <Group>
                {SECTIONS.map(({ value, label, Icon }) => (
                  <Row
                    key={value}
                    onClick={() => onSectionChange(value)}
                    icon={
                      <RowIcon>
                        <Icon />
                      </RowIcon>
                    }
                    label={label}
                  >
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                  </Row>
                ))}
              </Group>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const active = section ?? "general";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(34rem,85dvh)] flex-row gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <nav className="flex w-44 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3">
          <DialogTitle className="px-2 pt-1 pb-3 text-sm font-semibold">Settings</DialogTitle>
          <DialogDescription className="sr-only">App preferences, notifications and favorites</DialogDescription>
          {SECTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              aria-current={active === value ? "page" : undefined}
              onClick={() => onSectionChange(value)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active === value
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">
          <h2 className="mb-4 text-base font-semibold">{SECTIONS.find((s) => s.value === active)?.label}</h2>
          {page(active)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function General() {
  const { theme, setTheme } = useTheme();
  const currency = useSettings((s) => s.currency);
  const setCurrency = useSettings((s) => s.setCurrency);
  return (
    <div className="flex flex-col gap-5">
      <Group title="Appearance">
        <Row
          icon={
            <RowIcon>
              <PaletteIcon />
            </RowIcon>
          }
          label="Theme"
        >
          <SegmentedControl
            value={theme}
            onChange={setTheme}
            options={[
              {
                value: "light",
                label: (
                  <>
                    <SunIcon />
                    Light
                  </>
                ),
              },
              {
                value: "dark",
                label: (
                  <>
                    <MoonIcon />
                    Dark
                  </>
                ),
              },
              {
                value: "system",
                label: (
                  <>
                    <MonitorIcon />
                    System
                  </>
                ),
              },
            ]}
          />
        </Row>
      </Group>
      <Group title="Portfolio">
        <Row
          icon={
            <RowIcon>
              <CircleDollarSignIcon />
            </RowIcon>
          }
          label="Default currency"
          description="Used when you open a wallet"
        >
          <SegmentedControl
            value={currency}
            onChange={setCurrency}
            options={[
              {
                value: "sol",
                label: (
                  <>
                    <SolIcon className="size-3" />
                    SOL
                  </>
                ),
              },
              {
                value: "usd",
                label: (
                  <>
                    <UsdcIcon className="size-3" />
                    USD
                  </>
                ),
              },
            ]}
          />
        </Row>
      </Group>
    </div>
  );
}

type Permission = NotificationPermission | "unsupported";

const browserPermission = (): Permission =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

function Notifications() {
  const {
    notify,
    setNotify,
    spikeMultiplier,
    setSpikeMultiplier,
    spikeTimeframe,
    setSpikeTimeframe,
    spikeMinCurrency,
    intervalSec,
    setIntervalSec,
  } = useSettings();
  const wallets = useWallets((s) => s.favorites.length);
  const pools = usePools((s) => s.favorites.length);
  const [permission, setPermission] = useState<Permission>("default");
  useEffect(() => setPermission(browserPermission()), []);

  const blocked = permission === "denied" || permission === "unsupported";
  const solPrice = useQuery(pricesQuery).data?.sol ?? null;
  const spikesPaused = notify.volumeSpike && spikeMinCurrency === "sol" && solPrice === null;

  const toggleBrowser = async (on: boolean) => {
    if (!on || permission === "granted") return setNotify("browser", on);
    if (permission !== "default") return;
    const next = await Notification.requestPermission();
    setPermission(next);
    setNotify("browser", next === "granted");
  };

  return (
    <div className="flex flex-col gap-5">
      <Group
        title="Wallets"
        footer={
          wallets === 0
            ? "Star a wallet to get these alerts."
            : `For your ${wallets} favorite wallet${wallets === 1 ? "" : "s"}.`
        }
      >
        <Row
          icon={
            <RowIcon>
              <TriangleAlertIcon />
            </RowIcon>
          }
          label="Out of range"
          description="A position moves out of its price range"
        >
          <Switch checked={notify.outOfRange} onCheckedChange={(v) => setNotify("outOfRange", v)} />
        </Row>
        <Row
          icon={
            <RowIcon>
              <WalletIcon />
            </RowIcon>
          }
          label="Opened and closed"
          description="A position is opened or closed"
        >
          <Switch checked={notify.positions} onCheckedChange={(v) => setNotify("positions", v)} />
        </Row>
      </Group>

      <Group
        title="Pools"
        error={spikesPaused}
        footer={
          spikesPaused
            ? "The SOL price is unavailable, so a SOL minimum cannot be checked. Volume spikes are paused."
            : pools === 0
              ? "Star a pool on Analytics to get these alerts."
              : `For your ${pools} favorite pool${pools === 1 ? "" : "s"}.`
        }
      >
        <Row
          icon={
            <RowIcon>
              <TrendingUpIcon />
            </RowIcon>
          }
          label="Volume spike"
          description="A candle's volume jumps well above average"
        >
          <Switch checked={notify.volumeSpike} onCheckedChange={(v) => setNotify("volumeSpike", v)} />
        </Row>
        <Row
          icon={
            <RowIcon>
              <ChartCandlestickIcon />
            </RowIcon>
          }
          label="Timeframe"
          description="Candle size to watch"
        >
          <SegmentedControl
            value={spikeTimeframe}
            onChange={setSpikeTimeframe}
            options={SPIKE_TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
          />
        </Row>
        <Row
          icon={
            <RowIcon>
              <ActivityIcon />
            </RowIcon>
          }
          label="Spike level"
          description={`Compared with the last ${BASELINE_BARS} candles`}
        >
          <SegmentedControl
            value={spikeMultiplier}
            onChange={setSpikeMultiplier}
            options={[2, 3, 5, 10].map((m) => ({ value: m, label: `${m}x` }))}
          />
        </Row>
        <Row
          icon={
            <RowIcon>
              <CoinsIcon />
            </RowIcon>
          }
          label="Minimum volume"
          description="Smaller candles are ignored"
        >
          <MinimumVolume />
        </Row>
      </Group>

      <Group title="Delivery">
        <Row
          icon={
            <RowIcon>
              <ClockIcon />
            </RowIcon>
          }
          label="Check every"
          description="15s is the closest to real time"
        >
          <SegmentedControl
            value={intervalSec}
            onChange={setIntervalSec}
            options={[
              { value: 15, label: "15s" },
              { value: 60, label: "1m" },
              { value: 300, label: "5m" },
            ]}
          />
        </Row>
        <Row
          icon={
            <RowIcon>
              <Volume2Icon />
            </RowIcon>
          }
          label="Sound"
          description="Chime for new alerts, a sharper tone for out of range"
        >
          <Switch
            checked={notify.sound}
            onCheckedChange={(on) => {
              setNotify("sound", on);
              if (on) playAlert(["opened"]);
            }}
          />
        </Row>
      </Group>

      <Group
        error={blocked}
        footer={
          permission === "denied"
            ? "Notifications are blocked by your browser. Allow them in the site settings, then reload."
            : permission === "unsupported"
              ? "This browser does not support desktop notifications."
              : "Keep Vexis open in a tab to receive alerts."
        }
      >
        <Row
          icon={
            <RowIcon>
              <BellIcon />
            </RowIcon>
          }
          label="Desktop notifications"
          description="Show alerts while Vexis is in the background"
        >
          <Switch
            checked={notify.browser && permission === "granted"}
            disabled={blocked}
            onCheckedChange={toggleBrowser}
          />
        </Row>
      </Group>
    </div>
  );
}

function MinimumVolume() {
  const { spikeMin, setSpikeMin, spikeMinCurrency, setSpikeMinCurrency } = useSettings();
  // A draft keeps the field editable while it is empty or mid-number.
  const [draft, setDraft] = useState(String(spikeMin));
  useEffect(() => setDraft(String(spikeMin)), [spikeMin]);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        aria-label="Minimum volume"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const value = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(value) && value >= 0) setSpikeMin(value);
        }}
        onBlur={() => setDraft(String(spikeMin))}
        className="h-6.5 w-16 rounded-md bg-foreground/[0.07] px-2 text-right text-xs tabular-nums outline-none [appearance:textfield] focus:ring-1 focus:ring-ring [&::-webkit-inner-spin-button]:appearance-none"
      />
      <SegmentedControl
        value={spikeMinCurrency}
        onChange={setSpikeMinCurrency}
        options={[
          { value: "usd", label: "USD" },
          { value: "sol", label: "SOL" },
        ]}
      />
    </div>
  );
}

function Favorites({ onNavigate }: { onNavigate: () => void }) {
  const { favorites: wallets, recent, toggleFavorite, clearRecent } = useWallets();
  const { favorites: pools, toggleFavorite: togglePool } = usePools();
  const currency = useSettings((s) => s.currency);
  const navigate = useNavigate();

  const remove = (label: string, onClick: () => void) => (
    <button
      type="button"
      aria-label={`Remove ${label}`}
      onClick={onClick}
      className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
    >
      <XIcon className="size-3" />
    </button>
  );
  const open = (go: () => void) => () => {
    onNavigate();
    go();
  };

  return (
    <div className="flex flex-col gap-5">
      <Group title="Pools">
        {pools.length === 0 ? (
          <Row label={<span className="text-muted-foreground">No favorite pools</span>} />
        ) : (
          pools.map((pool) => (
            <Row
              key={pool.address}
              label={
                <button
                  type="button"
                  className="hover:text-brand"
                  onClick={open(() => navigate({ to: "/analytics", search: { pool: pool.address } }))}
                >
                  {pool.name} <span className="text-muted-foreground">{pool.binStep}</span>
                </button>
              }
              description={shortAddr(pool.address)}
            >
              {remove(pool.name, () => togglePool(pool))}
            </Row>
          ))
        )}
      </Group>
      <Group title="Wallets">
        {wallets.length === 0 ? (
          <Row label={<span className="text-muted-foreground">No favorite wallets</span>} />
        ) : (
          wallets.map((wallet) => (
            <Row
              key={wallet}
              label={
                <button
                  type="button"
                  className="font-mono hover:text-brand"
                  onClick={open(() => navigate({ to: "/portfolio/$wallet", params: { wallet }, search: { currency } }))}
                >
                  {shortAddr(wallet)}
                </button>
              }
            >
              {remove(shortAddr(wallet), () => toggleFavorite(wallet))}
            </Row>
          ))
        )}
      </Group>
      <Group title="Recent wallets">
        {recent.length === 0 ? (
          <Row label={<span className="text-muted-foreground">No recent wallets</span>} />
        ) : (
          <Row label={`${recent.length} recent wallet${recent.length === 1 ? "" : "s"}`}>
            <button
              type="button"
              onClick={clearRecent}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </Row>
        )}
      </Group>
    </div>
  );
}
