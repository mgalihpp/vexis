import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/legal-page";

// Placeholder copy: replace with the real policy before opening invites beyond friends.
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy | Vexis" }] }),
  component: () => (
    <LegalPage title="Privacy Policy">
      <p>
        We store your email, a hashed password, the wallets and pools you add, and your Telegram chat if you link one.
      </p>
      <p>Your data is only visible to you. We do not sell it or share it with third parties.</p>
      <p>Ask an admin to delete your account and everything tied to it.</p>
    </LegalPage>
  ),
});
