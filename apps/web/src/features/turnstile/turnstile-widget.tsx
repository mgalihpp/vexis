import { useEffect, useRef } from "react";

interface Turnstile {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      theme: "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let script: Promise<Turnstile> | undefined;

function loadTurnstile() {
  script ??= new Promise<Turnstile>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    el.onerror = () => {
      script = undefined;
      reject(new Error("turnstile failed to load"));
    };
    document.head.append(el);
  });
  return script;
}

/** Cloudflare's checkbox. Reports a fresh token, or null when it expires; bump `resetKey` after a used token. */
export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
}: {
  siteKey: string;
  resetKey: number;
  onToken: (token: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: Turnstile; id: string } | null>(null);
  const report = useRef(onToken);
  report.current = onToken;

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        const id = api.render(box.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => report.current(token),
          "expired-callback": () => report.current(null),
          "error-callback": () => report.current(null),
        });
        widget.current = { api, id };
      })
      .catch((error) => console.error("[turnstile]", error));
    return () => {
      cancelled = true;
      widget.current?.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return;
    widget.current.api.reset(widget.current.id);
    report.current(null);
  }, [resetKey]);

  return <div ref={box} className="min-h-[65px]" />;
}
