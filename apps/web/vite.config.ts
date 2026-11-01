import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const src = fileURLToPath(new URL("./src", import.meta.url));

// The deploy target is a build flag, not an app change:
// NITRO_PRESET=node-server | vercel | cloudflare-module | ... bun run build
export default defineConfig({
  server: { port: 3000 },
  resolve: { alias: { "@": src } },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // analytics.server.ts loads the DLMM SDK through createRequire, which the bundler can't see, so trace it by name.
    nitro({
      preset: process.env.NITRO_PRESET ?? "bun",
      serverEntry: "./nitro.server.ts",
      traceDeps: ["@meteora-ag/dlmm*", "@solana/web3.js*"],
    }),
    viteReact(),
  ],
});
