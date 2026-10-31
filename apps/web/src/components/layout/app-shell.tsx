import { Link, useNavigate } from "@tanstack/react-router";
import { MonitorIcon, MoonIcon, StarIcon, SunIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { BtcIcon, Logo, SolIcon } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Theme, useTheme } from "@/features/theme/theme";
import { shortAddr } from "@/lib/format";
import { useWallets } from "@/stores/wallets";

// Official icons as listed in Jupiter's token registry (MET and JUP).
const DATA_SOURCES = [
  { name: "Meteora", href: "https://www.meteora.ag", icon: "https://assets.meteora.ag/met-token.svg" },
  { name: "Jupiter", href: "https://jup.ag", icon: "https://static.jup.ag/jup/icon.png" },
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
  }, []);

  return (
    <div className="flex min-h-dvh flex-col pb-8">
      <AppHeader />
      <FavoritesBar />
      <main className="flex-1">{children}</main>
      <AppFooter prices={prices} />
    </div>
  );
}

function NavItem({ to, children, badge }: { to: "/portfolio" | "/analytics"; children: ReactNode; badge?: string }) {
  return (
    <Link
      to={to}
      className="relative text-[1.0625rem] font-semibold text-foreground transition-colors hover:text-brand data-[status=active]:text-brand"
    >
      {children}
      {badge && (
        <span className="absolute -top-2 -right-1 translate-x-full rounded-[0.25rem] border border-brand/60 px-1 text-[0.5625rem] leading-[0.8125rem] font-bold tracking-wider text-brand">
          {badge}
        </span>
      )}
    </Link>
  );
}

function AppHeader() {
  return (
    <header className="border-b">
      <div className="flex h-[3.75rem] items-center gap-10 px-2.5">
        <Link to="/portfolio" className="flex items-center gap-2 text-[1.625rem] font-bold tracking-tight">
          <Logo height={22} />
          Vexis
        </Link>
        <nav className="flex items-center gap-12">
          <NavItem to="/portfolio" badge="BETA">
            Portfolio
          </NavItem>
          <NavItem to="/analytics">Analytics</NavItem>
        </nav>
      </div>
    </header>
  );
}

function FavoritesBar() {
  const favorites = useWallets((s) => s.favorites);
  const toggleFavorite = useWallets((s) => s.toggleFavorite);
  const navigate = useNavigate();

  return (
    <div className="flex h-10 items-center gap-3 overflow-x-auto border-b px-2.5 text-[0.9375rem]">
      <StarIcon className="size-4 shrink-0 fill-foreground text-foreground" />
      {favorites.length === 0 ? (
        <span className="text-muted-foreground">Add wallets to your favorites</span>
      ) : (
        favorites.map((wallet) => (
          <span key={wallet} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-card px-2 py-0.5 text-sm">
            <button
              type="button"
              className="hover:text-brand"
              onClick={() => navigate({ to: "/portfolio/$wallet", params: { wallet } })}
            >
              {shortAddr(wallet)}
            </button>
            <button
              type="button"
              aria-label="Remove from favorites"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => toggleFavorite(wallet)}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))
      )}
    </div>
  );
}

function AppFooter({ prices }: { prices: Prices }) {
  const { theme, setTheme } = useTheme();
  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 flex h-8 items-center gap-4 border-t bg-background px-2.5 text-[0.9375rem] font-medium tabular-nums">
      <span className="inline-flex items-center gap-1.5 text-sky-700 dark:text-[#5ec8f0]">
        <SolIcon className="size-4" />
        {prices.sol === null ? "—" : usd.format(prices.sol)}
      </span>
      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-[#f7931a]">
        <BtcIcon className="size-4" />
        {prices.btc === null ? "—" : usdWhole.format(prices.btc)}
      </span>
      <div className="ml-auto flex items-center gap-3">
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
                <img src={s.icon} alt="" className="size-[1.125rem] rounded-full" />
              </a>
            </TooltipTrigger>
            <TooltipContent>{s.name}</TooltipContent>
          </Tooltip>
        ))}
        <span className="h-4 border-l" />
        <div className="flex items-center rounded-md border p-0.5">
          {THEMES.map(({ value, label, Icon }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={theme === value}
                  aria-label={label}
                  onClick={() => setTheme(value)}
                  className={`rounded-[0.25rem] p-1 transition-colors ${
                    theme === value ? "bg-muted text-foreground" : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
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
