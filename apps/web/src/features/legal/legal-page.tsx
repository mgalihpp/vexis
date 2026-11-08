import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "@/components/icons";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background px-6 py-10 text-foreground md:px-[160px]">
      <Link to="/" className="flex w-fit items-center gap-2.5 font-brand text-lg font-bold tracking-[0.12em] uppercase">
        <Logo height={22} />
        Vexis
      </Link>
      <article className="mt-12 flex max-w-xl flex-col gap-4 text-sm/relaxed text-muted-foreground [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
        <h1 className="text-[44px] leading-none font-bold text-foreground">{title}</h1>
        <p className="text-xs">Last updated {updated}</p>
        {children}
      </article>
    </div>
  );
}
