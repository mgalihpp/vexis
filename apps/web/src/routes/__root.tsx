/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getPrices } from "@/features/portfolio/portfolio.functions";
import { useTelegramBackButton } from "@/features/telegram/use-telegram-back-button";
import { themeScript } from "@/features/theme/theme";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import appCss from "@/styles.css?url";

const REFRESH_MS = 15_000;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vexis · DLMM portfolio" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/logo.png" },
    ],
    scripts: [{ children: themeScript }],
  }),
  loader: () => getPrices(),
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // The theme script sets the class before hydration, so React must not fight it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const prices = Route.useLoaderData();
  useLiveRefresh(REFRESH_MS);
  useTelegramBackButton();
  return (
    <AppShell prices={prices}>
      <Outlet />
    </AppShell>
  );
}
