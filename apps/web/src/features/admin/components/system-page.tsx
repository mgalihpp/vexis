import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ScheduleName } from "@vexis/shared/heartbeat";
import {
  ActivityIcon,
  BookOpenIcon,
  BotIcon,
  ChevronRightIcon,
  EyeIcon,
  InboxIcon,
  type LucideIcon,
  RadarIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fullDuration, timeAgo } from "@/features/portfolio/money";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNow } from "@/hooks/use-now";
import { AUDIT_LABEL, stampUtc } from "../admin";
import { auditQuery, systemQuery } from "../admin.queries";
import { Chip, EmptyRow, Gauge, MENU_TRIGGER, Page, Pager, Pill, Stat, StatGrid, TabCard } from "./admin-ui";

const RUNTIMES = ["all", "runner", "office", "stale"] as const;
const LABEL = { all: "All", runner: "Runner", office: "Office", stale: "Stale" } as const;

const SCHEDULE_META: Record<ScheduleName, { icon: LucideIcon; cadence: string; summary: string }> = {
  cycle: {
    icon: ActivityIcon,
    cadence: "Every 1m",
    summary: "Ingests 1-minute pool volume and evaluates volume-watch spike rules.",
  },
  screener: {
    icon: RadarIcon,
    cadence: "Every 1m",
    summary: "Evaluates volume-watch agents watching screener presets.",
  },
  rebalance: {
    icon: SlidersHorizontalIcon,
    cadence: "Every 1m",
    summary: "Checks active DLMM positions and rebalances or claims fees when due.",
  },
  "office-executor": {
    icon: ZapIcon,
    cadence: "Every 1m",
    summary: "Signs and submits approved office proposals on-chain.",
  },
  "office-monitor": {
    icon: EyeIcon,
    cadence: "Every 1m",
    summary: "Watches open office positions against stop-loss and range guardrails.",
  },
  "office-bookkeeper": {
    icon: BookOpenIcon,
    cadence: "Every 1m",
    summary: "Reconciles closed office positions and records realized P&L.",
  },
  prune: {
    icon: Trash2Icon,
    cadence: "Every 1h",
    summary: "Prunes expired minute-volume samples from the database.",
  },
  "office-tick": {
    icon: BotIcon,
    cadence: "Every 1m",
    summary: "Runs office LLM agents (Scout, Strategist, Risk Manager, Manager).",
  },
  "office-inbox": {
    icon: InboxIcon,
    cadence: "Every 3s (writes 30s)",
    summary: "Polls Telegram for proposal approvals and user replies.",
  },
};

