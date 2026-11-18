import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { countsQuery } from "../admin.queries";
import { Chip } from "./admin-ui";

const tabClass =
  "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground/70 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 hover:text-muted-foreground";

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
    <div className="flex h-full flex-col">
      <nav aria-label="Admin" className="flex shrink-0 overflow-x-auto border-b px-2">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={tabClass}
            activeProps={{ className: "text-foreground! after:bg-brand" }}
          >
            {t.label}
            {"n" in t && <Chip on={"hot" in t && t.hot}>{t.n}</Chip>}
            {"stale" in t && t.stale > 0 && (
              <span role="img" aria-label={`${t.stale} stale`} className="size-1.5 rounded-full bg-destructive" />
            )}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[110rem] flex-col gap-5 px-4 pt-5 pb-8 md:px-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
