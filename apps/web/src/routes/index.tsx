import { createFileRoute } from "@tanstack/react-router";
import landingCss from "@/features/landing/landing.css?url";
import { LandingPage } from "@/features/landing/landing-page";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vexis | Smarter DLMM management" },
      {
        name: "description",
        content:
          "Vexis tracks every Meteora DLMM position, reads the pools you trade, and watches them while you are away.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS },
      { rel: "stylesheet", href: landingCss },
    ],
  }),
  component: LandingPage,
});
