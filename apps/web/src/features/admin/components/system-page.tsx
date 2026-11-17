import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/features/portfolio/money";
import { AUDIT_LABEL, stampUtc } from "../admin";
import { auditQuery, systemQuery } from "../admin.queries";
import { EmptyRow, MENU_TRIGGER, Meter, Page, Pager, Pill, Stat, StatGrid, TabCard } from "./admin-ui";

const RUNTIMES = ["all", "runner", "office", "stale"] as const;
const LABEL = { all: "All", runner: "Runner", office: "Office", stale: "Stale" } as const;

export function SystemPage() {
  const { data, refetch, isFetching } = useSuspenseQuery(systemQuery);
  const [tab, setTab] = useState<(typeof RUNTIMES)[number]>("all");
  const ok = data.schedules.filter((s) => !s.stale).length;
  const stale = data.schedules.length - ok;
  const matching = (t: typeof tab) =>
    data.schedules.filter((s) => (t === "all" ? true : t === "stale" ? s.stale : s.runtime === t));
  const rows = matching(tab);
  const d = data.datapi;
  const t = data.tracker;

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
        <Stat label="Datapi budget" value={d ? d.remaining : "—"}>
          {d && (
            <div className="w-28 pb-0.5">
              <Meter used={d.remaining} total={d.limit} />
              <div className="mt-1 text-[0.65rem] text-muted-foreground tabular-nums">
                {Math.max(0, d.remaining - d.reserve)} free · /{d.limit}
              </div>
            </div>
          )}
        </Stat>
        <Stat label="Solana Tracker" value={t.configured ? t.used : "—"}>
          {t.configured && (
            <div className="w-28 pb-0.5">
              <Meter used={t.used} total={t.limit} className="bg-foreground" />
              <div className="mt-1 text-[0.65rem] text-muted-foreground tabular-nums">used today · /{t.limit}</div>
            </div>
          )}
        </Stat>
        <Stat label="Schedules" value={`${ok}/${data.schedules.length}`}>
          <span className="flex gap-2 text-[0.7rem] tabular-nums">
            <span className="text-profit">{ok}</span>
            <span className="text-loss">{stale}</span>
          </span>
        </Stat>
        <Stat label="Stale" value={stale} tone={stale > 0 ? "text-destructive" : "text-profit"} />
      </StatGrid>
      <p className="-mt-3 text-[0.7rem] text-muted-foreground">
        The datapi figure is this web process's last reading of the shared limit; it shows a dash until the web app has
        made a request.
      </p>

      <TabCard
        label="Heartbeats"
        tabs={RUNTIMES.map((id) => ({ id, label: LABEL[id], count: matching(id).length }))}
        active={tab}
        onChange={setTab}
      >
        <Table className="min-w-[44rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 pl-4">Schedule</TableHead>
              <TableHead>Runtime</TableHead>
              <TableHead>Last tick</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4">Last error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <EmptyRow cols={5}>No schedules.</EmptyRow>}
            {rows.map((s) => (
              <TableRow key={s.name}>
                <TableCell className="pl-4 font-mono font-medium">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.runtime}</TableCell>
                <TableCell className={s.stale ? "text-destructive" : ""}>
                  {s.lastTickAt === null ? "—" : timeAgo(s.lastTickAt, data.now)}
                </TableCell>
                <TableCell>
                  {s.lastTickAt === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Pill tone={s.stale ? "danger" : "profit"}>{s.stale ? "Stale" : "OK"}</Pill>
                  )}
                </TableCell>
                <TableCell className="max-w-96 truncate pr-4 text-muted-foreground" title={s.lastError ?? undefined}>
                  {s.lastError === null || s.lastErrorAt === null
                    ? "—"
                    : `${timeAgo(s.lastErrorAt, data.now)} · ${s.lastError}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TabCard>

      <AuditCard />
    </Page>
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
