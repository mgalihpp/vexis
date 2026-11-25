import { type ComponentProps, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { TRACKED_NOTE, TrackedBody } from "./tracked-wallets";
import { TRADERS_NOTE, TradersBody } from "./traders";
import { CollapseToggle, Panel, tabClass, usePanelOpen } from "./ui";

const TABS = [
  { id: "tracked", label: "Tracked wallets", note: TRACKED_NOTE },
  { id: "traders", label: "Traders", note: TRADERS_NOTE },
] as const;

/** Tracked wallets and traders share one panel; only the open tab renders, so the other's queries do not run. */
export function PoolActivity({ pool, base, quote }: ComponentProps<typeof TrackedBody>) {
  const [open, toggle] = usePanelOpen("vexis-pool-activity-open");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("tracked");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <Panel className="@container">
      <div className={`-mx-3 -mt-3 flex items-center justify-between gap-2 pr-3 pl-1 ${open ? "border-b" : "-mb-3"}`}>
        <div role="tablist" aria-label="Pool activity" className="flex items-center">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => setTab(t.id)}
              className={tabClass}
            >
              <InfoTip asChild content={t.note} contentClassName="max-w-56">
                <span>{t.label}</span>
              </InfoTip>
            </button>
          ))}
        </div>
        <CollapseToggle open={open} onToggle={toggle} name={active.label.toLowerCase()} />
      </div>
      {open &&
        (tab === "tracked" ? (
          <TrackedBody pool={pool} base={base} quote={quote} />
        ) : (
          <TradersBody key={pool} pool={pool} />
        ))}
    </Panel>
  );
}
