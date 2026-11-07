import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStamp } from "@/features/timezone/timezone";
import { age } from "../analytics";
import { tradersQuery } from "../analytics.queries";
import {
  type GroupFlow,
  type GroupKind,
  type HoldStatus,
  type TopTrader,
  type TradeFilter,
  type TradeRow,
  type TradersResult,
  type TraderTag,
  tradeFilter,
} from "../traders";
import { amount, NA, Panel, short, sol, sol3, solAmount, tone, usd } from "./ui";
import { WalletAvatar } from "./wallet-avatar";

type Ok = Extract<TradersResult, { ok: true }>;

const UNAVAILABLE = "Trader data could not be loaded. Try again shortly.";

const GROUP_LABEL: Record<GroupKind, string> = { kol: "KOL", whale: "Whale", smart: "Smart money" };

const STATUS: Record<HoldStatus, { label: string; variant: "profit" | "brand" | "destructive" | "info" }> = {
  holding: { label: "Holding", variant: "profit" },
  partial: { label: "Partial", variant: "brand" },
  sold: { label: "Sold out", variant: "destructive" },
  rebought: { label: "Bought back", variant: "info" },
};

function TagBadge({ tag }: { tag: TraderTag }) {
  switch (tag.kind) {
    case "kol":
      return tag.twitter ? (
        <Badge variant="brand" asChild>
          <a href={`https://x.com/${tag.twitter}`} target="_blank" rel="noreferrer" title={`@${tag.twitter} on X`}>
            {tag.name}
          </a>
        </Badge>
      ) : (
        <Badge variant="brand">{tag.name}</Badge>
      );
    case "whale":
      return <Badge variant="info">Whale</Badge>;
    case "smart": {
      const tip = `Lifetime PnL ${usd(tag.lifetimePnlUsd, true)} across all tokens`;
      return (
        <InfoTip aria-label={tip} content={tip}>
          <Badge variant="profit">Smart</Badge>
        </InfoTip>
      );
    }
    case "bot":
      return <Badge variant="secondary">Bot</Badge>;
  }
}

