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
  FootprintsIcon,
  HashIcon,
  HistoryIcon,
  MonitorIcon,
  MoonIcon,
  MusicIcon,
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
import { PairIcons } from "@/components/pair-icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { WalletAvatar } from "@/features/analytics/components/wallet-avatar";
import {
  clearCustomSound,
  getCustomSound,
  playCustomSound,
  saveCustomSound,
} from "@/features/notifications/custom-sound";
import { BASELINE_BARS, SPIKE_TIMEFRAMES } from "@/features/notifications/notifications";
import { playAlert } from "@/features/notifications/sound";
import { Badge } from "@/features/portfolio/components/pool-identity";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { useTheme } from "@/features/theme/theme";
import { offsetLabel, UTC_OFFSETS } from "@/features/timezone/timezone";
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
          <div className="relative flex h-12 shrink-0 items-center justify-center border-b px-4">
            {current && (
              <button
                type="button"
                onClick={() => onSectionChange(null)}
                className="absolute left-3 flex items-center gap-0.5 text-sm font-medium text-brand"
              >
                <ChevronLeftIcon className="size-4" />
                Settings
              </button>
            )}
            <DrawerTitle className="text-sm font-semibold">{current?.label ?? "Settings"}</DrawerTitle>
            <DrawerDescription className="sr-only">App preferences, notifications and favorites</DrawerDescription>
            <DrawerClose asChild>
              <button type="button" className="absolute right-4 text-sm font-semibold text-brand">
                Done
              </button>
            </DrawerClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-8">
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
      <DialogContent className="flex h-[min(46rem,90dvh)] flex-row gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <nav className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3">
          <DialogTitle className="px-2 pt-1 pb-3 text-sm font-semibold">Settings</DialogTitle>
          <DialogDescription className="sr-only">App preferences, notifications and favorites</DialogDescription>
          {SECTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              aria-current={active === value ? "page" : undefined}
              onClick={() => onSectionChange(value)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                active === value
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center border-b px-5 pr-12">
            <h2 className="text-sm font-semibold">{SECTIONS.find((s) => s.value === active)?.label}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">{page(active)}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function General() {
  const { theme, setTheme } = useTheme();
  const currency = useSettings((s) => s.currency);
  const setCurrency = useSettings((s) => s.setCurrency);
  const numberMotion = useSettings((s) => s.numberMotion);
  const setNumberMotion = useSettings((s) => s.setNumberMotion);
  const timezoneOffset = useSettings((s) => s.timezoneOffset);
  const setTimezoneOffset = useSettings((s) => s.setTimezoneOffset);
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
      <Group title="Time" footer="Sets where days start for ranges, the calendar, charts and every timestamp.">
        <Row
          icon={
            <RowIcon>
              <ClockIcon />
            </RowIcon>
          }
          label="Timezone"
          description="Offset from UTC"
        >
          <select
            value={timezoneOffset}
            onChange={(e) => setTimezoneOffset(e.target.value === "auto" ? "auto" : Number(e.target.value))}
            className="h-8 rounded-md border bg-transparent px-2 text-sm text-foreground outline-none focus:border-brand"
          >
            <option value="auto" className="bg-popover text-popover-foreground">
              Browser timezone
            </option>
            {UTC_OFFSETS.map((o) => (
              <option key={o} value={o} className="bg-popover text-popover-foreground">
                {offsetLabel(o)}
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <Group title="Motion">
        <Row
          icon={
            <RowIcon>
              <HashIcon />
            </RowIcon>
          }
          label="Animate numbers"
          description="When a number changes"
        >
          <SegmentedControl
            value={numberMotion}
            onChange={setNumberMotion}
            options={[
              { value: "tween", label: "Count" },
              { value: "roll", label: "Roll" },
              { value: "flash", label: "Flash" },
              { value: "off", label: "Off" },
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
  const favoritePools = usePools((s) => s.favorites);
  const poolOverrides = usePools((s) => s.alertOverrides);
  const pools = favoritePools.length;
  const [permission, setPermission] = useState<Permission>("default");
  useEffect(() => setPermission(browserPermission()), []);

  const blocked = permission === "denied" || permission === "unsupported";
  const solPrice = useQuery(pricesQuery).data?.sol ?? null;
  const hasSolMinimum =
    spikeMinCurrency === "sol" || favoritePools.some((pool) => poolOverrides[pool.address]?.minCurrency === "sol");
  const spikesPaused = notify.volumeSpike && hasSolMinimum && solPrice === null;

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
              : "Applies to all your starred pools. Change it for one pool with the bell on its card."
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
            options={[
              { value: "off", label: "Off" },
              ...([2, 3, 5, 10] as const).map((m) => ({ value: m, label: `${m}x` })),
            ]}
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
        <CustomSoundRow />
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

function CustomSoundRow() {
  const [sound, setSound] = useState<{ name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read after mount: localStorage does not exist on the server.
  useEffect(() => setSound(getCustomSound()), []);

  const button = "h-7.5 rounded-md bg-foreground/[0.07] px-2.5 text-sm hover:bg-foreground/[0.12]";

  return (
    <Row
      icon={
        <RowIcon>
          <MusicIcon />
        </RowIcon>
      }
      label="Custom sound"
      description={error ?? (sound ? sound.name : "Replace the built-in chimes with your own audio file")}
    >
      <div className="flex shrink-0 items-center gap-1.5">
        {sound && (
          <>
            <button type="button" className={button} onClick={() => playCustomSound()}>
              Test
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                clearCustomSound();
                setSound(null);
                setError(null);
              }}
            >
              Remove
            </button>
          </>
        )}
        {/* relative keeps the visually hidden input inside the label; otherwise focusing it scrolls the dialog. */}
        <label className={`${button} relative inline-flex cursor-pointer items-center`}>
          {sound ? "Change" : "Choose file"}
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const problem = await saveCustomSound(file);
              setError(problem);
              if (!problem) {
                setSound(getCustomSound());
                playCustomSound();
              }
            }}
          />
        </label>
      </div>
    </Row>
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
        className="h-7 w-20 rounded-md bg-foreground/[0.07] px-2 text-right text-sm tabular-nums outline-none [appearance:textfield] focus:ring-1 focus:ring-ring [&::-webkit-inner-spin-button]:appearance-none"
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
      className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-loss/10 hover:text-loss"
    >
      <XIcon className="size-3.5" />
    </button>
  );
  const open = (go: () => void) => () => {
    onNavigate();
    go();
  };
  const openPool = (address: string) => open(() => navigate({ to: "/analytics", search: { pool: address } }));
  const openWallet = (wallet: string) =>
    open(() => navigate({ to: "/portfolio/$wallet", params: { wallet }, search: { currency } }));

  return (
    <div className="flex flex-col gap-5">
      <Group title="Pools">
        {pools.length === 0 ? (
          <Empty Icon={StarIcon} title="No favorite pools" hint="Open a pool on Analytics and press its star." />
        ) : (
          pools.map((pool) => (
            <Row
              key={pool.address}
              icon={
                <PairIcons
                  tokens={[
                    { symbol: pool.tokenXSymbol ?? "?", logo: pool.tokenXIcon },
                    { symbol: pool.tokenYSymbol ?? "?", logo: pool.tokenYIcon },
                  ]}
                />
              }
              label={
                <button
                  type="button"
                  className="flex items-center gap-1.5 hover:text-brand"
                  onClick={openPool(pool.address)}
                >
                  <span className="truncate">{pool.name}</span>
                  <Badge tone="blue" title="Bin step">
                    <FootprintsIcon className="size-3.5" />
                    {pool.binStep}
                  </Badge>
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
          <Empty Icon={WalletIcon} title="No favorite wallets" hint="Star a wallet on Portfolio to keep it here." />
        ) : (
          wallets.map((wallet) => (
            <Row
              key={wallet}
              icon={<WalletAvatar address={wallet} className="size-7" />}
              label={
                <button type="button" className="font-mono hover:text-brand" onClick={openWallet(wallet)}>
                  {shortAddr(wallet)}
                </button>
              }
            >
              {remove(shortAddr(wallet), () => toggleFavorite(wallet))}
            </Row>
          ))
        )}
      </Group>
      <Group
        title="Recent wallets"
        footer={
          recent.length > 0 && (
            <button type="button" onClick={clearRecent} className="font-medium hover:text-foreground">
              Clear recent wallets
            </button>
          )
        }
      >
        {recent.length === 0 ? (
          <Empty Icon={HistoryIcon} title="No recent wallets" hint="Wallets you open show up here." />
        ) : (
          recent.map((wallet) => {
            const favorite = wallets.includes(wallet);
            return (
              <Row
                key={wallet}
                icon={<WalletAvatar address={wallet} className="size-7" />}
                label={
                  <button type="button" className="font-mono hover:text-brand" onClick={openWallet(wallet)}>
                    {shortAddr(wallet)}
                  </button>
                }
              >
                <button
                  type="button"
                  aria-label={favorite ? `Unstar ${shortAddr(wallet)}` : `Star ${shortAddr(wallet)}`}
                  aria-pressed={favorite}
                  onClick={() => toggleFavorite(wallet)}
                  className={`rounded-full p-1.5 transition-colors hover:bg-brand/10 ${
                    favorite ? "text-brand" : "text-muted-foreground hover:text-brand"
                  }`}
                >
                  <StarIcon className="size-3.5" fill={favorite ? "currentColor" : "none"} />
                </button>
              </Row>
            );
          })
        )}
      </Group>
    </div>
  );
}

/** The empty state of a Favorites group: an icon tile, a title and how to fill it. */
function Empty({ Icon, title, hint }: { Icon: typeof StarIcon; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-7 text-center">
      <span className="mb-1.5 flex size-10 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground">
        <Icon className="size-4.5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-64 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}
