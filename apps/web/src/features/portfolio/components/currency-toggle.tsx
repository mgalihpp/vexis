import { useNavigate, useSearch } from "@tanstack/react-router";
import { SolIcon, UsdcIcon } from "@/components/icons";

/** Switches every amount on the portfolio page between USD and SOL via the `currency` search param. */
export function CurrencyToggle() {
  const { currency } = useSearch({ from: "/portfolio/$wallet" });
  // No `from`: navigating from the layout route would land on the Overview tab instead of staying on this one.
  const navigate = useNavigate();
  const sol = currency === "sol";
  return (
    <div className="flex items-center gap-0.75">
      <UsdcIcon className={`size-4 ${sol ? "opacity-50" : ""}`} />
      <button
        type="button"
        role="switch"
        aria-checked={sol}
        aria-label="Show amounts in SOL"
        onClick={() =>
          navigate({
            to: ".",
            search: (prev) => ({ ...prev, currency: sol ? "usd" : "sol" }),
            replace: true,
            resetScroll: false,
          })
        }
        className="relative h-4 w-7.25 rounded-full bg-[#9b5cff] transition-colors"
      >
        <span
          className={`absolute top-0.5 size-3.25 rounded-full bg-white shadow transition-[left] ${sol ? "left-[0.9rem]" : "left-0.5"}`}
        />
      </button>
      <SolIcon className={`size-4 ${sol ? "" : "opacity-50"}`} />
    </div>
  );
}
