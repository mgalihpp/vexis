interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { first_name: string } };
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

const SDK_URL = "https://telegram.org/js/telegram-web-app.js";

let loading: Promise<TelegramWebApp> | undefined;

export function loadTelegram(): Promise<TelegramWebApp> {
  loading ??= new Promise((resolve, reject) => {
    const done = () => (window.Telegram ? resolve(window.Telegram.WebApp) : reject(new Error("Telegram SDK missing")));
    if (window.Telegram) return done();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.onload = done;
    script.onerror = () => reject(new Error("Could not load the Telegram SDK"));
    document.head.append(script);
  });
  return loading;
}

// Outside Telegram the SDK still loads but initData is empty.
export function telegramApp(): TelegramWebApp | null {
  const app = typeof window === "undefined" ? undefined : window.Telegram?.WebApp;
  return app?.initData ? app : null;
}
