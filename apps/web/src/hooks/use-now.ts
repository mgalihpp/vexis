import { useEffect, useState } from "react";

/** A clock that renders `initial` on the server and the first client pass, then ticks every second. */
export function useNow(initial: number, enabled = true) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
