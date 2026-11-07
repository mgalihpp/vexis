import { useQuery } from "@tanstack/react-query";
import { BotIcon, BrainIcon, ExternalLinkIcon, FishSymbolIcon, type LucideIcon, MegaphoneIcon } from "lucide-react";
import { useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Notice } from "@/features/portfolio/components/notice";
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
  WHALE_HOLD_USD,
  WHALE_TRADE_USD,
} from "../traders";
import { amount, compact, NA, Panel, short, sol, sol3, solAmount, tone, usd } from "./ui";
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

const TAG_ICON: Record<TraderTag["kind"], { icon: LucideIcon; label: string; className: string }> = {
  kol: { icon: MegaphoneIcon, label: "KOL", className: "text-brand" },
  whale: { icon: FishSymbolIcon, label: "Whale", className: "text-blue-600 dark:text-blue-400" },
  smart: { icon: BrainIcon, label: "Smart money", className: "text-profit" },
  bot: { icon: BotIcon, label: "Bot", className: "text-muted-foreground" },
};

function tagTip(tag: TraderTag) {
  switch (tag.kind) {
    case "kol":
      return `KOL: ${tag.name}${tag.twitter ? ` (@${tag.twitter})` : ""}`;
    case "whale":
      return `Whale: bought ${usd(WHALE_TRADE_USD)}+ or holds ${usd(WHALE_HOLD_USD)}+`;
    case "smart":
      return `Smart money: lifetime PnL ${usd(tag.lifetimePnlUsd, true)} across all tokens`;
    case "bot":
      return "Bot or arbitrage wallet";
  }
}

function TagIcon({ tag }: { tag: TraderTag }) {
  const { icon: Icon, label, className } = TAG_ICON[tag.kind];
  const tip = tagTip(tag);
  return (
    <InfoTip aria-label={tip} content={tip} className="inline-flex">
      <Icon className={`size-3.5 ${className}`} aria-label={label} />
    </InfoTip>
  );
}

function Tags({ tags }: { tags: readonly TraderTag[] }) {
  const kol = tags.find((t) => t.kind === "kol");
  return (
    <span className="flex items-center gap-1.5">
      {tags.map((t) => (
        <TagIcon key={t.kind} tag={t} />
      ))}
      {kol?.kind === "kol" &&
        (kol.twitter ? (
          <a
            href={`https://x.com/${kol.twitter}`}
            target="_blank"
            rel="noreferrer"
            className="text-[0.6875rem] text-muted-foreground hover:text-brand"
          >
            {kol.name}
          </a>
        ) : (
          <span className="text-[0.6875rem] text-muted-foreground">{kol.name}</span>
        ))}
    </span>
  );
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
        {tags.length > 0 && <Tags tags={tags} />}
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
    </div>
  );
}

const CAPTION = "text-[0.625rem] font-medium tracking-[0.025em] text-muted-foreground uppercase";

function Side({
  label,
  wallets,
  usdValue,
  solValue,
}: {
  label: string;
  wallets: number;
  usdValue: number | null;
  solValue: number | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={CAPTION}>
        {label} · {wallets}
      </span>
      <span className="font-semibold tabular-nums">{usd(usdValue)}</span>
      <span className="text-muted-foreground tabular-nums">{solCompact(solValue)}</span>
    </div>
  );
}

const solCompact = (v: number | null, signed = false) =>
  v == null ? NA : `${v < 0 ? "-" : signed && v > 0 ? "+" : ""}${compact(Math.abs(v))} SOL`;

const SPLIT: { key: "holding" | "partial" | "sold" | "rebought" | "unknown"; label: string; className: string }[] = [
  { key: "holding", label: "Holding", className: "bg-profit" },
  { key: "partial", label: "Partial", className: "bg-brand" },
  { key: "rebought", label: "Bought back", className: "bg-blue-500" },
  { key: "sold", label: "Sold out", className: "bg-loss" },
  { key: "unknown", label: "Unknown", className: "bg-muted-foreground/40" },
];

function StatusSplit({ g }: { g: GroupFlow }) {
  const parts = SPLIT.filter((s) => s.key !== "unknown" || g.unknown > 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        {parts.map((s) => (
          <span key={s.key} className={s.className} style={{ width: `${(g[s.key] / g.wallets) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        {parts.map((s) => (
          <span key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className={`size-1.5 rounded-full ${s.className}`} />
              {s.label}
            </span>
            <span className="tabular-nums">{g[s.key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function GroupCard({ g, active, onClick }: { g: GroupFlow; active: boolean; onClick: () => void }) {
  const { icon: Icon, className } = TAG_ICON[g.kind];
  const flow = (g.buyUsd ?? 0) + (g.sellUsd ?? 0);
  const buyShare = flow > 0 ? ((g.buyUsd ?? 0) / flow) * 100 : null;
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={g.wallets === 0}
      onClick={onClick}
      className={`flex flex-col gap-3 rounded-md border p-3 text-left text-xs hover:bg-muted/40 disabled:pointer-events-none ${active ? "border-brand" : "bg-background/90"}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon className={`size-4 ${className}`} />
          {GROUP_LABEL[g.kind]}
        </span>
        <span className="text-muted-foreground">{g.wallets > 0 ? `${g.wallets} wallets` : "None found"}</span>
      </span>
      {g.wallets > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Side label="Bought" wallets={g.buyers} usdValue={g.buyUsd} solValue={g.buySol} />
            <Side label="Sold" wallets={g.sellers} usdValue={g.sellUsd} solValue={g.sellSol} />
          </div>
          {buyShare != null && (
            <div className="flex h-1.5 overflow-hidden rounded-full bg-loss/70">
              <span className="bg-profit" style={{ width: `${buyShare}%` }} />
            </div>
          )}
          <div className="flex flex-col gap-0.5 border-t pt-2">
            <span className={CAPTION}>Net flow</span>
            <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
              <span className={`text-sm font-semibold ${tone(g.netUsd)}`}>{usd(g.netUsd, true)}</span>
              <span className={tone(sol3(g.netSol))}>{solCompact(g.netSol, true)}</span>
            </span>
          </div>
          <div className="flex flex-col gap-1.5 border-t pt-2">
            <span className={CAPTION}>Still holding?</span>
            <StatusSplit g={g} />
          </div>
        </>
      )}
    </button>
  );
}

function coverage(data: Ok) {
  const base = `From the ${data.listed} biggest buyers and most profitable traders of ${data.symbol}`;
  const kols = data.kolError ? ". Recent KOL trades could not be loaded" : ", plus recent KOL trades";
  return `${base}${kols}.`;
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
          <Notice>{coverage(data)}</Notice>
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
