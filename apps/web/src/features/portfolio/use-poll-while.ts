import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

const POLL_MS = 2000;

/** Reloads the route's data every 2 s while a background job is filling it in. */
export function usePollWhile(running: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => router.invalidate(), POLL_MS);
    return () => clearInterval(id);
  }, [running, router]);
}
