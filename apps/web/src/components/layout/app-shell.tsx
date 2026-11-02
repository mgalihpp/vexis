import { Link, useNavigate } from "@tanstack/react-router";
import { MenuIcon, MonitorIcon, MoonIcon, StarIcon, SunIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { BtcIcon, Logo, SolIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationWatcher } from "@/features/notifications/components/notification-watcher";
import { type Theme, useTheme } from "@/features/theme/theme";
import { shortAddr } from "@/lib/format";
import { useNotifications } from "@/stores/notifications";
import { usePools } from "@/stores/pools";
import { useSettings } from "@/stores/settings";
import { useWallets } from "@/stores/wallets";
import { HeaderActions } from "./header-actions";

// Official icons as listed in Jupiter's token registry (MET and JUP).
const DATA_SOURCES = [
  { name: "Meteora", href: "https://www.meteora.ag", icon: "https://assets.meteora.ag/met-token.svg" },
  { name: "Jupiter", href: "https://jup.ag", icon: "https://static.jup.ag/jup/icon.png" },
];

const MOBILE_LINKS: { to: "/portfolio" | "/analytics"; label: string; badge?: string }[] = [
  { to: "/portfolio", label: "Portfolio" },
  { to: "/analytics", label: "Analytics" },
];

const THEMES: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

interface Prices {
  sol: number | null;
  btc: number | null;
}

export function AppShell({ prices, children }: { prices: Prices; children: ReactNode }) {
  useEffect(() => {
    useWallets.persist.rehydrate();
    usePools.persist.rehydrate();
    useSettings.persist.rehydrate();
    useNotifications.persist.rehydrate();
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <NotificationWatcher />
      <FavoritesBar />
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      <AppFooter prices={prices} />
    </div>
  );
}

function NavItem({ to, children, badge }: { to: "/portfolio" | "/analytics"; children: ReactNode; badge?: string }) {
  return (
    <Link
      to={to}
      className="relative text-sm font-medium text-foreground transition-colors hover:text-brand data-[status=active]:text-brand"
    >
      {children}
      {badge && (
        <span className="absolute -top-1.5 -right-0.75 translate-x-full rounded-[0.2rem] border border-brand/60 px-0.75 text-[0.45rem] leading-[0.65rem] font-bold tracking-wider text-brand">
          {badge}
        </span>
      )}
    </Link>
  );
}

function AppHeader() {
  return (
    <header className="shrink-0 border-b">
      <div className="flex h-[3rem] items-center gap-2 px-2 md:gap-8">
        <MobileMenu />
        <Link
          to="/portfolio"
          aria-label="Vexis"
          className="flex items-center gap-1.5 font-brand text-[1.3rem] font-bold"
        >
          <Logo height={22} />
          <span className="hidden md:inline">Vexis</span>
        </Link>
        <nav className="hidden items-center gap-9.5 md:flex">
          <NavItem to="/portfolio">
            Portfolio
          </NavItem>
          <NavItem to="/analytics">Analytics</NavItem>
          <span className="relative text-sm font-medium text-muted-foreground">
            Agents
            <span className="absolute -top-1.5 -right-0.75 translate-x-full rounded-[0.2rem] border border-brand/60 px-0.75 text-[0.45rem] leading-[0.65rem] font-bold tracking-wider text-brand">
              SOON
            </span>
          </span>
        </nav>
        <HeaderActions />
      </div>
    </header>
  );
}

function MobileMenu() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="w-64 max-w-[80vw]">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-1.5 font-brand text-base font-bold">
            <Logo height={18} />
            Vexis
          </SheetTitle>
          <SheetDescription className="sr-only">Navigation</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col px-2">
          {MOBILE_LINKS.map(({ to, label, badge }) => (
            <SheetClose key={to} asChild>
              <Link
                to={to}
                className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium transition-colors hover:bg-muted data-[status=active]:text-brand"
              >
                {label}
                {badge && (
                  <span className="rounded-[0.2rem] border border-brand/60 px-0.75 text-[0.45rem] leading-[0.65rem] font-bold tracking-wider text-brand">
                    {badge}
                  </span>
                )}
              </Link>
            </SheetClose>
          ))}
          <span className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-muted-foreground">
            Agents
            <span className="rounded-[0.2rem] border border-brand/60 px-0.75 text-[0.45rem] leading-[0.65rem] font-bold tracking-wider text-brand">
              SOON
            </span>
          </span>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function FavoritesBar() {
  const favorites = useWallets((s) => s.favorites);
  const toggleFavorite = useWallets((s) => s.toggleFavorite);
  const pools = usePools((s) => s.favorites);
  const togglePool = usePools((s) => s.toggleFavorite);
  const currency = useSettings((s) => s.currency);
  const navigate = useNavigate();

  return (
    <div className="flex h-8 shrink-0 items-center gap-2.5 overflow-x-auto border-b px-2 text-xs">
      <StarIcon className="size-3.25 shrink-0 fill-foreground text-foreground" />
      {favorites.length === 0 && pools.length === 0 ? (
        <span className="text-muted-foreground">Add wallets or pools to your favorites</span>
      ) : (
        <>
          {pools.map((pool) => (
            <span
              key={pool.address}
              className="inline-flex shrink-0 items-center gap-0.75 rounded-md bg-card px-1.5 py-0.5 text-xs"
            >
              <button
                type="button"
                className="hover:text-brand"
                onClick={() => navigate({ to: "/analytics", search: { pool: pool.address } })}
              >
                {pool.name} {pool.binStep}
              </button>
              <button
                type="button"
                aria-label="Remove pool from favorites"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => togglePool(pool)}
              >
                <XIcon className="size-2.5" />
              </button>
            </span>
          ))}
          {favorites.map((wallet) => (
            <span
              key={wallet}
              className="inline-flex shrink-0 items-center gap-0.75 rounded-md bg-card px-1.5 py-0.5 text-xs"
            >
              <button
                type="button"
                className="hover:text-brand"
                onClick={() => navigate({ to: "/portfolio/$wallet", params: { wallet }, search: { currency } })}
              >
                {shortAddr(wallet)}
              </button>
              <button
                type="button"
                aria-label="Remove from favorites"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => toggleFavorite(wallet)}
              >
                <XIcon className="size-2.5" />
              </button>
            </span>
          ))}
        </>
      )}
    </div>
  );
}

