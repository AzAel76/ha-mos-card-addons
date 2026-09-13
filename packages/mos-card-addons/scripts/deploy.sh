#!/usr/bin/env bash
# Builds the card and copies it into a Home Assistant config's www/community
# folder over SSH. Configure via a local .env file (see .env.example) or
# environment variables — this script is never committed with real values.
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

DEST_DIR="$HA_CONFIG_PATH/www/community/mos-card-addons"

npm run build

echo "Deploying dist/mos-card-addons.js to $HA_HOST:$DEST_DIR"
ssh "$HA_HOST" "mkdir -p '$DEST_DIR'"
scp dist/mos-card-addons.js "$HA_HOST:$DEST_DIR/mos-card-addons.js"

echo "Done. Add/refresh the Lovelace resource:"
echo "  URL:  /local/community/mos-card-addons/mos-card-addons.js"
echo "  Type: JavaScript Module"
