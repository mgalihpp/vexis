import type { ReactNode } from "react";

/** A slim line above a tab's content, for partial or failed background loads. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 rounded-md border border-brand/30 bg-brand/10 px-2.5 py-1.5 text-xs text-foreground/80">
      {children}
    </p>
  );
}
