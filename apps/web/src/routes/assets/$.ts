import { readFile } from "node:fs/promises";
import { createFileRoute } from "@tanstack/react-router";

// Nitro serves the current build's /assets itself; only a file from an earlier build reaches this route. Session
// replays (Clarity) still ask for those, so deploy-remote.sh keeps 30 days of them in the archive directory.
const ARCHIVE = process.env.VEXIS_ASSET_ARCHIVE ?? "apps/web/asset-archive";
const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  woff2: "font/woff2",
  svg: "image/svg+xml",
  png: "image/png",
};

export const Route = createFileRoute("/assets/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = params._splat ?? "";
        const type = TYPES[name.split(".").pop() ?? ""];
        if (!type || !/^[\w-][\w.-]*$/.test(name)) return new Response(null, { status: 404 });
        const body = await readFile(`${ARCHIVE}/${name}`).catch(() => null);
        if (!body) return new Response(null, { status: 404 });
        return new Response(body, {
          headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
        });
      },
    },
  },
});
