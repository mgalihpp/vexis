import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { countsQuery } from "../admin.queries";
import { Chip } from "./admin-ui";

export function AdminLayout() {
  const { data } = useSuspenseQuery(countsQuery);
  const tabs = [
    { to: "/admin/invites", label: "Invites", n: data.requests, hot: data.requests > 0 },
    { to: "/admin/users", label: "Users", n: data.users },
    { to: "/admin/office", label: "Office", n: data.offices },
    { to: "/admin/agents", label: "Agents", n: data.pausedAgents, hot: data.pausedAgents > 0 },
    { to: "/admin/system", label: "System", stale: data.stale },
  ] as const;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-5 px-4 pt-6 pb-8 md:px-6">
        <nav aria-label="Admin" className="-mb-2 flex gap-5 overflow-x-auto border-b">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="-mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-brand data-[status=active]:text-foreground"
            >
              {t.label}
              {"n" in t && <Chip on={"hot" in t && t.hot}>{t.n}</Chip>}
              {"stale" in t && t.stale > 0 && (
                <span role="img" aria-label={`${t.stale} stale`} className="size-1.5 rounded-full bg-destructive" />
              )}
            </Link>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
