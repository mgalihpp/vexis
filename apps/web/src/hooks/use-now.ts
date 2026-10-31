import { useEffect, useState } from "react";

/** A clock that renders `initial` on the server and the first client pass, then ticks every second. */
export function useNow(initial: number) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
