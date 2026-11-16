#!/usr/bin/env bash
# Runs on the VPS (uploaded by deploy.yml): bash deploy-remote.sh <web|runner|office>
# Swaps in the artifact uploaded to $INCOMING, restarts that one pm2 process, health checks it and puts the
# previous version back if it fails. Never touches another pm2 process.
set -eu

kind=${1:?usage: deploy-remote.sh web|runner|office}
ROOT=${VEXIS_ROOT:-/root}
INCOMING=${VEXIS_INCOMING:-$ROOT/.vexis-deploy}
PM2=${PM2:-pm2}
HEALTH_WAIT=${HEALTH_WAIT:-20}
HEALTH_TRIES=${HEALTH_TRIES:-15}
HEALTH_INTERVAL=${HEALTH_INTERVAL:-2}
WEB_URL=${WEB_URL:-http://127.0.0.1:3000/login}
ECOSYSTEM=$INCOMING/ecosystem.config.cjs

case $kind in
  web) name=vexis-dashboard dir=$ROOT/vexis ;;
  runner) name=vexis-agents dir=$ROOT/vexis-agents ;;
  office) name=vexis-office dir=$ROOT/vexis-office ;;
  *) echo "unknown kind: $kind"; exit 2 ;;
esac

if [ "$kind" = office ] && { [ ! -d "$dir" ] || [ ! -f "$dir/.env" ]; }; then
  echo "SKIPPED office: $dir or its .env does not exist on the VPS. Prepare it once by hand (see AGENTS.md); not a failure."
  rm -f "$INCOMING/office-main.js"
  exit 0
fi

restarts() {
  "$PM2" jlist | bun -e "const p = JSON.parse(await Bun.stdin.text()).find((x) => x.name === '$name'); console.log(p?.pm2_env.status === 'online' ? p.pm2_env.restart_time : 'down')"
}

# If the ecosystem file is broken, a plain restart still brings back the process as pm2 already knows it.
restart() {
  "$PM2" startOrRestart "$ECOSYSTEM" --only "$name" --update-env || "$PM2" restart "$name" --update-env
}

# swap_in / swap_back move the artifact; the previous version is kept as .prev
if [ "$kind" = web ]; then
  cd "$dir/apps/web"
  rm -rf .output.new
  mkdir .output.new
  tar -xzf "$INCOMING/web-output.tgz" -C .output.new --strip-components=1
  if [ -n "$(find .output.new -xtype l)" ]; then echo "broken symlinks in the build"; rm -rf .output.new; exit 1; fi
  swap_in() { rm -rf .output.prev; if [ -d .output ]; then mv .output .output.prev; fi; mv .output.new .output; }
  swap_back() { if [ -d .output.prev ]; then rm -rf .output; cp -a .output.prev .output; else return 1; fi; }
else
  cd "$dir"
  swap_in() { if [ -f main.js ]; then cp main.js main.js.prev; fi; mv "$INCOMING/${kind}-main.js" main.js; }
  swap_back() { if [ -f main.js.prev ]; then cp main.js.prev main.js; else return 1; fi; }
fi

swap_in
restart
before=$(restarts)

healthy=0
if [ "$kind" = web ]; then
  for _ in $(seq "$HEALTH_TRIES"); do
    if curl -fsS -o /dev/null "$WEB_URL"; then healthy=1; break; fi
    sleep "$HEALTH_INTERVAL"
  done
else
  sleep "$HEALTH_WAIT"
  healthy=1
fi

after=$(restarts)
if [ "$healthy" != 1 ] || [ "$after" = down ] || [ "$after" != "$before" ]; then
  echo "$name did not stay up (healthy=$healthy, restarts $before -> $after); rolling back"
  "$PM2" logs "$name" --lines 30 --nostream || true
  if swap_back; then restart; else echo "no previous version to roll back to"; fi
  exit 1
fi
"$PM2" save
rm -f "$INCOMING/${kind}-main.js"
echo "$name deployed"
