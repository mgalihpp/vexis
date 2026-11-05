import { Link } from "@tanstack/react-router";
import { BellRingIcon, GaugeIcon, PlusIcon, SendIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const HOW = [
  { icon: GaugeIcon, title: "Checks each pool every minute" },
  { icon: BellRingIcon, title: "Compares it with its recent median" },
  { icon: SendIcon, title: "Alerts you on Telegram" },
];

export function EmptyAgents() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-4 py-4 md:px-6">
      <header>
        <h1 className="text-[1.375rem] leading-none font-semibold tracking-tight">Agents</h1>
      </header>

      <section className="flex min-h-[24rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/55 px-6 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-brand">
          <ZapIcon className="size-5" />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <h2 className="text-[1.0625rem] font-semibold tracking-tight">No volume alert yet</h2>
          <p className="max-w-md text-xs text-muted-foreground">
            Pick the pools you care about and get a Telegram message when a pool's one-minute volume jumps well above
            its normal level.
          </p>
        </div>
        <Button asChild className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90">
          <Link to="/agents/new" search={{ step: "pools" }}>
            <PlusIcon /> Set up volume alerts
          </Link>
        </Button>
      </section>

      <section className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-lg border bg-card px-4 py-3">
        {HOW.map(({ icon: Icon, title }, i) => (
          <div key={title} className="flex items-center gap-3">
            {i > 0 && <span className="hidden h-8 w-px bg-border md:block" />}
            <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-brand">
              <Icon className="size-3.5" />
            </span>
            <p className="text-[0.7rem] font-medium">{title}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
