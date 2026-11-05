import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function AgentIllustration() {
  return (
    <svg viewBox="0 0 220 150" className="w-52 text-foreground" fill="none" aria-hidden="true">
      <title>Agent</title>
      <ellipse cx="110" cy="140" rx="52" ry="6" fill="currentColor" fillOpacity="0.1" />
      <path
        d="M78 26a36 36 0 0 1 0-14M142 12a36 36 0 0 1 0 14"
        className="stroke-brand"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M92 14a26 26 0 0 0 0 10M128 14a26 26 0 0 1 0 10"
        className="stroke-brand"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M110 40V26" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="110" cy="19" r="7" className="fill-brand" />

      <rect x="50" y="62" width="10" height="24" rx="5" fill="currentColor" fillOpacity="0.2" />
      <rect x="160" y="62" width="10" height="24" rx="5" fill="currentColor" fillOpacity="0.2" />
      <rect
        x="60"
        y="40"
        width="100"
        height="64"
        rx="24"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      <rect
        x="71"
        y="51"
        width="78"
        height="42"
        rx="16"
        className="fill-background"
        stroke="currentColor"
        strokeOpacity="0.15"
      />
      <rect x="88" y="62" width="10" height="16" rx="5" className="fill-brand" />
      <rect x="122" y="62" width="10" height="16" rx="5" className="fill-brand" />
      <path d="M102 84.5q8 5 16 0" className="stroke-brand" strokeWidth="2.5" strokeLinecap="round" />

      <rect
        x="82"
        y="108"
        width="56"
        height="28"
        rx="12"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      <rect x="95" y="122" width="7" height="8" rx="2" fill="currentColor" fillOpacity="0.3" />
      <rect x="106.5" y="116" width="7" height="14" rx="2" className="fill-brand" />
      <rect x="118" y="120" width="7" height="10" rx="2" fill="currentColor" fillOpacity="0.3" />
      <rect x="66" y="112" width="12" height="20" rx="6" fill="currentColor" fillOpacity="0.2" />
      <rect x="142" y="112" width="12" height="20" rx="6" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

export function EmptyAgents() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 py-4 md:px-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[1.375rem] leading-none font-semibold tracking-tight">Agents</h1>
        <Button asChild size="sm" className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90">
          <Link to="/agents/new" search={{ step: "agent" }}>
            <PlusIcon /> New agent
          </Link>
        </Button>
      </header>

      <section className="flex min-h-[24rem] flex-col items-center justify-center gap-4 rounded-xl border border-dashed text-center">
        <AgentIllustration />
        <h2 className="text-[1.0625rem] font-semibold tracking-tight">No agents running yet</h2>
        <Button asChild className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90">
          <Link to="/agents/new" search={{ step: "agent" }}>
            <PlusIcon /> Create your first agent
          </Link>
        </Button>
      </section>
    </div>
  );
}
