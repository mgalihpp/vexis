import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

// Bots write files on their own schedule; re-running the active loaders is
// the whole live-update mechanism.
export function useLiveRefresh(intervalMs: number) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.invalidate();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
}
