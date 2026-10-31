import { useNavigate } from "@tanstack/react-router";
import { BookmarkIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon, SearchIcon, StarIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shortAddr } from "@/lib/format";
import { useWallets } from "@/stores/wallets";
import { WalletAddress } from "../portfolio.functions";

export function WalletSearch({ autoFocus = false, className = "" }: { autoFocus?: boolean; className?: string }) {
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
    <form onSubmit={submit} className={`relative ${className}`}>
      <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/70" />
      <input
        // biome-ignore lint/a11y/noAutofocus: the wallet landing page has nothing else to do
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search for other wallets"
        aria-invalid={error !== null}
        className="h-9 w-full rounded-md border bg-transparent pr-3 pl-9 text-[0.9375rem] outline-none placeholder:text-foreground/60 focus:border-foreground/30 aria-invalid:border-loss"
      />
      {error && <p className="absolute top-full mt-1 text-xs text-loss">{error}</p>}
    </form>
  );
}

export function WalletBar({ wallet }: { wallet: string }) {
  const navigate = useNavigate();
  const { favorites, recent, toggleFavorite } = useWallets();
  const isFavorite = favorites.includes(wallet);
  const others = [...new Set([...favorites, ...recent])].filter((w) => w !== wallet);

  return (
    <div className="flex items-center justify-between gap-3 border-b px-2.5 py-2">
      <Popover>
        <PopoverTrigger className="inline-flex h-9 items-center gap-2 rounded-md bg-card px-3 text-[0.9375rem] font-semibold">
          <SearchIcon className="size-[1.125rem] text-brand" />
          {shortAddr(wallet).replace("…", "...")}
          <ChevronDownIcon className="size-4 text-foreground/70" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          <div className="flex items-center gap-1 border-b px-1 pb-2">
            <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{wallet}</span>
            <button
              type="button"
              aria-label="Copy address"
              className="rounded p-1 hover:bg-muted"
              onClick={() => navigator.clipboard.writeText(wallet)}
            >
              <CopyIcon className="size-3.5" />
            </button>
            <a
              aria-label="Open in Solscan"
              href={`https://solscan.io/account/${wallet}`}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 hover:bg-muted"
            >
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </div>
          <p className="px-1 pt-2 pb-1 text-xs text-muted-foreground">Favorites and recent</p>
          {others.length === 0 && <p className="px-1 py-2 text-sm text-muted-foreground">No other wallets yet.</p>}
          {others.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => navigate({ to: "/portfolio/$wallet", params: { wallet: w } })}
              className="flex w-full items-center justify-between rounded px-1 py-1.5 text-sm hover:bg-muted"
            >
              {shortAddr(w)}
              {favorites.includes(w) && <StarIcon className="size-3.5 fill-brand text-brand" />}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <div className="flex w-full max-w-[20rem] items-center gap-1">
        <WalletSearch className="flex-1" />
        <button
          type="button"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
          onClick={() => toggleFavorite(wallet)}
          className="rounded-md p-2 text-foreground/70 hover:text-foreground"
        >
          <BookmarkIcon className={`size-4 ${isFavorite ? "fill-brand text-brand" : ""}`} />
        </button>
      </div>
    </div>
  );
}
