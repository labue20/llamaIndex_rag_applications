#!/usr/bin/env bash
#
# Deploy dokkiman.com from your own machine, then tag what went live. Run from
# anywhere in the repo:
#
#   dokkiman/deploy/release.sh
#
# Runs deploy.sh on the server (over the `dokkiman` ssh host, or DEPLOY_HOST),
# and only if it comes up healthy, tags the deployed commit deploy-YYYY-MM-DD
# (-2, -3, ... for later deploys that day) and pushes the tag. The tags mark
# exactly what was live when, so a bad deploy can be rolled back to the previous
# tag, and `git log deploy-A..deploy-B` lists what a deploy changed. The tag is
# made here, not on the server, because the server can only read the repo.

set -euo pipefail

HOST="${DEPLOY_HOST:-dokkiman}"
REPO="$(git rev-parse --show-toplevel)"
ssh_host() { ssh -o BatchMode=yes -o ServerAliveInterval=30 "$HOST" "$@"; }

ssh_host 'sudo bash /opt/dokkiman/app/dokkiman/deploy/deploy.sh'

LIVE="$(ssh_host 'cd /opt/dokkiman/app && sudo -u "$(stat -c %U .)" git rev-parse HEAD')"
git -C "$REPO" fetch -q --tags origin

# Deploying the same commit again doesn't need another tag
EXISTING="$(git -C "$REPO" tag --points-at "$LIVE" --list 'deploy-*')"
if [ -n "$EXISTING" ]; then
    echo "Live: $(git -C "$REPO" log --oneline -1 "$LIVE"), already tagged $EXISTING"
    exit 0
fi

DAY="deploy-$(date +%F)"
TAG="$DAY"
n=2
while git -C "$REPO" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; do
    TAG="$DAY-$n"
    n=$((n + 1))
done

git -C "$REPO" tag -a "$TAG" "$LIVE" -m "Deployed to dokkiman.com"
git -C "$REPO" push -q origin "$TAG"
echo "Live: $(git -C "$REPO" log --oneline -1 "$LIVE"), tagged $TAG"
