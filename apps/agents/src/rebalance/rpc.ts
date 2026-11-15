import { Connection } from "@solana/web3.js";

/** One `Connection` per RPC URL. Each user brings their own RPC, so a layer keeps one per distinct URL it was handed. */
export function connections() {
  const byUrl = new Map<string, Connection>();
  return (url: string) => {
    const found = byUrl.get(url);
    if (found) return found;
    const connection = new Connection(url, "confirmed");
    byUrl.set(url, connection);
    return connection;
  };
}

/** A user's RPC URL usually carries an API key; it never reaches a log line, a stored error or a Telegram message. */
export function redactRpc(text: string, url: string) {
  const query = URL.canParse(url) ? new URL(url).search.slice(1) : "";
  const scrubbed = text.replaceAll(url, "<rpc>");
  return query ? scrubbed.replaceAll(query, "<rpc-query>") : scrubbed;
}
