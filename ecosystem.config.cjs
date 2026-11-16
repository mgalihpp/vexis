// pm2 definitions for the three VPS processes. No secrets: each process reads its own .env from its cwd.
// scripts/deploy-remote.sh starts or restarts one of them by name with `--only`; nothing else in pm2 is touched.
const root = process.env.VEXIS_ROOT ?? "/root";

module.exports = {
  apps: [
    {
      name: "vexis-dashboard",
      cwd: `${root}/vexis`,
      script: "bun",
      args: "apps/web/.output/server/index.mjs",
      interpreter: "none",
      env: { PORT: "3000", VEXIS_BOTS_FILE: `${root}/vexis/bots.vps.json` },
    },
    {
      name: "vexis-agents",
      cwd: `${root}/vexis-agents`,
      script: "bun",
      args: `${root}/vexis-agents/main.js`,
      interpreter: "none",
    },
    {
      name: "vexis-office",
      cwd: `${root}/vexis-office`,
      script: "bun",
      args: `${root}/vexis-office/main.js`,
      interpreter: "none",
    },
  ],
};
