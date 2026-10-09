#!/usr/bin/env bash
#
# Emails SUPPORT_EMAIL (through Resend) when the nightly backup fails.
# Run by dokkiman-backup-failed.service, the backup service's OnFailure.

set -euo pipefail

cd /opt/dokkiman/app/dokkiman/server
LOG=$(journalctl -u dokkiman-backup.service -n 30 --no-pager 2>/dev/null || true)

python3 - "$LOG" <<'PY'
import json, sys, urllib.request

env = {}
for line in open(".env"):
    if "=" in line and not line.lstrip().startswith("#"):
        name, value = line.rstrip("\n").split("=", 1)
        env[name.strip()] = value.strip().strip("\"'")
key, to = env.get("RESEND_API_KEY"), env.get("SUPPORT_EMAIL")
if not key or not to:
    sys.exit("No RESEND_API_KEY or SUPPORT_EMAIL in .env: can't send the backup alert")

message = {
    "from": env.get("EMAIL_FROM") or "Dokkiman <sign@dokkiman.com>",
    "to": [to],
    "subject": "Dokkiman: the nightly backup FAILED",
    "text": "The nightly backup on the Dokkiman server failed, so last night's data may not be "
            "saved off the server. Recent log lines:\n\n" + sys.argv[1] +
            "\n\nTo see more: ssh dokkiman, then sudo journalctl -u dokkiman-backup -n 100\n"
            "To retry: sudo systemctl start dokkiman-backup\n",
}
request = urllib.request.Request(
    "https://api.resend.com/emails", data=json.dumps(message).encode(),
    headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
)
urllib.request.urlopen(request, timeout=20)
print("Backup failure alert sent to", to)
PY
