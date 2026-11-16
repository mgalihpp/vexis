import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/features/portfolio/money";
import { heartbeatsQuery } from "../admin.queries";

export function HeartbeatPage() {
  const { data } = useSuspenseQuery(heartbeatsQuery);
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="font-medium text-sm">Service heartbeats</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Schedule</TableHead>
            <TableHead>Runtime</TableHead>
            <TableHead>Last tick</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.schedules.map((s) => {
            const late = s.lastTickAt !== null && data.now - s.lastTickAt > s.staleMs;
            return (
              <TableRow key={s.name}>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.runtime}</TableCell>
                <TableCell>{s.lastTickAt === null ? "—" : timeAgo(s.lastTickAt, data.now)}</TableCell>
                <TableCell>
                  {s.lastTickAt === null ? (
                    "—"
                  ) : (
                    <Badge variant={late ? "destructive" : "secondary"}>{late ? "Stale" : "OK"}</Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-96 truncate" title={s.lastError ?? undefined}>
                  {s.lastError === null || s.lastErrorAt === null
                    ? "—"
                    : `${timeAgo(s.lastErrorAt, data.now)}: ${s.lastError}`}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
