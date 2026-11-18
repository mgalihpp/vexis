import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { INVITE_FILTERS, type InviteStatus } from "@vexis/shared/admin";
import {
  BanIcon,
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  CopyIcon,
  InboxIcon,
  MailCheckIcon,
  MailIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/features/portfolio/money";
import { createInviteFn, extendInviteFn, revokeInviteFn, sendRequestFn } from "../admin.functions";
import { invitesQuery } from "../admin.queries";
import type { InviteSearch } from "../admin.search";
import {
  Chip,
  ConfirmDialog,
  CopyButton,
  copy,
  EmptyRow,
  LabeledField,
  MENU_TRIGGER,
  Meter,
  Page,
  Pager,
  Pill,
  relative,
  SearchBox,
  Stat,
  StatGrid,
  TabCard,
  useAdminAction,
  Who,
} from "./admin-ui";

const STATUS: Record<InviteStatus, { label: string; tone: "brand" | "muted" | "warning" | "danger" }> = {
  active: { label: "Active", tone: "brand" },
  redeemed: { label: "Redeemed", tone: "muted" },
  expired: { label: "Expired", tone: "warning" },
  revoked: { label: "Revoked", tone: "danger" },
};

const TAB_LABEL = { all: "All", active: "Active", redeemed: "Redeemed", expired: "Expired" } as const;

export function InvitesPage({ search }: { search: InviteSearch }) {
  const navigate = useNavigate({ from: "/admin/invites" });
  const params = { filter: search.filter, q: search.q || undefined, page: search.page };
  const { data } = useSuspenseQuery(invitesQuery(params));
  const [creating, setCreating] = useState(false);
  const [ready, setReady] = useState<CreatedInvite | null>(null);
  const o = data.overview;
  const settled = o.redeemed + o.lost;
  const go = (next: Partial<InviteSearch>) => navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  const counts = { all: o.all, active: o.active, redeemed: o.redeemedAll, expired: o.expired };

  return (
    <Page
      title="Invites"
      action={
        <Button
          size="sm"
          className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          onClick={() => setCreating(true)}
        >
          <PlusIcon /> New invite
        </Button>
      }
    >
      <StatGrid>
        <Stat
          label="Requests"
          value={o.requestsPending}
          chip={o.requests24h > 0 && <Chip>+{o.requests24h} 24h</Chip>}
        />
        <Stat label="Redemption" value={settled === 0 ? "—" : `${Math.round((o.redeemed / settled) * 100)}%`}>
          <span className="flex gap-2 text-[0.7rem] tabular-nums">
            <span className="text-profit">{o.redeemed}</span>
            <span className="text-loss">{o.lost}</span>
          </span>
        </Stat>
        <Stat label="Active" value={o.active}>
          <div className="w-24 pb-0.5">
            <Meter used={o.seatsUsed} total={o.seats} />
            <div className="mt-1 text-[0.65rem] text-muted-foreground tabular-nums">
              {o.seatsUsed} used / {o.seats} seats
            </div>
          </div>
        </Stat>
        <Stat label="Expiring 48h" value={o.expiring} tone={o.expiring > 0 ? "text-destructive" : ""} />
      </StatGrid>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <RequestsCard requests={data.requests} now={data.now} />

        <TabCard
          label="Invites"
          tabs={INVITE_FILTERS.map((id) => ({ id, label: TAB_LABEL[id], count: counts[id] }))}
          active={search.filter}
          onChange={(filter) => go({ filter, page: 1 })}
          tools={<SearchBox value={search.q} onChange={(q) => go({ q, page: 1 })} placeholder="Search invites" />}
        >
          <Table className="min-w-[40rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 pl-4">Invite</TableHead>
                <TableHead className="text-center">Uses</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {data.rows.length === 0 && <EmptyRow cols={5}>No invites match.</EmptyRow>}
              {data.rows.map((i) => (
                <InviteRow key={i.id} invite={i} now={data.now} />
              ))}
            </TableBody>
          </Table>
          <Pager total={data.total} page={search.page} onPage={(page) => go({ page })} />
        </TabCard>
      </div>

      <NewInvite
        open={creating}
        onOpenChange={setCreating}
        onCreated={(invite) => {
          setCreating(false);
          setReady(invite);
        }}
      />
      <Dialog open={ready !== null} onOpenChange={(open) => !open && setReady(null)}>
        {ready && <InviteReady invite={ready} onDone={() => setReady(null)} />}
      </Dialog>
    </Page>
  );
}

const REQUEST_TABS = ["all", "pending", "sent"] as const;
const REQUEST_TAB_LABEL = { all: "All", pending: "Pending", sent: "Sent" } as const;

function RequestsCard({
  requests,
  now,
}: {
  requests: { email: string; createdAt: Date; invitedAt: Date | null }[];
  now: number;
}) {
  const [tab, setTab] = useState<(typeof REQUEST_TABS)[number]>("all");
  const send = useAdminAction(
    (email: string) => sendRequestFn({ data: { email } }),
    (result) => {
      if (result.ok) toast.success("Invite sent");
      else toast.error(SEND_ERROR[result.error]);
    },
  );
  const pending = requests.filter((r) => r.invitedAt === null).length;
  const sent = requests.length - pending;
  const counts = { all: requests.length, pending, sent };
  const shown = requests.filter((r) =>
    tab === "all" ? true : tab === "pending" ? r.invitedAt === null : r.invitedAt !== null,
  );

  return (
    <TabCard
      label="Requests"
      tabs={REQUEST_TABS.map((id) => ({ id, label: REQUEST_TAB_LABEL[id], count: counts[id] }))}
      active={tab}
      onChange={setTab}
    >
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-xs text-muted-foreground">
          <span className="flex size-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <InboxIcon className="size-4" />
          </span>
          <span>{tab === "pending" ? "No pending requests." : "No invite requests."}</span>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((r) => {
            const busy = send.isPending && send.variables === r.email;
            return (
              <li
                key={r.email}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/25"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${
                      r.invitedAt
                        ? "border-profit/20 bg-profit/10 text-profit"
                        : "border-brand/25 bg-brand/10 text-brand"
                    }`}
                  >
                    {r.invitedAt ? <MailCheckIcon className="size-4" /> : <MailIcon className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium sm:text-sm">{r.email}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                      <span>Asked {timeAgo(r.createdAt.getTime(), now)}</span>
                      {r.invitedAt && <span>· Sent {timeAgo(r.invitedAt.getTime(), now)}</span>}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {r.invitedAt ? (
                    <Pill tone="profit">Sent</Pill>
                  ) : (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => send.mutate(r.email)}>
                      {busy ? <Spinner /> : <SendIcon />}
                      {busy ? "Sending" : "Send"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </TabCard>
  );
}

const SEND_ERROR = {
  "rate-limited": "Too many invites. Try again later.",
  answered: "That request was already answered.",
  mail: "The email could not be sent. The request is open again.",
} as const;

type Invite = {
  id: string;
  email: string | null;
  note: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: Date;
  status: InviteStatus;
};

function InviteRow({ invite: i, now }: { invite: Invite; now: number }) {
  const [revoking, setRevoking] = useState(false);
  const revoke = useAdminAction(
    () => revokeInviteFn({ data: { id: i.id } }),
    (result) => {
      setRevoking(false);
      if (result === "ok") toast.success("Invite revoked");
      else toast.error("That invite can no longer be revoked");
    },
  );
  const extend = useAdminAction(
    () => extendInviteFn({ data: { id: i.id } }),
    (result) => (result.expiresAt ? toast.success("Extended by 7 days") : toast.error("That invite can't be extended")),
  );
  const live = i.status === "active" || i.status === "expired";
  const status = STATUS[i.status];
  return (
    <TableRow>
      <TableCell className="pl-4">
        <Who title={i.email ?? "Open link"} sub={i.note ?? "—"} />
      </TableCell>
      <TableCell className="text-center">
        <span className="inline-flex h-6 min-w-9 items-center justify-center rounded-md bg-muted px-1.5 font-medium">
          {i.useCount}/{i.maxUses}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{live ? relative(i.expiresAt.getTime(), now) : "—"}</TableCell>
      <TableCell>
        <Pill tone={status.tone}>{status.label}</Pill>
      </TableCell>
      <TableCell className="pr-4 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Invite actions" className={MENU_TRIGGER} disabled={i.status === "revoked"}>
            {extend.isPending ? <Spinner className="size-3.25" /> : <MoreHorizontalIcon className="size-3.25" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => copy(i.id)}>
              <CopyIcon className="size-3.5" /> Copy ID
            </DropdownMenuItem>
            {live && (
              <DropdownMenuItem onSelect={() => extend.mutate(undefined)}>
                <ClockIcon className="size-3.5" /> Extend 7d
              </DropdownMenuItem>
            )}
            {live && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setRevoking(true)}>
                  <BanIcon className="size-3.5" /> Revoke
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmDialog
          open={revoking}
          onOpenChange={setRevoking}
          title="Revoke this invite?"
          description={`${i.email ?? "This open link"} stops working at once. People who already joined with it keep their accounts.`}
          action="Revoke"
          pending={revoke.isPending}
          onConfirm={() => revoke.mutate(undefined)}
        />
      </TableCell>
    </TableRow>
  );
}

const DAYS = [1, 3, 7, 14, 30, 90] as const;

type CreatedInvite = { link: string; emailed: boolean; sendFailed: boolean; days: number; uses: number };

function NewInvite({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invite: CreatedInvite) => void;
}) {
  const [email, setEmail] = useState("");
  const [days, setDays] = useState<number>(7);
  const [uses, setUses] = useState("1");
  const [note, setNote] = useState("");
  const [send, setSend] = useState(false);
  const create = useAdminAction(
    () =>
      createInviteFn({
        data: {
          email: email.trim() || undefined,
          days,
          uses: Number(uses),
          note: note.trim() || undefined,
          send: send && email.trim() !== "",
        },
      }),
    (result) => {
      if (!result.ok) return toast.error("Too many invites. Try again later.");
      setEmail("");
      setNote("");
      setSend(false);
      onCreated(result);
    },
  );
  const usesN = Number(uses);
  const valid = Number.isInteger(usesN) && usesN >= 1 && usesN <= 100 && (email.trim() === "" || email.includes("@"));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate(undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>New invite</DialogTitle>
            <DialogDescription>The link is shown once, right after you create it.</DialogDescription>
          </DialogHeader>
          <LabeledField label="Email">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
                maxLength={254}
              />
            )}
          </LabeledField>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Expires">
              {(id) => (
                <NativeSelect id={id} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {DAYS.map((d) => (
                    <NativeSelectOption key={d} value={d}>
                      {d === 1 ? "1 day" : `${d} days`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </LabeledField>
            <LabeledField label="Uses">
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={uses}
                  onChange={(e) => setUses(e.target.value)}
                  aria-invalid={!valid}
                />
              )}
            </LabeledField>
          </div>
          <LabeledField label="Note">
            {(id) => (
              <Input
                id={id}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
                maxLength={200}
              />
            )}
          </LabeledField>
          <div className="flex items-center gap-2 text-xs font-medium">
            <Switch
              id="send-by-email"
              checked={send && email.trim() !== ""}
              disabled={email.trim() === ""}
              onCheckedChange={setSend}
            />
            <label htmlFor="send-by-email">Send by email</label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!valid || create.isPending}
              className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
            >
              {create.isPending && <Spinner />}
              {send && email.trim() ? "Create & send" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteReady({ invite, onDone }: { invite: CreatedInvite; onDone: () => void }) {
  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader className="items-center text-center">
        <span className="grid size-12 place-items-center rounded-full bg-profit/15 text-profit">
          <CircleCheckIcon className="size-6" />
        </span>
        <DialogTitle>Invite ready</DialogTitle>
        <DialogDescription>
          {invite.sendFailed
            ? "The email could not be sent. Copy the link and share it yourself."
            : "Copy the link now. It is not shown again."}
        </DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <Input
          readOnly
          value={invite.link}
          aria-label="Join link"
          onFocus={(e) => e.currentTarget.select()}
        />
        <CopyButton text={invite.link} label="Copy link" />
      </div>
      <div className="flex justify-center gap-6 text-muted-foreground">
        {invite.emailed && (
          <span className="flex items-center gap-1">
            <CheckIcon className="size-3.5" /> Emailed
          </span>
        )}
        <span>{invite.days}d</span>
        <span>
          {invite.uses} use{invite.uses === 1 ? "" : "s"}
        </span>
      </div>
      <DialogFooter>
        <Button className="w-full bg-brand font-semibold text-brand-foreground hover:bg-brand/90" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
