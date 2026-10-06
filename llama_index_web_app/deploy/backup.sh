#!/usr/bin/env bash
#
# Back up the app's data: accounts (users.db), the search index, document
# records and uploaded originals. Runs nightly via rag-backup.timer; run it by
# hand as root with:  bash /opt/rag/app/llama_index_web_app/deploy/backup.sh
#
# Keeps 14 days of archives in /opt/rag/backups (readable by root only). If
# BACKUP_BUCKET is set in server/.env (e.g. s3://my-rag-backups), each archive is
# also copied there with the AWS CLI.
#
# Restore: stop the services, unpack an archive into the server/ folder, start.

set -euo pipefail

SERVER_DIR=/opt/rag/app/llama_index_web_app/server
BACKUP_DIR=/opt/rag/backups
KEEP_DAYS=14
STAMP=$(date -u +%Y%m%d-%H%M%S)
ARCHIVE=$BACKUP_DIR/rag-backup-$STAMP.tar.gz

umask 077
mkdir -p "$BACKUP_DIR"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cd "$SERVER_DIR"

# A consistent copy of the accounts database, even while the app is running
if [ -f instance/users.db ]; then
    mkdir -p "$WORK/instance"
    .venv/bin/python - "$WORK/instance/users.db" <<'EOF'
import sqlite3, sys
source = sqlite3.connect("instance/users.db")
target = sqlite3.connect(sys.argv[1])
source.backup(target)
target.close()
source.close()
EOF
fi

# Everything else is plain files
for item in saved_index stored_documents.pkl documents; do
    if [ -e "$item" ]; then
        cp -a "$item" "$WORK/"
    fi
done

tar -czf "$ARCHIVE" -C "$WORK" .
echo "Backup written: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

find "$BACKUP_DIR" -name 'rag-backup-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

BUCKET=$(grep -E '^BACKUP_BUCKET=' .env | cut -d= -f2- || true)
if [ -n "$BUCKET" ]; then
    aws s3 cp "$ARCHIVE" "$BUCKET/" --only-show-errors
    echo "Copied to $BUCKET"
fi
