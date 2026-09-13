#!/usr/bin/env bash
# Builds mos-card-addons and copies it into a Home Assistant config's
# www/community folder over SSH — a convenience wrapper around its own
# `npm run deploy` (see packages/mos-card-addons/scripts/deploy.sh), using
# the root .env instead of a package-local one. Configure via a local .env
# file (see .env.example) or environment variables — this script is never
# committed with real values.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${HA_HOST:?Set HA_HOST (e.g. homeassistant.local or a user@host SSH target)}"
: "${HA_CONFIG_PATH:=/config}"

PKG=mos-card-addons

npm run build --workspace="packages/$PKG"

dest_dir="$HA_CONFIG_PATH/www/community/$PKG"
echo "Deploying $PKG to $HA_HOST:$dest_dir"
ssh "$HA_HOST" "mkdir -p '$dest_dir'"
scp "packages/$PKG/dist/$PKG.js" "$HA_HOST:$dest_dir/$PKG.js"

echo
echo "Done. Lovelace resource (add once, then just hard-refresh the browser after future deploys):"
echo "  /local/community/$PKG/$PKG.js"
echo
echo "If mos-kind-title-card.js / mos-server-summary-card.js / mos-detail-card.js"
echo "are still registered as separate Lovelace resources from before this merge,"
echo "remove those (Settings > Dashboards > Resources) so only the one above remains."
