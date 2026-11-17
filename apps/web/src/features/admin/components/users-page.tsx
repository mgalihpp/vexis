import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { USER_FILTERS } from "@vexis/shared/admin";
import { CopyIcon, MoreHorizontalIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateUtc } from "../admin";
import { changeRoleFn } from "../admin.functions";
import { usersQuery } from "../admin.queries";
import type { UserSearch } from "../admin.search";
import {
  Chip,
  ConfirmDialog,
  Count,
  copy,
  EmptyRow,
  MENU_TRIGGER,
  Meter,
  Page,
  Pager,
  Pill,
  SearchBox,
  Stat,
  StatGrid,
  TabCard,
  useAdminAction,
  Who,
} from "./admin-ui";

const TAB_LABEL = { all: "All users", admins: "Admins", office: "With office" } as const;

const REFUSAL = {
  self: "You can't change your own role.",
  "last-admin": "That is the last admin. Promote someone else first.",
  unchanged: "Nothing to change.",
  "not-found": "User not found.",
} as const;

export function UsersPage({ search }: { search: UserSearch }) {
  const navigate = useNavigate({ from: "/admin/users" });
  const { data } = useSuspenseQuery(usersQuery({ filter: search.filter, q: search.q || undefined, page: search.page }));
  const o = data.overview;
  const go = (next: Partial<UserSearch>) => navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  const counts = { all: o.total, admins: o.admins, office: o.withOffice };
  const officePct = o.total === 0 ? 0 : Math.round((o.withOffice / o.total) * 100);

  return (
    <Page title="Users">
      <StatGrid>
        <Stat label="Users" value={o.total} chip={o.new7d > 0 && <Chip>+{o.new7d} 7d</Chip>} />
        <Stat label="With office" value={`${officePct}%`}>
          <span className="flex gap-2 text-[0.7rem] tabular-nums">
            <span className="text-brand">{o.withOffice}</span>
            <span className="text-muted-foreground">{o.total - o.withOffice}</span>
          </span>
        </Stat>
        <Stat label="Active 7d" value={o.active7d}>
          <div className="w-24 pb-0.5">
            <Meter used={o.active7d} total={o.total} />
            <div className="mt-1 text-[0.65rem] text-muted-foreground tabular-nums">{o.total - o.active7d} idle</div>
          </div>
        </Stat>
        <Stat label="Admins" value={o.admins} />
      </StatGrid>

      <TabCard
        label="Users"
        tabs={USER_FILTERS.map((id) => ({ id, label: TAB_LABEL[id], count: counts[id] }))}
        active={search.filter}
        onChange={(filter) => go({ filter, page: 1 })}
        tools={<SearchBox value={search.q} onChange={(q) => go({ q, page: 1 })} placeholder="Search users" />}
      >
        <Table className="min-w-[48rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 pl-4">User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-center">Wallets</TableHead>
              <TableHead className="text-center">Agents</TableHead>
              <TableHead>Office</TableHead>
              <TableHead className="pr-4 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {data.rows.length === 0 && <EmptyRow cols={7}>No users match.</EmptyRow>}
            {data.rows.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </TableBody>
        </Table>
        <Pager total={data.total} page={search.page} onPage={(page) => go({ page })} />
      </TabCard>
    </Page>
  );
}

type User = {
  id: string;
  email: string;
  role: "admin" | "member";
  createdAt: Date;
  wallets: number;
  agents: number;
  office: "live" | "preview" | "paused" | null;
  self: boolean;
};

function UserRow({ user: u }: { user: User }) {
  const [confirming, setConfirming] = useState(false);
  const to = u.role === "admin" ? "member" : "admin";
  const change = useAdminAction(
    () => changeRoleFn({ data: { userId: u.id, role: to } }),
    (result) => {
      setConfirming(false);
      if (result === "ok") toast.success(to === "admin" ? "Now an admin" : "Admin removed");
      else toast.error(REFUSAL[result]);
    },
  );
  return (
    <TableRow>
      <TableCell className="pl-4">
        <Who title={u.email} sub={u.self ? "You" : undefined} />
      </TableCell>
      <TableCell>
        {u.role === "admin" ? (
          <Pill tone="brand">
            <ShieldCheckIcon className="size-3" /> Admin
          </Pill>
        ) : (
          <span className="text-muted-foreground">User</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{dateUtc(u.createdAt.getTime())}</TableCell>
      <TableCell className="text-center">
        <Count n={u.wallets} />
      </TableCell>
      <TableCell className="text-center">
        <Count n={u.agents} />
      </TableCell>
      <TableCell>
        {u.office === null ? (
          <span className="text-muted-foreground">—</span>
        ) : u.office === "live" ? (
          <Pill tone="profit">Live</Pill>
        ) : u.office === "paused" ? (
          <Pill tone="danger">Paused</Pill>
        ) : (
          <Pill tone="muted">Preview</Pill>
        )}
      </TableCell>
      <TableCell className="pr-4 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="User actions" className={MENU_TRIGGER}>
            {change.isPending ? <Spinner className="size-3.25" /> : <MoreHorizontalIcon className="size-3.25" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={u.self} onSelect={() => setConfirming(true)}>
              {u.role === "admin" ? <ShieldOffIcon className="size-3.5" /> : <ShieldCheckIcon className="size-3.5" />}
              {u.role === "admin" ? "Remove admin" : "Make admin"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => copy(u.id)}>
              <CopyIcon className="size-3.5" /> Copy ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={to === "admin" ? `Make ${u.email} an admin?` : `Remove admin from ${u.email}?`}
          description={
            to === "admin"
              ? "They can create and revoke invites, stop every office and change other users' roles."
              : "They lose the admin page at once. Their account and data stay."
          }
          action={to === "admin" ? "Make admin" : "Remove admin"}
          pending={change.isPending}
          onConfirm={() => change.mutate(undefined)}
        />
      </TableCell>
    </TableRow>
  );
}