export function SystemPage() {
  const { data, refetch, isFetching } = useSuspenseQuery(systemQuery);
  const now = useNow(data.now);
  const [tab, setTab] = useState<(typeof RUNTIMES)[number]>("all");
  const [picked, setPicked] = useState<ScheduleName | null>(null);
  const ok = data.schedules.filter((s) => !s.stale).length;
  const stale = data.schedules.length - ok;
  const matching = (t: typeof tab) =>
    data.schedules.filter((s) => (t === "all" ? true : t === "stale" ? s.stale : s.runtime === t));
  const rows = matching(tab);
  const selected = data.schedules.find((s) => s.name === picked) ?? null;
  const d = data.datapi;
  const t = data.tracker;
  const datapiFree = d ? Math.max(0, d.remaining - d.reserve) : 0;

  return (
    <Page
      title="System"
      action={
        <button type="button" aria-label="Refresh" onClick={() => refetch()} className={MENU_TRIGGER}>
          <RefreshCwIcon className={`size-3.25 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <StatGrid>
        <Stat
          label="Datapi budget"
          info="This web process's last reading of the shared 300-request limit; shows a dash until the web app has made a request."
          value={d ? d.remaining : "—"}
          gauge={
            <Gauge
              good={d ? d.remaining : 0}
              bad={d ? Math.max(0, d.limit - d.remaining) : 0}
              goodLabel={d ? `${datapiFree} free` : "—"}
              badLabel={`/${d ? d.limit : 300}`}
            />
          }
        />
        <Stat
          label="Solana Tracker"
          info="Solana Tracker API requests used today out of the daily limit."
          value={t.configured ? t.used : "—"}
          gauge={
            <Gauge
              good={t.configured ? Math.max(0, t.limit - t.used) : 0}
              bad={t.configured ? t.used : 0}
              goodLabel={t.configured ? `${t.used} used` : "—"}
              badLabel={`/${t.limit}`}
            />
          }
        />
        <Stat label="Schedules" value={`${ok}/${data.schedules.length}`}>
          <span className="flex gap-2 text-[0.7rem] tabular-nums">
            <span className="text-profit">{ok}</span>
            <span className="text-loss">{stale}</span>
          </span>
        </Stat>
        <Stat label="Stale" value={stale} tone={stale > 0 ? "text-destructive" : "text-profit"} />
      </StatGrid>

      <section aria-label="Heartbeats" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Heartbeats</h2>
          <div role="tablist" aria-label="Heartbeats" className="flex items-center gap-1 rounded-lg bg-card p-1">
            {RUNTIMES.map((id) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active ? "bg-muted text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {LABEL[id]}
                  <Chip on={active}>{matching(id).length}</Chip>
                </button>
              );
            })}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg bg-card py-12 text-center text-xs text-muted-foreground">No schedules.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 min-[460px]:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => (
              <HeartbeatCard key={s.name} schedule={s} now={now} onSelect={() => setPicked(s.name)} />
            ))}
          </div>
        )}
      </section>

      <HeartbeatDetail schedule={selected} now={now} onClose={() => setPicked(null)} />

      <AuditCard />
    </Page>
  );
}

type Schedule = ReturnType<typeof useSystemSchedules>[number];
const useSystemSchedules = () => useSuspenseQuery(systemQuery).data.schedules;

function scheduleIconStyle(stale: boolean, runtime: Schedule["runtime"]) {
  if (stale) return "border-destructive/25 bg-destructive/10 text-destructive";
  if (runtime === "office") return "border-brand/25 bg-brand/10 text-brand";
  return "border-border bg-muted/60 text-foreground/80";
}

function HeartbeatCard({ schedule: s, now, onSelect }: { schedule: Schedule; now: number; onSelect: () => void }) {
  const meta = SCHEDULE_META[s.name] ?? {
    icon: ActivityIcon,
    cadence: "Every 1m",
    summary: "Runtime background schedule.",
  };
  const Icon = meta.icon;
  const elapsed = s.lastTickAt === null ? null : Math.max(0, now - s.lastTickAt);
  const stale = s.stale || (elapsed !== null && elapsed > s.staleMs);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full flex-col gap-3 rounded-lg border bg-card p-3.25 text-left transition-colors ${
        stale ? "border-destructive/40 hover:border-destructive/60" : "hover:border-foreground/20"
      }`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${scheduleIconStyle(stale, s.runtime)}`}
        >
          <Icon className="size-4" />
        </span>

        <div className="flex items-center gap-2">
          {s.lastTickAt === null ? (
            <Pill tone="muted">Idle</Pill>
          ) : (
            <Pill tone={stale ? "danger" : "profit"}>{stale ? "Stale" : "OK"}</Pill>
          )}
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{s.name}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
            {s.runtime}
          </span>
        </div>
        <div
          className={`mt-1 flex items-center justify-between gap-2 text-xs tabular-nums ${
            stale ? "font-medium text-destructive" : "text-muted-foreground"
          }`}
        >
          <span>{elapsed === null ? "No tick yet" : `Last tick ${fullDuration(elapsed)} ago`}</span>
          {s.lastError && <span className="truncate text-[0.65rem] text-destructive">Error</span>}
        </div>
      </div>
    </button>
  );
}

function HeartbeatDetail({
  schedule: s,
  now,
  onClose,
}: {
  schedule: Schedule | null;
  now: number;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const open = s !== null;
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          {s && (
            <>
              <DrawerHeader className="border-b text-left">
                <HeartbeatDetailHeader schedule={s} Title={DrawerTitle} Description={DrawerDescription} />
              </DrawerHeader>
              <div className="p-4">
                <HeartbeatDetailBody schedule={s} now={now} />
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        {s && (
          <>
            <DialogHeader className="border-b p-4 pr-10 text-left">
              <HeartbeatDetailHeader schedule={s} Title={DialogTitle} Description={DialogDescription} />
            </DialogHeader>
            <div className="p-4">
              <HeartbeatDetailBody schedule={s} now={now} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HeartbeatDetailHeader({
  schedule: s,
  Title,
  Description,
}: {
  schedule: Schedule;
  Title: typeof DialogTitle;
  Description: typeof DialogDescription;
}) {
  const meta = SCHEDULE_META[s.name] ?? {
    icon: ActivityIcon,
    cadence: "Every 1m",
    summary: "Runtime background schedule.",
  };
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${scheduleIconStyle(s.stale, s.runtime)}`}
      >
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Title className="text-sm font-semibold">{s.name}</Title>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
            {s.runtime}
          </span>
          {s.lastTickAt === null ? (
            <Pill tone="muted">Idle</Pill>
          ) : (
            <Pill tone={s.stale ? "danger" : "profit"}>{s.stale ? "Stale" : "OK"}</Pill>
          )}
        </div>
        <Description className="mt-1 text-xs leading-relaxed">{meta.summary}</Description>
      </div>
    </div>
  );
}

function HeartbeatDetailBody({ schedule: s, now }: { schedule: Schedule; now: number }) {
  const meta = SCHEDULE_META[s.name] ?? {
    icon: ActivityIcon,
    cadence: "Every 1m",
    summary: "Runtime background schedule.",
  };
  const elapsed = s.lastTickAt === null ? null : Math.max(0, now - s.lastTickAt);
  const stale = s.stale || (elapsed !== null && elapsed > s.staleMs);

  const rows: [string, string, string?][] = [
    ["Runtime", s.runtime === "runner" ? "apps/agents" : "apps/office"],
    ["Cadence", meta.cadence],
    ["Last tick", elapsed === null ? "—" : `${fullDuration(elapsed)} ago`, stale ? "text-destructive" : ""],
    ["Last tick (UTC)", s.lastTickAt ? stampUtc(s.lastTickAt) : "—"],
    ["Stale after", fullDuration(s.staleMs)],
    ["Watchdog alert", s.alertedAt ? `${timeAgo(s.alertedAt, now)} · ${stampUtc(s.alertedAt)}` : "None"],
  ];

  return (
    <div className="space-y-3 text-xs">
      <dl className="divide-y rounded-lg border bg-background/60 px-3">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={`text-right font-medium tabular-nums ${tone ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {s.lastError && s.lastErrorAt ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 font-medium text-destructive">
            <span>Last error</span>
            <span className="tabular-nums">
              {timeAgo(s.lastErrorAt, now)} · {stampUtc(s.lastErrorAt)}
            </span>
          </div>
          <p className="mt-1.5 leading-relaxed break-words text-foreground/90">{s.lastError}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2.5 text-muted-foreground">
          <span>Last error</span>
          <span className="font-medium text-foreground">None</span>
        </div>
      )}
    </div>
  );
}

function AuditCard() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ ...auditQuery({ page }), placeholderData: keepPreviousData });
  return (
    <TabCard
      label="Audit log"
      tabs={[{ id: "log", label: "Audit log", count: data?.total }]}
      active="log"
      onChange={() => {}}
    >
      <Table className="min-w-[44rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 pl-4">When (UTC)</TableHead>
            <TableHead>Admin</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="pr-4">Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.rows.length === 0 && <EmptyRow cols={4}>No admin actions yet.</EmptyRow>}
          {data?.rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-4 text-muted-foreground tabular-nums">{stampUtc(r.at.getTime())}</TableCell>
              <TableCell className="max-w-48 truncate">{r.actorEmail}</TableCell>
              <TableCell className="font-medium">{AUDIT_LABEL[r.action] ?? r.action}</TableCell>
              <TableCell className="max-w-64 truncate pr-4 text-muted-foreground">
                {r.targetLabel ?? r.targetType}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager total={data?.total ?? 0} page={page} onPage={setPage} />
    </TabCard>
  );
}
