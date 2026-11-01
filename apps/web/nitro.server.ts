import { defineServerEntry } from "nitro";

// No fetch, so every request falls through to Start. Only the server options matter: Bun.serve drops a
// connection after 10s idle, and server functions waiting out Meteora's rate limit take longer, so nginx
// answered them with 502. 255 is Bun's maximum.
export default defineServerEntry({ bun: { idleTimeout: 255 } });
