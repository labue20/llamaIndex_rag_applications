#!/usr/bin/env bash
#
# Deploy the latest code on the server. Run as root:
#
#   bash /opt/dokkiman/app/dokkiman/deploy/deploy.sh [branch]
#
# Pulls the branch (default: the one checked out), installs Python and Node
# dependencies, builds the frontend, installs the services and restarts them,
# then checks /health. Downtime is a few seconds while the index reloads.

set -euo pipefail

APP_USER=dokkiman
APP_DIR=/opt/dokkiman/app
WEB_APP_DIR=$APP_DIR/dokkiman
SERVER_DIR=$WEB_APP_DIR/server
FRONTEND_DIR=$WEB_APP_DIR/web
DEPLOY_DIR=$WEB_APP_DIR/deploy

log() { printf '\n==> %s\n' "$*"; }
as_app() { sudo -u "$APP_USER" -H "$@"; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Run this as root (e.g. 'sudo -i' first)." >&2
    exit 1
fi

BRANCH="${1:-$(as_app git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"

log "Updating code ($BRANCH)"
as_app git -C "$APP_DIR" fetch --prune origin
as_app git -C "$APP_DIR" checkout "$BRANCH"
as_app git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
echo "Now at: $(as_app git -C "$APP_DIR" log --oneline -1)"

log "Installing Python dependencies"
as_app "$SERVER_DIR/.venv/bin/pip" install --quiet --upgrade pip
as_app "$SERVER_DIR/.venv/bin/pip" install --quiet -r "$SERVER_DIR/requirements.txt"

log "Building the frontend"
# The API is served from the same site under /api (see the Caddyfile)
(cd "$FRONTEND_DIR" && as_app npm ci --no-audit --no-fund --loglevel=error)
(cd "$FRONTEND_DIR" && as_app env REACT_APP_API_URL=/api GENERATE_SOURCEMAP=false npm run build)

log "Installing services"
install -m 644 "$DEPLOY_DIR/systemd/dokkiman-index.service" /etc/systemd/system/
install -m 644 "$DEPLOY_DIR/systemd/dokkiman-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable dokkiman-index.service dokkiman-api.service

log "Restarting"
# Restarting the index server also restarts the API (PartOf=)
systemctl restart dokkiman-index.service
systemctl start dokkiman-api.service
systemctl reload caddy || systemctl restart caddy

log "Checking health"
# The index server needs a few seconds to load the search index
for _ in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:5601/health >/dev/null 2>&1; then
        echo "Healthy: $(curl -fsS http://127.0.0.1:5601/health)"
        exit 0
    fi
    sleep 2
done

echo "The app didn't become healthy. Recent logs:" >&2
journalctl -u dokkiman-index -u dokkiman-api -n 40 --no-pager >&2
exit 1
