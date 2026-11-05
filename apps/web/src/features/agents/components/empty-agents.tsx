import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BotIcon,
  ClockIcon,
  DownloadIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { POOLS } from "../agents";
import { PairIcons } from "./agent-ui";

const TEMPLATES = [
  {
    name: "Stability",
    blurb: "Tight range, steady fees",
    badge: { label: "Popular", style: "border-brand/35 bg-brand/10 text-brand" },
    pool: POOLS[0],
    range: "±4 bins",
    rebalance: "15 min",
    apr: "24.6%",
    risk: "Stop-loss −18% · 12 rebalances/day",
    featured: true,
  },
  {
    name: "Blue chip",
    blurb: "Low volatility, low upkeep",
    badge: { label: "Stable", style: "text-muted-foreground" },
    pool: POOLS[1],
    range: "±8 bins",
    rebalance: "30 min",
    apr: "9.8%",
    risk: "Stop-loss −10% · 6 rebalances/day",
  },
  {
    name: "Momentum",
    blurb: "Higher fees, active management",
    badge: { label: "Higher risk", style: "border-amber-500/35 bg-amber-500/10 text-amber-500" },
    pool: POOLS[2],
    range: "±6 bins",
    rebalance: "10 min",
    apr: "41.2%",
    risk: "Stop-loss −25% · 24 rebalances/day",
  },
];

const HOW = [
  { icon: RefreshCwIcon, title: "Watches every 30s" },
  { icon: ShieldCheckIcon, title: "Checks guardrails first" },
  { icon: ClockIcon, title: "Reports what it did" },
];

export function EmptyAgents() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-4 py-4 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[1.375rem] leading-none font-semibold tracking-tight">Agents</h1>
            <span className="rounded-sm border px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">0 of 3</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7.5 text-[0.7rem]">
            <DownloadIcon /> Import agent
          </Button>
          <Button
            asChild
            size="sm"
            className="h-7.5 bg-brand text-[0.7rem] font-semibold text-brand-foreground hover:bg-brand/90"
          >
            <Link to="/agents/new" search={{ step: "strategy" }}>
              <PlusIcon /> New agent
            </Link>
          </Button>
        </div>
      </header>

      <section className="flex min-h-[28rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/55 px-6 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-brand">
          <BotIcon className="size-5" />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <h2 className="text-[1.0625rem] font-semibold tracking-tight">No agents running yet</h2>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90">
            <Link to="/agents/new" search={{ step: "strategy" }}>
              <PlusIcon /> Create your first agent
            </Link>
          </Button>
          <Button variant="outline">
            <PlayIcon /> See how it works
          </Button>
        </div>
      </section>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <SparklesIcon className="size-3.5 text-brand" /> Start from a template
          </span>
        </div>
        <Link
          to="/agents/new"
          search={{ step: "strategy" }}
          className="flex items-center gap-1 text-[0.7rem] font-medium text-brand"
        >
          Start from scratch <ArrowRightIcon className="size-3" />
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {TEMPLATES.map((t) => (
          <article
            key={t.name}
            className={`flex flex-col gap-2.5 rounded-lg border bg-card p-4 ${t.featured ? "border-brand/40" : ""}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium">{t.name}</p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[0.55rem] font-semibold tracking-wider uppercase ${t.badge.style}`}
              >
                {t.badge.label}
              </span>
            </div>
            {t.pool && (
              <div className="flex items-center gap-2">
                <PairIcons pool={t.pool} />
                <span className="text-[0.7rem]">{t.pool.pair}</span>
                <span className="text-[0.625rem] text-muted-foreground">
                  {t.pool.feePct}% fee · bin step {t.pool.binStep}
                </span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 border-t pt-2">
              {[
                ["Range", t.range, ""],
                ["Rebalance", t.rebalance, ""],
                ["Est. APR", t.apr, "text-profit"],
              ].map(([label, value, style]) => (
                <div key={label}>
                  <p className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
                  <p className={`text-[0.7rem] font-medium ${style}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[0.625rem] text-muted-foreground">{t.risk}</span>
              <Link
                to="/agents/new"
                search={{ step: "strategy" }}
                className="flex items-center gap-1 text-[0.7rem] font-medium text-brand"
              >
                Use <ArrowRightIcon className="size-3" />
              </Link>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-3 rounded-lg border bg-card px-4 py-3">
        {HOW.map(({ icon: Icon, title }, i) => (
          <div key={title} className="flex items-center gap-3">
            {i > 0 && <span className="hidden h-8 w-px bg-border md:block" />}
            <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-brand">
              <Icon className="size-3.5" />
            </span>
            <div>
              <p className="text-[0.7rem] font-medium">{title}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
