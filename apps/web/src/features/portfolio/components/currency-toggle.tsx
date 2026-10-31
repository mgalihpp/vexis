import { useNavigate, useSearch } from "@tanstack/react-router";
import { SolIcon, UsdcIcon } from "@/components/icons";

/** Switches every amount on the portfolio page between USD and SOL via the `currency` search param. */
export function CurrencyToggle() {
  const { currency } = useSearch({ from: "/portfolio/$wallet" });
  const navigate = useNavigate({ from: "/portfolio/$wallet" });
  const sol = currency === "sol";
  return (
    <div className="flex items-center gap-1">
      <UsdcIcon className={`size-5 ${sol ? "opacity-50" : ""}`} />
      <button
        type="button"
        role="switch"
        aria-checked={sol}
        aria-label="Show amounts in SOL"
        onClick={() =>
          navigate({
            search: (prev) => ({ ...prev, currency: sol ? "usd" : "sol" }),
            replace: true,
            resetScroll: false,
          })
        }
        className="relative h-5 w-9 rounded-full bg-[#9b5cff] transition-colors"
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${sol ? "left-[1.125rem]" : "left-0.5"}`}
        />
      </button>
      <SolIcon className={`size-5 ${sol ? "" : "opacity-50"}`} />
    </div>
  );
}
