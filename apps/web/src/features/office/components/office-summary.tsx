import { LayersIcon, XIcon } from "lucide-react";
import { useState } from "react";
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
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { FormError } from "@/features/agents/components/agent-ui";
import { timeAgo } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import { AGENT_INFO, deployed, deskUsage, type OfficeView, type PositionView, spendVsCap } from "../office";
import { closePositionFn } from "../office.functions";
import { Portrait } from "./agent-card";
import { cost, DASH, Meter, PanelEmpty, Section, sol, toneOf, usd, useOfficeMutation } from "./office-ui";

/** Realized PnL of closed positions, today (UTC) and all time; unknown PnL is a dash. */
export function PnlCard({ view }: { view: OfficeView }) {
  const cells = [
    { label: "Today (UTC)", amount: view.pnl.today },
    { label: "All time", amount: view.pnl.total },
  ];
  return (
    <Section title="Realized PnL">
      <dl className="m-0 grid grid-cols-2 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[0.6875rem] text-muted-foreground">{c.label}</dt>
            <dd className={`m-0 truncate text-base font-medium tabular-nums ${toneOf(c.amount.sol)}`}>
              {sol(c.amount.sol, true)}
            </dd>
            <dd className="m-0 text-[0.6875rem] text-muted-foreground tabular-nums">{usd(c.amount.usd, true)}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** Open journal rows: simulated ones from Preview, real ones the Executor opened. */
export function PositionsCard({ view, now }: { view: OfficeView; now: number }) {
  const dep = deployed(view.positions);
  return (
    <Section
      title="Positions"
      action={
        <Badge variant="outline" className="font-mono">
          {view.positions.length} / {view.config.guardrails.maxActivePositions}
        </Badge>
      }
    >
      {view.positions.length === 0 ? (
        <PanelEmpty icon={<LayersIcon />} title="No open positions" />
      ) : (
        <>
          <ItemGroup className="gap-1.5">
            {view.positions.map((p) => (
              <PositionRow key={p.id} position={p} now={now} />
            ))}
          </ItemGroup>
          <p className="text-[0.6875rem] text-muted-foreground tabular-nums">
            {sol(dep.sol)} · {usd(dep.usd)} deployed
          </p>
        </>
      )}
    </Section>
  );
}

function PositionRow({ position: p, now }: { position: PositionView; now: number }) {
  const [confirming, setConfirming] = useState(false);
  const close = useOfficeMutation(closePositionFn);
  const name = p.poolName ?? shortAddr(p.poolAddress);
  return (
    <Item variant="outline" size="xs">
      <ItemContent className="min-w-0">
        <ItemTitle>
          <span className="truncate">{name}</span>
          {p.simulated && <Badge variant="info">Sim</Badge>}
        </ItemTitle>
        <ItemDescription className="truncate font-mono">
          {sol(p.amountSol)}
          {!p.simulated && ` → ${p.valueSol === null ? "—" : sol(p.valueSol)}`} · {timeAgo(p.openedAt, now)}
        </ItemDescription>
        <FormError error={close.error} />
      </ItemContent>
      {
        <ItemActions>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Close ${name}`}
            disabled={close.isPending}
            onClick={() => setConfirming(true)}
          >
            <XIcon />
          </Button>
        </ItemActions>
      }
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {p.simulated
                ? "The simulated position is marked closed. Its PnL stays unknown and is left out of the totals."
                : "A close proposal goes through the guardrails and comes back for your approval. Once approved, the position is withdrawn and swapped back to SOL."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it open</AlertDialogCancel>
            <AlertDialogAction onClick={() => close.mutate({ data: { journalId: p.id } })}>
              {p.simulated ? "Close position" : "Propose close"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Item>
  );
}

/** Today's LLM spend against each key source's cap, then what each desk ran on. */
export function SpendCard({ view }: { view: OfficeView }) {
  const s = spendVsCap(view.spend, view.config);
  const usage = deskUsage(view.spend, view.config.models);
  const calls = usage.reduce((n, u) => n + u.runs, 0);
  const caps = [
    { key: "vexis" as const, label: "Vexis key", meter: s.vexis },
    { key: "own" as const, label: "Own keys", meter: s.own },
  ];
  return (
    <Section
      title="Model usage"
      action={
        <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
          {calls} {calls === 1 ? "call" : "calls"} today
        </span>
      }
    >
      {caps.map((c) => (
        <div key={c.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5">
              {c.label}
              {view.config.keySource === c.key && <Badge variant="brand">In use</Badge>}
            </span>
            <span className="tabular-nums">
              {cost(c.meter.usd)} <span className="text-muted-foreground">/ {cost(c.meter.cap)}</span>
            </span>
          </div>
          <Meter share={c.meter.share} className={c.meter.share >= 1 ? "bg-loss" : "bg-brand"} />
        </div>
      ))}
      <ItemGroup className="gap-1 border-t pt-2">
        {usage.map((u) => {
          const last = view.runs.filter((r) => r.agent === u.agent).sort((a, b) => b.at - a.at)[0];
          const idle = !u.model || u.usd === 0;
          return (
            <Item key={u.agent} variant="outline" size="xs">
              <ItemMedia variant="image" className="h-7 w-5 rounded border bg-muted/50">
                <Portrait agent={u.agent} className="h-6 w-4" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>
                  <span className="truncate">{AGENT_INFO[u.agent].name}</span>
                  {u.free && <Badge variant="secondary">free</Badge>}
                </ItemTitle>
                <ItemDescription className="truncate font-mono">{u.model?.model ?? "No model"}</ItemDescription>
                {last?.error && (
                  <span className="text-[0.625rem] text-loss" title={last.error}>
                    Last call failed {timeAgo(last.at, view.now)}
                  </span>
                )}
              </ItemContent>
              <ItemActions>
                <div className="flex flex-col items-end gap-0.5">
                  <span className={`text-xs font-medium tabular-nums ${idle ? "text-muted-foreground" : ""}`}>
                    {u.model ? cost(u.usd) : DASH}
                  </span>
                  <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                    {!u.model ? DASH : u.runs === 0 ? "not run yet" : `${u.runs} ${u.runs === 1 ? "call" : "calls"}`}
                  </span>
                </div>
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </Section>
  );
}
