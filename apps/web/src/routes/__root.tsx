/// <reference types="vite/client" />
import { type QueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isPublicPath } from "@/features/auth/auth";
import { viewerQuery } from "@/features/auth/auth.queries";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { useTelegramBackButton } from "@/features/telegram/use-telegram-back-button";
import { themeScript } from "@/features/theme/theme";
import appCss from "@/styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vexis | DLMM portfolio" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
    scripts: [{ children: themeScript }],
  }),
  // Invite-only: a signed-out visitor only sees the public pages. Server functions check the session again.
  beforeLoad: async ({ context, location }) => {
    const viewer = await context.queryClient.ensureQueryData(viewerQuery);
    if (!viewer && !isPublicPath(location.pathname)) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { viewer };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(pricesQuery),
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
        <Toaster position="bottom-center" />
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const { data: prices } = useSuspenseQuery(pricesQuery);
  const bare = useRouterState({ select: (s) => isPublicPath(s.location.pathname) });
  useTelegramBackButton();
  if (bare) return <Outlet />;
  return (
    <AppShell prices={prices}>
      <Outlet />
    </AppShell>
  );
}
