import { useSuspenseQuery } from "@tanstack/react-query";
import { FAILURE_VIEWS } from "@vexis/shared/admin";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PoolFilter } from "@/features/portfolio/components/table-controls";
import { timeAgo } from "@/features/portfolio/money";
import { agentPause } from "../admin";
import { agentsQuery } from "../admin.queries";
import { EmptyRow, Page, Pill, Stat, StatGrid, TabCard, Who } from "./admin-ui";

const FAILURE_LABEL = { failed: "Failed", alerts: "Alerts", transactions: "Transactions" } as const;

export function AgentsPage() {
  const { data } = useSuspenseQuery(agentsQuery);
  const o = data.overview;
  const failed = o.alertsFailed + o.txFailed;
  const delivered = o.alerts - o.alertsFailed;
  return (
    <Page title="Agents">
      <StatGrid>
        <Stat label="Volume watch" value={o.volume}>
          {o.screener > 0 && <span className="text-[0.7rem] text-muted-foreground">{o.screener} screener</span>}
        </Stat>
        <Stat label="Auto-rebalance" value={o.rebalance}>
          <span className="flex gap-2 text-[0.7rem] tabular-nums">
            <span className="text-brand">{o.rebalanceLive} live</span>
            <span className="text-muted-foreground">{o.rebalance - o.rebalanceLive}</span>
          </span>
        </Stat>
        <Stat label="Alerts 24h" value={o.alerts}>
          <span className="flex gap-2 text-[0.7rem] tabular-nums">
            <span className="text-profit">{delivered}</span>
            <span className="text-loss">{o.alertsFailed}</span>
          </span>
        </Stat>
        <Stat label="Paused" value={o.paused} tone={o.paused > 0 ? "text-destructive" : ""}>
          <span className="text-[0.7rem] text-muted-foreground tabular-nums">{failed} failed 24h</span>
        </Stat>
      </StatGrid>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <PausedCard paused={data.paused} now={data.now} />
        <FailuresCard failures={data.failures} now={data.now} />
      </div>
    </Page>
  );
}

type Paused = ReturnType<typeof useAgents>["paused"][number];
const useAgents = () => useSuspenseQuery(agentsQuery).data;

function PausedCard({ paused, now }: { paused: Paused[]; now: number }) {
  const [tab, setTab] = useState<"paused" | "attention">("paused");
  const [q, setQ] = useState("");
  const attention = paused.filter((a) => a.reason !== null);
  const rows = (tab === "paused" ? paused : attention).filter(
    (a) => !q.trim() || `${a.name} ${a.email} ${a.detail}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <TabCard
      label="Paused agents"
      tabs={[
        { id: "paused", label: "Paused", count: paused.length },
        { id: "attention", label: "Attention", count: attention.length },
      ]}
      active={tab}
      onChange={setTab}
      tools={<PoolFilter value={q} onChange={setQ} placeholder="Search agents" />}
    >
      <Table className="min-w-[32rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 pl-4">Agent</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="pr-4 text-right">Since</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <EmptyRow cols={4}>Nothing paused.</EmptyRow>}
          {rows.map((a) => {
            const reason = agentPause(a.reason);
            return (
              <TableRow key={a.id}>
                <TableCell className="pl-4">
                  <Who title={a.name} sub={a.detail} />
                </TableCell>
                <TableCell className="max-w-40 truncate text-muted-foreground">{a.email}</TableCell>
                <TableCell>
                  <Pill tone={reason.tone}>{reason.label}</Pill>
                </TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground">
                  {timeAgo(a.since.getTime(), now)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TabCard>
  );
}

type Failure = ReturnType<typeof useAgents>["failures"][number];

function FailuresCard({ failures, now }: { failures: Failure[]; now: number }) {
  const [tab, setTab] = useState<(typeof FAILURE_VIEWS)[number]>("failed");
  const count = (t: typeof tab) =>
    t === "failed"
      ? failures.length
      : failures.filter((f) => f.source === (t === "alerts" ? "alert" : "transaction")).length;
  const rows = failures.filter((f) => tab === "failed" || f.source === (tab === "alerts" ? "alert" : "transaction"));
  return (
    <TabCard
      label="Failed actions"
      tabs={FAILURE_VIEWS.map((id) => ({ id, label: FAILURE_LABEL[id], count: count(id) }))}
      active={tab}
      onChange={setTab}
    >
      <Table className="min-w-[32rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 pl-4">Action</TableHead>
            <TableHead>Error</TableHead>
            <TableHead className="pr-4 text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <EmptyRow cols={3}>No failures in the last 7 days.</EmptyRow>}
          {rows.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="pl-4">
                <Who title={f.name} sub={f.kind} />
              </TableCell>
              <TableCell className="max-w-64 truncate text-muted-foreground" title={f.error}>
                {f.error}
              </TableCell>
              <TableCell className="pr-4 text-right text-muted-foreground">{timeAgo(f.at.getTime(), now)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TabCard>
  );
}
