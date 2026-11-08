import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/legal-page";

// Not reviewed by a lawyer; keep it in step with what packages/db stores and which services the servers call.
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy | Vexis" }] }),
  component: () => (
    <LegalPage title="Privacy Policy" updated="8 November 2026">
      <p>This policy explains what Vexis stores, why, who else sees it and how to have it deleted.</p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong className="text-foreground">Account:</strong> your name, email and a hashed password (we never see the
          password itself).
        </li>
        <li>
          <strong className="text-foreground">Sessions:</strong> a sign-in cookie, plus the IP address and browser of
          each session.
        </li>
        <li>
          <strong className="text-foreground">Settings:</strong> your timezone and display currency.
        </li>
        <li>
          <strong className="text-foreground">Wallets and agents:</strong> the wallet addresses and labels you add, your
          agents&apos; settings and pools, and their alert and rebalance history.
        </li>
        <li>
          <strong className="text-foreground">Telegram:</strong> the token of the bot you link (encrypted), the
          bot&apos;s username, and your chat ID and username.
        </li>
        <li>
          <strong className="text-foreground">Agent wallets:</strong> the secret key and RPC URL you give an
          auto-rebalance agent, both encrypted. They are never sent back to your browser. The app only shows the public
          key and the RPC&apos;s host name. The key is decrypted only when a live agent signs a transaction.
        </li>
        <li>
          <strong className="text-foreground">Invite requests:</strong> the email you enter on the landing page, and
          whether we have sent you an invite. Your IP address is held briefly in memory to rate limit the form.
        </li>
      </ul>

      <h2>Public blockchain data</h2>
      <p>
        Wallet addresses and their positions are public on Solana. To keep pages fast, our server caches the Meteora
        positions and transaction history of the wallets you track, keyed by wallet address, along with general pool and
        market data. Server logs can include wallet and pool addresses and error messages.
      </p>

      <h2>Who else sees it</h2>
      <p>
        We do not sell your data, show ads or use tracking or analytics scripts. We share data only to run the service:
      </p>
      <ul>
        <li>Supabase hosts our database, and our server provider hosts the app.</li>
        <li>Resend sends invite emails, so it receives the address we write to.</li>
        <li>
          Meteora and Jupiter receive the wallet, pool and token addresses we look up. GeckoTerminal and Solana Tracker
          receive pool and token addresses only.
        </li>
        <li>Telegram delivers your alerts through your bot, so it receives the alert text.</li>
        <li>The RPC provider you choose receives your agent wallet&apos;s reads and transactions.</li>
      </ul>
      <p>We may also share data if the law requires it.</p>

      <h2>In your browser</h2>
      <p>
        Vexis sets a sign-in cookie. Local storage keeps your theme, your favourite and recently viewed wallets, and any
        alert sound you upload. These stay on your device and are never sent to us.
      </p>

      <h2>Security</h2>
      <p>
        Bot tokens, agent wallet keys and RPC URLs are encrypted with AES-256-GCM. Every account&apos;s data is kept
        separate from the others. No system is perfectly secure, so keep only what you can afford to lose in an agent
        wallet.
      </p>

      <h2>Keeping and deleting data</h2>
      <p>
        We keep your data while your account exists. Ask an admin to delete your account. That removes your settings,
        wallets, Telegram links, agents, agent wallet and their history. Cached data about a public wallet address can
        remain afterwards, since it is not tied to your account. Per-minute pool data is deleted after 7 days.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows the latest version.</p>
    </LegalPage>
  ),
});
