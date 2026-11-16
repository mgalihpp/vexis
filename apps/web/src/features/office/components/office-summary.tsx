import { PROVIDER_LABEL } from "@vexis/db/office";
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
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { FormError } from "@/features/agents/components/agent-ui";
import { timeAgo } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import { deployed, type OfficeView, type PositionView, spendVsCap } from "../office";
import { closePositionFn } from "../office.functions";
import { cost, Meter, PanelEmpty, Section, sol, toneOf, usd, useOfficeMutation } from "./office-ui";

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
            <dd className={`m-0 truncate font-mono text-base font-medium tabular-nums ${toneOf(c.amount.sol)}`}>
              {sol(c.amount.sol, true)}
            </dd>
            <dd className="m-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
              {usd(c.amount.usd, true)}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** Open journal rows. In the MVP every one is simulated, and closing one records no PnL. */
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
          <p className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
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
          {sol(p.amountSol)} · {timeAgo(p.openedAt, now)}
        </ItemDescription>
        <FormError error={close.error} />
      </ItemContent>
      {p.simulated && (
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
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The simulated position is marked closed. Its PnL stays unknown and is left out of the totals.
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
    </Item>
  );
}

/** Today's LLM spend against the cap of each key source, and per provider. */
export function SpendCard({ view }: { view: OfficeView }) {
  const s = spendVsCap(view.spend, view.config);
  const caps = [
    { key: "vexis" as const, label: "Vexis key", meter: s.vexis },
    { key: "own" as const, label: "Own keys", meter: s.own },
  ];
  return (
    <Section title="Model usage">
      {caps.map((c) => (
        <div key={c.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5">
              {c.label}
              {view.config.keySource === c.key && <Badge variant="brand">In use</Badge>}
            </span>
            <span className="font-mono tabular-nums">
              {cost(c.meter.usd)} <span className="text-muted-foreground">/ {cost(c.meter.cap)}</span>
            </span>
          </div>
          <Meter share={c.meter.share} className={c.meter.share >= 1 ? "bg-loss" : "bg-brand"} />
        </div>
      ))}
      {s.rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 border-t p-0 pt-2.5">
          {s.rows.map((r) => (
            <li key={`${r.provider}-${r.keySource}`} className="flex items-center justify-between gap-2 text-xs">
              <span>
                {PROVIDER_LABEL[r.provider]}
                <span className="ml-1.5 text-muted-foreground">
                  {r.runs} {r.runs === 1 ? "run" : "runs"}
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
