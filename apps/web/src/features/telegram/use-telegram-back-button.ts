import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { telegramApp } from "./telegram";

export function useTelegramBackButton() {
  const router = useRouter();
  const { pathname } = useLocation();
  useEffect(() => {
    const app = telegramApp();
    if (!app) return;
    if (pathname === "/tg") {
      app.BackButton.hide();
      return;
    }
    const back = () => router.history.back();
    app.BackButton.show();
    app.BackButton.onClick(back);
    return () => app.BackButton.offClick(back);
  }, [pathname, router]);
}
