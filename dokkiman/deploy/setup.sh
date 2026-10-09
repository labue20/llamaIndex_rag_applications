#!/usr/bin/env bash
#
# One-time setup of a fresh Ubuntu 24.04 server (e.g. AWS Lightsail) for the
# Dokkiman. Run as root:
#
#   DOMAIN=example.com bash setup.sh [repo-url] [branch]
#
# Installs Python 3.10, Node 20, Caddy and LibreOffice, creates the `dokkiman` user,
# clones the app to /opt/dokkiman/app, writes server/.env with generated secrets,
# installs the systemd services and Caddy config, then runs deploy.sh.
# Safe to re-run: existing .env, data and clone are kept.

set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN first, e.g. DOMAIN=example.com bash setup.sh}"
REPO_URL="${1:-https://github.com/labue20/dokkiman.git}"
BRANCH="${2:-master}"

APP_USER=dokkiman
APP_HOME=/opt/dokkiman
APP_DIR=$APP_HOME/app
WEB_APP_DIR=$APP_DIR/dokkiman
SERVER_DIR=$WEB_APP_DIR/server
DEPLOY_DIR=$WEB_APP_DIR/deploy

log() { printf '\n==> %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Run this as root (e.g. 'sudo -i' first)." >&2
    exit 1
fi

log "Adding 2 GB of swap (building the frontend needs the memory)"
if ! swapon --show | grep -q '^/swapfile'; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y software-properties-common ca-certificates curl gnupg git \
    debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades

# Python 3.10 (the version the app and its pinned requirements are tested with)
add-apt-repository -y ppa:deadsnakes/ppa

# Caddy (web server with automatic HTTPS)
if [ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
fi

# Node.js 20 (only used to build the frontend)
if ! command -v node >/dev/null || ! node --version | grep -q '^v20\.'; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
fi

apt-get update
apt-get install -y python3.10 python3.10-venv caddy nodejs
# LibreOffice (Word to PDF) without its desktop extras, plus common fonts
apt-get install -y --no-install-recommends libreoffice-writer \
    fonts-liberation fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea

# Automatic security updates; when one needs a restart (e.g. a new kernel), reboot
# at midnight in the server's timezone (TIMEZONE, default US Central). The site is
# down for about a minute.
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone "${TIMEZONE:-America/Chicago}"
cat > /etc/apt/apt.conf.d/52dokkiman-auto-reboot <<'CONF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "00:00";
CONF

log "Creating the '$APP_USER' user and downloading the app"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
    useradd --system --create-home --home-dir "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
fi
# Caddy needs to read the built website under /opt/dokkiman/app
chmod 755 "$APP_HOME"
if [ ! -d "$APP_DIR/.git" ]; then
    sudo -u "$APP_USER" -H git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

log "Writing server/.env"
ENV_FILE=$SERVER_DIR/.env
if [ ! -f "$ENV_FILE" ]; then
    sed -e "s/__DOMAIN__/$DOMAIN/g" \
        -e "s/__AUTHKEY__/$(openssl rand -hex 32)/" \
        -e "s/__SECRET__/$(openssl rand -hex 32)/" \
        "$DEPLOY_DIR/env.production.example" > "$ENV_FILE"
    chown "$APP_USER:$APP_USER" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Created $ENV_FILE"
else
    echo "$ENV_FILE already exists; leaving it unchanged"
fi

log "Creating the Python environment"
if [ ! -x "$SERVER_DIR/.venv/bin/python" ]; then
    sudo -u "$APP_USER" -H python3.10 -m venv "$SERVER_DIR/.venv"
fi

log "Configuring Caddy for $DOMAIN"
sed "s/__DOMAIN__/$DOMAIN/g" "$DEPLOY_DIR/Caddyfile" > /etc/caddy/Caddyfile
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# validate (run as root) creates the access log; Caddy runs as caddy and must be able to open it
chown -R caddy:caddy /var/log/caddy
systemctl enable caddy

log "Installing the nightly backup"
install -m 644 "$DEPLOY_DIR/systemd/dokkiman-backup.service" /etc/systemd/system/
install -m 644 "$DEPLOY_DIR/systemd/dokkiman-backup.timer" /etc/systemd/system/
install -m 644 "$DEPLOY_DIR/systemd/dokkiman-backup-failed.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dokkiman-backup.timer

if ! grep -q '^OPENAI_API_KEY=.\+' "$ENV_FILE"; then
    cat <<EOF

==> Almost done: add your OpenAI key, then deploy
    1. nano $ENV_FILE
       Set OPENAI_API_KEY=... (and SUPPORT_EMAIL if you like), save with Ctrl+O, exit with Ctrl+X
    2. bash $DEPLOY_DIR/deploy.sh $BRANCH
EOF
    exit 0
fi

log "Deploying the app"
bash "$DEPLOY_DIR/deploy.sh" "$BRANCH"

cat <<EOF

==> Setup complete
    Site:    https://$DOMAIN
    Logs:    journalctl -u dokkiman-api -u dokkiman-index -f
    Update:  bash $DEPLOY_DIR/deploy.sh
EOF
