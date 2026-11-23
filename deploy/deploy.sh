#!/usr/bin/env bash
# Deploys the latest main. Run on the server, as the squash user, from anywhere: ~/SquashBot/deploy/deploy.sh
# Roll back to an earlier version by giving its commit: ~/SquashBot/deploy/deploy.sh 5271ebd
# (the next deploy without a commit goes back to the latest main).
# Stops at the first failing step (set -e), so a failing test or build never replaces the running version.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -ge 1 ]; then
  echo "==> Getting commit $1 (rollback)"
  git fetch
  git checkout --detach "$1"
else
  echo "==> Getting the latest code"
  git switch main
  git pull --ff-only
fi

echo "==> Installing dependencies"
npm ci
npm --prefix web ci

echo "==> Running the tests"
npm test

echo "==> Building"
npm run build

echo "==> Backing up the database (before the new version starts)"
npm run backup

echo "==> Restarting"
sudo systemctl restart squash

echo "==> Waiting for the health check"
for _ in $(seq 30); do
  if curl -sf http://127.0.0.1:3000/api/health > /dev/null; then
    echo "==> Deployed: $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 1
done
echo "!! The app didn't become healthy. Look at: journalctl -u squash -n 50" >&2
exit 1
