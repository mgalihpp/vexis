import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, CopyIcon, ExternalLinkIcon, SaveIcon, SearchIcon, StarIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shortAddr } from "@/lib/format";
import { useWallets } from "@/stores/wallets";
import { WalletAddress } from "../portfolio.functions";

export function WalletSearch({
  autoFocus = false,
  className = "",
  action,
}: {
  autoFocus?: boolean;
  className?: string;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = WalletAddress.safeParse(value.trim());
    if (!parsed.success) {
      setError("Enter a Solana wallet address");
      return;
    }
    setError(null);
    setValue("");
    navigate({ to: "/portfolio/$wallet", params: { wallet: parsed.data } });
  };
  return (
    <form
      onSubmit={submit}
      className={`relative flex h-7 items-center rounded-md border border-foreground/5 bg-foreground/5 transition-colors focus-within:border-foreground/20 has-aria-invalid:border-loss ${className}`}
    >
      <SearchIcon className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
      <input
        // biome-ignore lint/a11y/noAutofocus: the wallet landing page has nothing else to do
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search for other wallets"
        aria-invalid={error !== null}
        className="h-full w-full min-w-0 bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground/70"
      />
      {action}
      {error && <p className="absolute top-full mt-0.75 text-[0.625rem] text-loss">{error}</p>}
    </form>
  );
}

export function WalletBar({ wallet }: { wallet: string }) {
  const navigate = useNavigate();
  const { favorites, recent, toggleFavorite } = useWallets();
  const isFavorite = favorites.includes(wallet);
  const others = [...new Set([...favorites, ...recent])].filter((w) => w !== wallet);

  return (
    <div className="flex items-center justify-between gap-2.5 border-b px-2 py-1.5">
      <Popover>
        <PopoverTrigger className="inline-flex h-7 items-center gap-2 rounded-md bg-card px-2 text-xs font-medium">
          <SearchIcon className="size-[0.9rem] text-brand" />
          {shortAddr(wallet).replace("…", "...")}
          <ChevronDownIcon className="size-3.25 text-foreground/70" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1.5">
          <div className="flex items-center gap-0.75 border-b px-0.75 pb-1.5">
            <span className="flex-1 truncate font-mono text-[0.625rem] text-muted-foreground">{wallet}</span>
            <button
              type="button"
              aria-label="Copy address"
              className="rounded p-0.75 hover:bg-muted"
              onClick={() => navigator.clipboard.writeText(wallet)}
            >
              <CopyIcon className="size-2.75" />
            </button>
            <a
              aria-label="Open in Solscan"
              href={`https://solscan.io/account/${wallet}`}
              target="_blank"
              rel="noreferrer"
              className="rounded p-0.75 hover:bg-muted"
            >
              <ExternalLinkIcon className="size-2.75" />
            </a>
          </div>
          <p className="px-0.75 pt-1.5 pb-0.75 text-[0.625rem] text-muted-foreground">Favorites and recent</p>
          {others.length === 0 && <p className="px-0.75 py-1.5 text-xs text-muted-foreground">No other wallets yet.</p>}
          {others.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => navigate({ to: "/portfolio/$wallet", params: { wallet: w } })}
              className="flex w-full items-center justify-between rounded px-0.75 py-1.25 text-xs hover:bg-muted"
            >
              {shortAddr(w)}
              {favorites.includes(w) && <StarIcon className="size-2.75 fill-brand text-brand" />}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <WalletSearch
        className="w-64"
        action={
          <button
            type="button"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={isFavorite}
            onClick={() => toggleFavorite(wallet)}
            className={`mr-2 shrink-0 hover:text-foreground ${isFavorite ? "text-brand" : "text-muted-foreground"}`}
          >
            <SaveIcon className="size-2.75" />
          </button>
        }
      />
    </div>
  );
}
