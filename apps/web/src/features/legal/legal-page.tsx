import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "@/components/icons";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background px-6 py-10 text-foreground md:px-[160px]">
      <Link
        to="/login"
        className="flex w-fit items-center gap-2.5 font-brand text-lg font-bold tracking-[0.12em] uppercase"
      >
        <Logo height={22} />
        Vexis
      </Link>
      <article className="mt-12 flex max-w-xl flex-col gap-4 text-sm/relaxed text-muted-foreground">
        <h1 className="text-[44px] leading-none font-bold text-foreground">{title}</h1>
        {children}
      </article>
    </div>
  );
}
