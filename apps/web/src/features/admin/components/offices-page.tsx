import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MAX_VEXIS_DAILY_USD, OFFICE_FILTERS, STOP_PHRASE } from "@vexis/shared/admin";
import { DollarSignIcon, MoreHorizontalIcon, PlayIcon, PlusIcon, PowerIcon } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { officeStatus, presetLabel, usd } from "../admin";
import { disableOfficeFn, enableOfficeFn, resumeAllFn, setOfficeCapFn, stopAllFn } from "../admin.functions";
import { officesQuery } from "../admin.queries";
import type { OfficeSearch } from "../admin.search";
import {
  Chip,
  ConfirmDialog,
  Count,
  EmptyRow,
  LabeledField,
  MENU_TRIGGER,
  Meter,
  Page,
  Pill,
  SearchBox,
  Stat,
  StatGrid,
  TabCard,
  useAdminAction,
  Who,
} from "./admin-ui";

const TAB_LABEL = { all: "All offices", live: "Live", paused: "Paused" } as const;

export function OfficesPage({ search }: { search: OfficeSearch }) {
  const navigate = useNavigate({ from: "/admin/office" });
  const { data } = useSuspenseQuery(officesQuery({ filter: search.filter, q: search.q || undefined }));
  const [enabling, setEnabling] = useState(false);
  const [stopping, setStopping] = useState(false);
  const o = data.overview;
  const go = (next: Partial<OfficeSearch>) => navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  const counts = { all: o.offices, live: o.live, paused: o.paused };
  const stop = useAdminAction(
    () => stopAllFn(),
    (r) => {
      setStopping(false);
      toast.success(
        `Stopped ${r.offices} office${r.offices === 1 ? "" : "s"}, rejected ${r.proposals} proposal${r.proposals === 1 ? "" : "s"}`,
      );
    },
  );
  const resume = useAdminAction(
    () => resumeAllFn(),
    (r) => toast.success(`Resumed ${r.resumed} office${r.resumed === 1 ? "" : "s"}`),
  );
  const state = o.adminStopped === 0 ? "Running" : o.adminStopped === o.offices ? "Stopped" : "Partly stopped";

  return (
    <Page
      title="Office"
      action={
        <Button
          size="sm"
          className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          onClick={() => setEnabling(true)}
        >
          <PlusIcon /> Enable office
        </Button>
      }
    >
      <StatGrid>
        <Stat label="Offices" value={o.offices}>
          <span className="flex gap-2 text-[0.7rem] tabular-nums">
            <span className="text-brand">{o.live} live</span>
            <span className="text-muted-foreground">{o.offices - o.live}</span>
          </span>
        </Stat>
        <Stat
          label="Proposals today"
          value={o.proposalsToday}
          chip={o.waiting > 0 && <Chip on>{o.waiting} waiting</Chip>}
        />
        <Stat label="Vexis LLM" value={usd(o.vexisSpend)}>
          <div className="w-24 pb-0.5">
            <Meter used={o.vexisSpend} total={o.vexisCap} className="bg-foreground" />
            <div className="mt-1 text-[0.65rem] text-muted-foreground tabular-nums">{usd(o.vexisCap)} cap</div>
          </div>
        </Stat>
        <Stat label="Kill switch" value={state} tone={o.adminStopped === 0 ? "text-profit" : "text-destructive"}>
          {o.adminStopped > 0 && (
            <Button variant="outline" size="sm" disabled={resume.isPending} onClick={() => resume.mutate(undefined)}>
              {resume.isPending ? <Spinner /> : <PlayIcon />} Resume all
            </Button>
          )}
          {o.adminStopped < o.offices && (
            <Button variant="destructive" size="sm" onClick={() => setStopping(true)}>
              <PowerIcon /> Stop all
            </Button>
          )}
        </Stat>
      </StatGrid>

      <TabCard
        label="Offices"
        tabs={OFFICE_FILTERS.map((id) => ({ id, label: TAB_LABEL[id], count: counts[id] }))}
        active={search.filter}
        onChange={(filter) => go({ filter })}
        tools={<SearchBox value={search.q} onChange={(q) => go({ q })} placeholder="Search offices" />}
      >
        <Table className="min-w-[56rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 pl-4">Owner</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Pool filter</TableHead>
              <TableHead>Keys</TableHead>
              <TableHead className="w-56">LLM today</TableHead>
              <TableHead className="text-center">Open</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {data.rows.length === 0 && <EmptyRow cols={8}>No offices match.</EmptyRow>}
            {data.rows.map((r) => (
              <OfficeRow key={r.userId} office={r} />
            ))}
          </TableBody>
        </Table>
      </TabCard>

      <EnableOffice open={enabling} onOpenChange={setEnabling} />
      <ConfirmDialog
        open={stopping}
        onOpenChange={setStopping}
        title="Stop all offices?"
        description={`Every office pauses and every proposal that has not executed is rejected. Only an admin can lift it (${o.offices} office${o.offices === 1 ? "" : "s"}, ${o.waiting} waiting).`}
        action="Stop all"
        requireText={STOP_PHRASE}
        pending={stop.isPending}
        onConfirm={() => stop.mutate(undefined)}
      />
    </Page>
  );
}

