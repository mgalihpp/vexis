// Bundles the office runtime for the VPS: bun scripts/bundle-office.ts <outfile>
// `bun build` mis-wraps @coral-xyz/anchor's ESM build when only the DLMM SDK pulls it in (the bundle dies with
// "exports_esm is not defined" at start), so anchor is resolved to its CJS build here.
import { dirname, join } from "node:path";

const outfile = process.argv[2];
if (!outfile) throw new Error("usage: bun scripts/bundle-office.ts <outfile>");

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "../apps/office/src/main.ts")],
  target: "bun",
  outdir: dirname(join(process.cwd(), outfile)),
  naming: outfile.split(/[\\/]/).pop(),
  plugins: [
    {
      name: "anchor-cjs",
      setup(build) {
        build.onResolve({ filter: /^@coral-xyz\/anchor$/ }, (args) => {
          const pkg = require.resolve("@coral-xyz/anchor/package.json", {
            paths: [args.importer ? dirname(args.importer) : process.cwd()],
          });
          return { path: join(dirname(pkg), "dist/cjs/index.js") };
        });
      },
    },
  ],
});

if (!result.success) {
  console.error(result.logs.join("\n"));
  process.exit(1);
}
