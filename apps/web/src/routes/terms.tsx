import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/legal-page";

// Placeholder copy: replace with the real terms before opening invites beyond friends.
export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service | Vexis" }] }),
  component: () => (
    <LegalPage title="Terms of Service">
      <p>Vexis is an invite-only dashboard for Meteora DLMM positions. It reads public on-chain and Meteora data.</p>
      <p>Nothing here is financial advice. Alerts can be late or missed; do not rely on them alone.</p>
      <p>Access is personal. Do not share your account or invite codes without permission.</p>
    </LegalPage>
  ),
});
