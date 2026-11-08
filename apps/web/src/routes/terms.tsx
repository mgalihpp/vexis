import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/legal-page";

// Not reviewed by a lawyer; it names no legal entity, governing law or contact address yet.
export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service | Vexis" }] }),
  component: () => (
    <LegalPage title="Terms of Service" updated="8 November 2026">
      <p>
        These terms cover your use of Vexis, an invite-only portfolio tracker and pool analytics app for Meteora DLMM on
        Solana. By creating an account you agree to them.
      </p>

      <h2>The service</h2>
      <p>
        Vexis reads public on-chain data and third-party market data to show your DLMM positions, PnL and pool
        analytics. Tracking a wallet never needs a signature. Optional agents can alert you about volume spikes on
        Telegram and, if you give one a wallet, rebalance a position for you.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>An invite is for one person. Do not share it, your password or your account without our permission.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>We may suspend or remove access at any time, for example for misuse or to protect other users.</li>
      </ul>

      <h2>Not financial advice</h2>
      <p>
        Nothing in Vexis is financial, investment or tax advice. Prices, PnL, fees, volume and TVL come from Meteora,
        Jupiter, GeckoTerminal, Solana Tracker and Solana RPC nodes. They can be delayed, incomplete or wrong. A value
        we cannot know is shown as a dash and left out of totals. Check important numbers yourself before you act on
        them.
      </p>

      <h2>Alerts</h2>
      <p>
        Alerts are sent through the Telegram bot you link. They can be late, sent twice or not sent at all. Do not rely
        on them alone.
      </p>

      <h2>Auto-rebalance agents and your funds</h2>
      <ul>
        <li>
          An auto-rebalance agent needs the secret key of a hot wallet. In Live mode it signs and sends transactions
          from that wallet on its own. These transactions close and open positions, claim fees, swap tokens and pay
          network fees.
        </li>
        <li>
          Agents start in Preview mode, which sends nothing. Switching to Live is your decision, and you can switch back
          at any time.
        </li>
        <li>
          Use a wallet made only for the agent, and keep in it only funds you can afford to lose. Never give an agent
          your main wallet.
        </li>
        <li>
          Blockchain transactions cannot be reversed. A rebalance can fail, land late, suffer slippage or price impact,
          or act on bad data from an RPC or market data source. Bugs in Vexis, Meteora, Jupiter or Solana programs can
          also cause losses.
        </li>
        <li>You use agents at your own risk. We are not liable for funds lost, spent or locked by an agent.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not try to reach other users&apos; data or agent wallets, or to get around access controls.</li>
        <li>Do not scrape Vexis, overload it, or use it to get around the rate limits of the services it relies on.</li>
        <li>Do not use Vexis for anything illegal where you live.</li>
      </ul>

      <h2>Third-party services</h2>
      <p>
        Vexis depends on Meteora, Jupiter, GeckoTerminal, Solana Tracker, Telegram and the Solana RPC you choose. Their
        own terms apply to them, and we do not control their availability or accuracy.
      </p>

      <h2>No warranty</h2>
      <p>
        Vexis is early software provided as is, with no warranty of any kind. Features can change or be removed, and the
        service can be interrupted or shut down. To the extent the law allows, we are not liable for any indirect or
        consequential loss, or for any loss of funds, profit or data.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The date at the top shows the latest version. If you keep using Vexis after a change,
        you accept the new terms.
      </p>
    </LegalPage>
  ),
});