function AppFooter({ prices }: { prices: Prices }) {
  const { theme, setTheme } = useTheme();
  return (
    <footer className="flex h-6.5 shrink-0 items-center gap-3.25 border-t bg-background px-2 text-xs font-medium tabular-nums">
      <span className="inline-flex items-center gap-1.25 text-sky-700 dark:text-[#5ec8f0]">
        <SolIcon className="size-3.25" />
        {prices.sol === null ? "—" : usd.format(prices.sol)}
      </span>
      <span className="inline-flex items-center gap-1.25 text-amber-700 dark:text-[#f7931a]">
        <BtcIcon className="size-3.25" />
        {prices.btc === null ? "—" : usdWhole.format(prices.btc)}
      </span>
      <div className="ml-auto flex items-center gap-2.5">
        {DATA_SOURCES.map((s) => (
          <Tooltip key={s.name}>
            <TooltipTrigger asChild>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.name}
                className="opacity-80 transition-opacity hover:opacity-100"
              >
                <img src={s.icon} alt="" className="size-[0.9rem] rounded-full" />
              </a>
            </TooltipTrigger>
            <TooltipContent>{s.name}</TooltipContent>
          </Tooltip>
        ))}
        <span className="h-3.25 border-l" />
        <div className="flex items-center rounded-md border p-0.5">
          {THEMES.map(({ value, label, Icon }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={theme === value}
                  aria-label={label}
                  onClick={() => setTheme(value)}
                  className={`rounded-[0.2rem] p-0.75 transition-colors ${
                    theme === value ? "bg-muted text-foreground" : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-2.75" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </footer>
  );
}
