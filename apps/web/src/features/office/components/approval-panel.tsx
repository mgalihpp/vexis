import { useQuery } from "@tanstack/react-query";
import { BotIcon, CheckIcon, InboxIcon, OctagonPauseIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "@/features/agents/components/agent-ui";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { shortAddr } from "@/lib/format";
import { trpc } from "@/trpc/client";
import {
  AGENT_INFO,
  autopilotDecisions,
  countdown,
  KIND_LABEL,
  type OfficeView,
  type ProposalView,
  proposalFacts,
  waitingProposals,
} from "../office";
import { Meter, PanelEmpty, Section, sol, usd, useOfficeMutation } from "./office-ui";

const TODAY: { status: "approved" | "rejected" | "expired" | "failed" | "done"; label: string }[] = [
  { status: "approved", label: "approved" },
  { status: "done", label: "done" },
  { status: "rejected", label: "rejected" },
  { status: "expired", label: "expired" },
  { status: "failed", label: "failed" },
];

/** Proposals waiting for the owner, the one expiring first on top, each with a live countdown. */
export function ApprovalPanel({ view, now, stopped }: { view: OfficeView; now: number; stopped: boolean }) {
  const waiting = waitingProposals(view.proposals, now);
  const { data: prices } = useQuery(pricesQuery);
  const limit = view.config.guardrails.autopilotMaxSol;
  if (waiting.length === 0)
    return (
      <>
        <div className="rounded-lg bg-card p-3.25">
          <PanelEmpty
            icon={stopped ? <OctagonPauseIcon /> : <InboxIcon />}
            title={stopped ? "Office stopped" : "Nothing to approve"}
            hint={
              stopped
                ? undefined
                : view.config.mode === "autopilot"
                  ? `Autopilot approves proposals up to ${sol(limit)} (${usd(prices?.sol ? limit * prices.sol : null)}); larger ones land here.`
                  : "New proposals land here."
            }
          />
        </div>
        <Section title="Today (UTC)">
          <dl className="m-0 grid grid-cols-5 gap-1">
            {TODAY.map((t) => (
              <div key={t.status} className="flex flex-col-reverse items-center gap-0.5">
                <dt className="text-[0.625rem] text-muted-foreground capitalize">{t.label}</dt>
                <dd className="m-0 text-sm font-medium tabular-nums">{view.today[t.status] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <AutopilotList view={view} />
      </>
    );
  return (
    <div className="flex flex-col gap-3">
      {waiting.map((p) => (
        <ProposalCard key={p.id} proposal={p} now={now} stopped={stopped} />
      ))}
      <AutopilotList view={view} />
    </div>
  );
}

/** What autopilot approved on the owner's behalf; those proposals never wait in the list above. */
function AutopilotList({ view }: { view: OfficeView }) {
  const decided = autopilotDecisions(view.proposals);
  if (decided.length === 0) return null;
  return (
    <Section title="Approved by autopilot">
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {decided.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-xs">
            <BotIcon aria-hidden className="size-3.5 shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate">
              {KIND_LABEL[p.kind]} {p.poolName ?? shortAddr(p.poolAddress)}
            </span>
            <span className="text-[0.6875rem] text-muted-foreground">{STATUS_TEXT[p.status] ?? p.status}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const STATUS_TEXT: Partial<Record<ProposalView["status"], string>> = {
  approved: "waiting for the Executor",
  executing: "executing",
  done: "done",
  failed: "failed",
  rejected: "stopped",
};

function ProposalCard({ proposal: p, now, stopped }: { proposal: ProposalView; now: number; stopped: boolean }) {
  const decide = useOfficeMutation(trpc.office.decide.mutate);
  const left = countdown(p, now);
  const checks = p.risk?.checks ?? null;
  const passed = checks?.filter((c) => c.ok).length ?? 0;
  const pool = p.poolName ?? shortAddr(p.poolAddress);
  const busy = decide.isPending;
  const choose = (decision: "approve" | "reject") => decide.mutate({ proposalId: p.id, decision });

  return (
    <section
      aria-label={`Proposal: ${KIND_LABEL[p.kind]} ${pool}`}
      className="flex flex-col gap-2.5 rounded-lg bg-card p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.625rem] tracking-[0.08em] text-brand">
          Proposed by {p.proposedBy === "owner" ? "you" : AGENT_INFO[p.proposedBy].name}
        </span>
        <span className={`font-medium tabular-nums ${left.expired ? "text-loss" : "text-amber-500"}`}>
          {left.expired ? "Expired" : left.text}
          {!left.expired && <span className="sr-only"> left to decide</span>}
        </span>
      </div>
      <h2 className="text-sm font-semibold">
        {KIND_LABEL[p.kind]} {pool}
      </h2>
      <Meter share={left.share} className="bg-amber-500" />
      <dl className="m-0 grid grid-cols-2 gap-1.5">
        {proposalFacts(p).map((f) => (
          <div key={f.label} className="min-w-0 rounded-md border bg-background/90 px-2 py-1.5">
            <dt className="text-[0.6875rem] text-muted-foreground">{f.label}</dt>
            <dd className="m-0 font-mono text-xs font-medium [overflow-wrap:anywhere]">
              {f.value}
              {f.sub && <small className="ml-1 font-normal text-muted-foreground">{f.sub}</small>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs">{p.rationale}</p>
      {p.summary && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Manager: </span>
          {p.summary}
        </p>
      )}
      <p className="text-xs font-medium text-muted-foreground">
        {checks ? `Guardrails · ${passed} of ${checks.length} passed` : "Guardrails · not recorded"}
      </p>
      {checks && checks.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {checks.map((c) => (
            <li key={c.rule} className="flex items-center gap-2 text-xs">
              {c.ok ? (
                <CheckIcon aria-label="Passed" className="size-3.5 shrink-0 text-profit" />
              ) : (
                <XIcon aria-label="Failed" className="size-3.5 shrink-0 text-loss" />
              )}
              <span className="min-w-0 flex-1">{c.rule}</span>
              <span className="font-mono text-[0.6875rem] text-muted-foreground">{c.value}</span>
            </li>
          ))}
        </ul>
      )}
      {p.risk?.llm && (
        <p className="text-xs text-muted-foreground">
          <span className={`font-medium ${p.risk.llm.veto ? "text-loss" : "text-foreground"}`}>
            Risk Manager{p.risk.llm.veto ? " (veto)" : ""}:{" "}
          </span>
          {p.risk.llm.note}
        </p>
      )}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Button variant="outline" disabled={busy} onClick={() => choose("reject")}>
          Reject
        </Button>
        <Button
          disabled={busy || left.expired || stopped}
          onClick={() => choose("approve")}
          className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
        >
          {busy && <Spinner />}
          {left.expired ? "Expired" : "Approve"}
        </Button>
      </div>
      <FormError error={decide.error} />
    </section>
  );
}