function Wallet({ address, tags }: { address: string; tags: readonly TraderTag[] }) {
  return (
    <span className="flex items-center gap-2">
      <WalletAvatar address={address} />
      <span className="flex flex-col gap-1">
        <a
          href={`https://solscan.io/account/${address}`}
          target="_blank"
          rel="noreferrer"
          title={address}
          className="inline-flex items-center gap-1 font-mono font-semibold hover:text-brand"
        >
          {short(address)}
          <ExternalLinkIcon className="size-3 text-muted-foreground" />
        </a>
        {tags.length > 0 && (
          <span className="flex gap-1">
            {tags.map((t) => (
              <TagBadge key={t.kind} tag={t} />
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

/** USD over SOL, right aligned. `signed` tones and signs both lines. */
function Money({ usd: u, sol: s, signed = false }: { usd: number | null; sol: number | null; signed?: boolean }) {
  return (
    <span className="flex flex-col items-end tabular-nums">
      <span className={`font-semibold ${signed ? tone(u) : ""}`}>{usd(u, signed)}</span>
      <span className={signed ? tone(sol3(s)) : "text-muted-foreground"}>{signed ? sol(s) : solAmount(s)}</span>
    </span>
  );
}

const FILTERS: { value: TradeFilter["kind"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "kol", label: "KOL" },
  { value: "whale", label: "Whale" },
  { value: "smart", label: "Smart" },
];

function RecentTrades({ data }: { data: Ok }) {
  const stamp = useStamp();
  const [filter, setFilter] = useState<TradeFilter>({ kind: "all", hideBots: true });
  const rows = data.trades.filter((t) => tradeFilter(t.tags, filter));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={filter.kind}
          onValueChange={(v) => v && setFilter((f) => ({ ...f, kind: v as TradeFilter["kind"] }))}
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value}>
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle
          size="sm"
          variant="outline"
          pressed={filter.hideBots}
          onPressedChange={(hideBots) => setFilter((f) => ({ ...f, hideBots }))}
        >
          Hide bots
        </Toggle>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">No trades match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Age</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Tx</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TradeLine
                key={`${t.tx}:${t.wallet}:${t.side}`}
                t={t}
                now={data.fetchedAt}
                symbol={data.symbol}
                stamp={stamp}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TradeLine({
  t,
  now,
  symbol,
  stamp,
}: {
  t: TradeRow;
  now: number;
  symbol: string;
  stamp: (ms: number) => string;
}) {
  return (
    <TableRow>
      <TableCell title={stamp(t.time)}>{age(t.time, now)}</TableCell>
      <TableCell className={t.side === "buy" ? "text-profit" : "text-loss"}>
        {t.side === "buy" ? "Buy" : "Sell"}
      </TableCell>
      <TableCell>
        <Wallet address={t.wallet} tags={t.tags} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {amount(t.amount)} <span className="text-muted-foreground">{symbol}</span>
      </TableCell>
      <TableCell>
        <Money usd={t.usd} sol={t.sol} />
      </TableCell>
      <TableCell className="text-right">
        <a
          href={`https://solscan.io/tx/${t.tx}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Transaction on Solscan"
          className="inline-flex text-muted-foreground hover:text-brand"
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </TableCell>
    </TableRow>
  );
}

function TopTraders({
  data,
  top,
  group,
  onGroup,
}: {
  data: Ok;
  top: readonly TopTrader[];
  group: GroupKind | null;
  onGroup: (g: GroupKind | null) => void;
}) {
  const stamp = useStamp();
  const rows = group ? top.filter((t) => tradeFilter(t.tags, { kind: group, hideBots: true })) : top;
  return (
    <div className="flex flex-col gap-2">
      {group && (
        <p className="flex items-center gap-2 text-muted-foreground">
          Showing {GROUP_LABEL[group]} wallets
          <button type="button" className="text-brand" onClick={() => onGroup(null)}>
            Show all
          </button>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">No traders match.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Bought</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Token PnL</TableHead>
              <TableHead className="text-right">Holding</TableHead>
              <TableHead className="text-right">Lifetime PnL</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Last trade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t, i) => (
              <TableRow key={t.wallet}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <Wallet address={t.wallet} tags={t.tags} />
                </TableCell>
                <TableCell>
                  {t.status ? (
                    <Badge variant={STATUS[t.status].variant}>{STATUS[t.status].label}</Badge>
                  ) : (
                    <span className="text-muted-foreground">{NA}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Money {...t.bought} />
                </TableCell>
                <TableCell>
                  <Money {...t.sold} />
                </TableCell>
                <TableCell>
                  <Money {...t.tokenPnl} signed />
                </TableCell>
                <TableCell>
                  <Money {...t.holding} />
                </TableCell>
                <TableCell className={`text-right font-semibold tabular-nums ${tone(t.lifetimePnlUsd)}`}>
                  {usd(t.lifetimePnlUsd, true)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.trades ?? NA}</TableCell>
                <TableCell
                  className="text-right tabular-nums"
                  title={t.lastTrade == null ? undefined : stamp(t.lastTrade)}
                >
                  {t.lastTrade == null ? NA : `${age(t.lastTrade, data.fetchedAt)} ago`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-muted-foreground">SOL at the current price.</p>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

function GroupCard({ g, active, onClick }: { g: GroupFlow; active: boolean; onClick: () => void }) {
  const split = [
    `Holding ${g.holding}`,
    `Partial ${g.partial}`,
    `Sold out ${g.sold}`,
    `Bought back ${g.rebought}`,
    ...(g.unknown > 0 ? [`Unknown ${g.unknown}`] : []),
  ].join(" · ");
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={g.wallets === 0}
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-md border p-2.5 text-left text-xs hover:bg-muted/40 disabled:pointer-events-none ${active ? "border-brand" : "bg-background/90"}`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{GROUP_LABEL[g.kind]}</span>
        <span className="text-muted-foreground">{g.wallets > 0 ? `${g.wallets} wallets` : "None found"}</span>
      </span>
      {g.wallets > 0 && (
        <>
          <Line label={`Bought (${g.buyers})`}>
            {usd(g.buyUsd)} <span className="text-muted-foreground">{solAmount(g.buySol)}</span>
          </Line>
          <Line label={`Sold (${g.sellers})`}>
            {usd(g.sellUsd)} <span className="text-muted-foreground">{solAmount(g.sellSol)}</span>
          </Line>
          <Line label="Net flow">
            <span className={`font-semibold ${tone(g.netUsd)}`}>{usd(g.netUsd, true)}</span>{" "}
            <span className={tone(sol3(g.netSol))}>{sol(g.netSol)}</span>
          </Line>
          <span className="text-muted-foreground">{split}</span>
        </>
      )}
    </button>
  );
}

function coverage(data: Ok) {
  const base = `From the ${data.listed} biggest buyers and most profitable traders of ${data.symbol}`;
  const kols = data.kolError ? ". Recent KOL trades could not be loaded" : ", plus recent KOL trades";
  return `${base}${kols}. SOL at the current price.`;
}

function Loading() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <Skeleton key={i} className="h-8" />
      ))}
    </div>
  );
}

function Loaded({ data }: { data: Ok }) {
  const [tab, setTab] = useState("recent");
  const [group, setGroup] = useState<GroupKind | null>(null);
  const showTop = data.top !== null || data.topError;
  return (
    <>
      {data.groups && (
        <div className="flex flex-col gap-1.5">
          <div className="grid gap-1.5 @xl:grid-cols-3">
            {data.groups.map((g) => (
              <GroupCard
                key={g.kind}
                g={g}
                active={group === g.kind}
                onClick={() => {
                  setGroup(group === g.kind ? null : g.kind);
                  setTab("top");
                }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{coverage(data)}</p>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="recent">Recent trades</TabsTrigger>
          {showTop && <TabsTrigger value="top">Top traders</TabsTrigger>}
        </TabsList>
        <TabsContent value="recent">
          <RecentTrades data={data} />
        </TabsContent>
        {showTop && (
          <TabsContent value="top">
            {data.top ? (
              <TopTraders data={data} top={data.top} group={group} onGroup={setGroup} />
            ) : (
              <p className="text-muted-foreground">Top traders could not be loaded. Try again shortly.</p>
            )}
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

/** Loaded on the client only, since every request counts against the Solana Tracker quota. */
export function Traders({ pool }: { pool: string }) {
  const { data, isError } = useQuery(tradersQuery(pool));
  return (
    <Panel title="Traders" className="@container">
      {!data && !isError && <Loading />}
      {!data && isError && <p className="text-xs text-loss">{UNAVAILABLE}</p>}
      {data && !data.ok && (
        <p className={`text-xs ${data.reason === "no_key" ? "text-muted-foreground" : "text-loss"}`}>{data.message}</p>
      )}
      {data?.ok && <Loaded data={data} />}
    </Panel>
  );
}