type Office = {
  userId: string;
  email: string;
  since: Date;
  live: boolean;
  paused: boolean;
  pausedReason: string | null;
  poolPreset: string;
  keySource: string;
  spend: number;
  cap: number;
  open: number;
};

function OfficeRow({ office: r }: { office: Office }) {
  const [capping, setCapping] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const status = officeStatus(r);
  const over = r.cap > 0 && r.spend >= r.cap;
  const disable = useAdminAction(
    () => disableOfficeFn({ data: { userId: r.userId } }),
    (result) => {
      setDisabling(false);
      if (result === "ok") toast.success("Office disabled");
      else if (result === "positions-open") toast.error("It holds real open positions. Close them first.");
      else toast.error("Office not found");
    },
  );
  return (
    <TableRow>
      <TableCell className="pl-4">
        <Who
          title={r.email}
          sub={`Since ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(r.since)}`}
        />
      </TableCell>
      <TableCell>{r.live ? <Pill tone="brand">Live</Pill> : <Pill tone="muted">Preview</Pill>}</TableCell>
      <TableCell className="font-medium">{presetLabel(r.poolPreset)}</TableCell>
      <TableCell className="text-muted-foreground">{r.keySource === "vexis" ? "Vexis" : "Own"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Meter used={r.spend} total={r.cap} className={over ? "bg-destructive" : "bg-brand"} />
          <span className="w-20 shrink-0 text-right">
            {usd(r.spend)}
            <span className="text-muted-foreground">/{r.cap.toFixed(2)}</span>
          </span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Count n={r.open} />
      </TableCell>
      <TableCell>
        <Pill tone={status.tone}>{status.label}</Pill>
      </TableCell>
      <TableCell className="pr-4 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Office actions" className={MENU_TRIGGER}>
            {disable.isPending ? <Spinner className="size-3.25" /> : <MoreHorizontalIcon className="size-3.25" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={r.keySource !== "vexis"} onSelect={() => setCapping(true)}>
              <DollarSignIcon className="size-3.5" /> Daily cap
              <span className="ml-auto text-muted-foreground">{r.keySource === "vexis" ? usd(r.cap) : "own key"}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDisabling(true)}>
              <PowerIcon className="size-3.5" /> Disable
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CapDialog open={capping} onOpenChange={setCapping} userId={r.userId} email={r.email} current={r.cap} />
        <ConfirmDialog
          open={disabling}
          onOpenChange={setDisabling}
          title={`Disable ${r.email}'s office?`}
          description="Its settings, wallet link and guardrails are deleted. History stays. It is refused while a real position is open."
          action="Disable"
          pending={disable.isPending}
          onConfirm={() => disable.mutate(undefined)}
        />
      </TableCell>
    </TableRow>
  );
}

const parseUsd = (s: string) => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= MAX_VEXIS_DAILY_USD ? n : null;
};

function CapDialog({
  open,
  onOpenChange,
  userId,
  email,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  email: string;
  current: number;
}) {
  const [value, setValue] = useState(String(current));
  const cap = parseUsd(value);
  const save = useAdminAction(
    () => setOfficeCapFn({ data: { userId, vexisDailyUsd: cap ?? 0 } }),
    (result) => {
      onOpenChange(false);
      if (result === "ok") toast.success("Cap saved");
      else toast.error("Office not found");
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (cap !== null) save.mutate(undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>Daily cap</DialogTitle>
            <DialogDescription>What Vexis pays for {email}'s LLM calls each UTC day. 0 allows none.</DialogDescription>
          </DialogHeader>
          <LabeledField label="USD per day">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={cap === null}
              />
            )}
          </LabeledField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={cap === null || save.isPending}>
              {save.isPending && <Spinner />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EnableOffice({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [value, setValue] = useState("0.5");
  const cap = parseUsd(value);
  const valid = email.includes("@") && cap !== null;
  const enable = useAdminAction(
    () => enableOfficeFn({ data: { email: email.trim(), vexisDailyUsd: cap ?? 0 } }),
    (result) => {
      if (result === "ok") {
        toast.success("Office enabled");
        setEmail("");
        onOpenChange(false);
      } else toast.error("No user with that email");
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) enable.mutate(undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>Enable office</DialogTitle>
            <DialogDescription>
              Turns the office on for an existing user, in Preview. For an office that exists it sets the cap.
            </DialogDescription>
          </DialogHeader>
          <LabeledField label="User email">
            {(id) => (
              <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
            )}
          </LabeledField>
          <LabeledField label="Vexis LLM cap, USD per day">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={cap === null}
              />
            )}
          </LabeledField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || enable.isPending}>
              {enable.isPending && <Spinner />} Enable
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
