import { PROVIDER_LABEL } from "@vexis/db/office";
import { XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/features/agents/components/agent-ui";
import { timeAgo } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import { deployed, type OfficeView, type PositionView, spendVsCap } from "../office";
import { closePositionFn } from "../office.functions";
import { cost, DASH, Meter, Section, sol, toneOf, usd, useOfficeMutation } from "./office-ui";

function Stat({ label, value, sub, tone = "" }: { label: string; value: ReactNode; sub: ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-card px-3.5 py-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={`truncate font-mono text-lg font-medium tabular-nums ${tone}`}>{value}</span>
      <div className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">{sub}</div>
    </div>
  );
}

/** The four cards over the floor. A value the office does not track is a dash. */
export function OfficeStats({ view }: { view: OfficeView }) {
  const g = view.config.guardrails;
  const dep = deployed(view.positions);
  const spend = spendVsCap(view.spend, view.config)[view.config.keySource];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Free balance" value={DASH} sub={`Not tracked yet · reserve ${g.solReserve} SOL`} />
      <Stat
        label="Active positions"
        value={`${view.positions.length} / ${g.maxActivePositions}`}
        sub={`${sol(dep.sol)} · ${usd(dep.usd)} deployed`}
      />
      <Stat
        label="PnL today (UTC)"
        value={sol(view.pnl.today.sol, true)}
        tone={toneOf(view.pnl.today.sol)}
        sub={`${usd(view.pnl.today.usd, true)} · total ${sol(view.pnl.total.sol, true)}`}
      />
      <Stat
        label="LLM cost today"
        value={cost(spend.usd)}
        tone={spend.share >= 1 ? "text-loss" : ""}
        sub={
          <>
            of {cost(spend.cap)} · {view.config.keySource === "vexis" ? "Vexis key" : "own keys"}
            <div className="mt-1.5">
              <Meter share={spend.share} className={spend.share >= 1 ? "bg-loss" : "bg-brand"} />
            </div>
          </>
        }
      />
    </div>
  );
}

/** Open journal rows. In the MVP every one is simulated, and closing one records no PnL. */
export function PositionsCard({ view, now }: { view: OfficeView; now: number }) {
  return (
    <Section
      title="Active positions"
      action={<span className="text-xs text-muted-foreground">{view.positions.length}</span>}
    >
      {view.positions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No open positions.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {view.positions.map((p) => (
            <PositionRow key={p.id} position={p} now={now} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5 text-xs">
        <span className="text-muted-foreground">
          Realized today{" "}
          <span className={`font-mono ${toneOf(view.pnl.today.sol)}`}>
            {sol(view.pnl.today.sol, true)} · {usd(view.pnl.today.usd, true)}
          </span>
        </span>
        <span className="text-muted-foreground">
          All time{" "}
          <span className={`font-mono ${toneOf(view.pnl.total.sol)}`}>
            {sol(view.pnl.total.sol, true)} · {usd(view.pnl.total.usd, true)}
          </span>
        </span>
      </div>
    </Section>
  );
}

function PositionRow({ position: p, now }: { position: PositionView; now: number }) {
  const [confirming, setConfirming] = useState(false);
  const close = useOfficeMutation(closePositionFn);
  const name = p.poolName ?? shortAddr(p.poolAddress);
  return (
    <li className="flex items-center gap-3 border-t py-2 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span className="truncate">{name}</span>
          {p.simulated && <Badge variant="info">Simulated</Badge>}
        </div>
        <div className="truncate text-[0.6875rem] text-muted-foreground">
          <span className="font-mono">
            {sol(p.amountSol)} · {usd(p.amountUsd)}
          </span>{" "}
          · opened {timeAgo(p.openedAt, now)} · {p.openReason}
        </div>
        <FormError error={close.error} />
      </div>
      {p.simulated && (
        <Button variant="outline" size="sm" disabled={close.isPending} onClick={() => setConfirming(true)}>
          <XIcon />
          Close
        </Button>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This simulated position is marked closed by hand. Nothing was priced, so its PnL stays unknown and is left
              out of the totals. No transaction is sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it open</AlertDialogCancel>
            <AlertDialogAction onClick={() => close.mutate({ data: { journalId: p.id } })}>
              Close position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Today's LLM spend per provider, against the cap of the key source it was billed to. */
export function SpendCard({ view }: { view: OfficeView }) {
  const s = spendVsCap(view.spend, view.config);
  const caps = [
    { key: "vexis" as const, label: "Vexis key", hint: "cap set by the admin", meter: s.vexis },
    { key: "own" as const, label: "Own keys", hint: "your daily guardrail", meter: s.own },
  ];
  return (
    <Section title="LLM cost today (UTC)">
      {caps.map((c) => (
        <div key={c.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>
              {c.label}
              {view.config.keySource === c.key && <span className="ml-1.5 text-brand">in use</span>}
              <span className="ml-1.5 text-muted-foreground">{c.hint}</span>
            </span>
            <span className="font-mono tabular-nums">
              {cost(c.meter.usd)} / {cost(c.meter.cap)}
            </span>
          </div>
          <Meter share={c.meter.share} className={c.meter.share >= 1 ? "bg-loss" : "bg-brand"} />
        </div>
      ))}
      {s.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No LLM runs today.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {s.rows.map((r) => (
            <li key={`${r.provider}-${r.keySource}`} className="flex items-center justify-between gap-2 text-xs">
              <span>
                {PROVIDER_LABEL[r.provider]}
                <span className="ml-1.5 text-muted-foreground">
                  {r.keySource === "vexis" ? "Vexis key" : "own key"} · {r.runs} {r.runs === 1 ? "run" : "runs"}
                </span>
              </span>
              <span className="font-mono tabular-nums">{cost(r.usd)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
