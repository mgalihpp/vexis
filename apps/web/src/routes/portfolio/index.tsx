import { createFileRoute, Link } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
import { Logo } from "@/components/icons";
import { WalletSearch } from "@/features/portfolio/components/wallet-bar";
import { shortAddr } from "@/lib/format";
import { useWallets } from "@/stores/wallets";

export const Route = createFileRoute("/portfolio/")({
  head: () => ({ meta: [{ title: "Portfolio · Vexis" }] }),
  component: PortfolioHome,
});

function PortfolioHome() {
  const { favorites, recent } = useWallets();
  const wallets = [...new Set([...favorites, ...recent])];
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-3.25 pt-19.25 text-center">
      <Logo height={45} />
      <h1 className="mt-4 text-xl font-semibold">DLMM portfolio</h1>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Paste a Solana wallet to see its Meteora DLMM positions, realized P&L, and daily performance.
      </p>
      <WalletSearch autoFocus className="mt-6.5 w-full" />
      {wallets.length > 0 && (
        <div className="mt-8 w-full text-left">
          <p className="mb-1.5 text-[0.625rem] text-muted-foreground">Favorites and recent</p>
          <div className="flex flex-wrap gap-1.5">
            {wallets.map((w) => (
              <Link
                key={w}
                to="/portfolio/$wallet"
                params={{ wallet: w }}
                className="inline-flex items-center gap-1.25 rounded-md bg-card px-2 py-0.75 text-xs hover:text-brand"
              >
                {favorites.includes(w) && <StarIcon className="size-2.75 fill-brand text-brand" />}
                {shortAddr(w)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
