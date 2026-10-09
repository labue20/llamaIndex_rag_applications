# Deploying to AWS Lightsail

This guide puts the app on one Ubuntu server with HTTPS at your own domain.
Everything it needs is in `dokkiman/deploy/`.

```
Users ──HTTPS──▶ Caddy ─┬─ /      → React app (built files)
                        └─ /api/* → gunicorn + Flask API (127.0.0.1:5601)
                                         └─ index server (127.0.0.1:5602)
                                              └─ data in server/: accounts, index, uploads
```

You'll need: an AWS account, a domain name, and an OpenAI API key.
Time: about 30-45 minutes the first time.

## 1. Prepare the code

The server deploys the `master` branch by default. Merge `dev` into `master`
on GitHub first (or deploy `dev` by passing it as the branch in step 5).

## 2. Create the server

1. Open <https://lightsail.aws.amazon.com> → **Create instance**.
2. **Platform:** Linux/Unix. **Blueprint:** OS Only → **Ubuntu 24.04 LTS**.
3. **SSH key:** upload your public key (`cat ~/.ssh/id_ed25519.pub` on your Mac;
   create one with `ssh-keygen -t ed25519` if you don't have one).
4. **Plan:** 2 GB RAM (the smallest that comfortably runs the app).
5. Name it (e.g. `rag-app`) and click **Create instance**.

## 3. Networking

On the instance page → **Networking** tab:

1. **Attach a static IP** (free while attached), so the address never changes.
2. Under **IPv4 Firewall**, make sure these are allowed:
   - SSH (22)
   - **HTTP (80)** and **HTTPS (443)**: add them if missing. Without these the
     site can't be reached and HTTPS certificates can't be issued.

## 4. Point your domain at the server

At your domain registrar (or in Lightsail **Domains & DNS**), add:

| Type | Name | Value |
|---|---|---|
| A | `@` (your domain) | the static IP |
| A | `www` | the static IP |

Wait until `ping yourdomain.com` shows the static IP (minutes to an hour).
HTTPS setup in step 5 needs this to work.

## 5. Install the app

Log in and become root:

```bash
ssh ubuntu@YOUR_STATIC_IP
sudo -i
```

Download the setup script and run it with your domain:

```bash
curl -fsSL -o setup.sh https://raw.githubusercontent.com/labue20/dokkiman/master/dokkiman/deploy/setup.sh
DOMAIN=yourdomain.com bash setup.sh
```

To deploy a different branch: `DOMAIN=yourdomain.com bash setup.sh https://github.com/labue20/dokkiman.git dev`.

It takes 10-15 minutes. It installs Python, Node, Caddy and LibreOffice,
creates a `dokkiman` user, downloads the app to `/opt/dokkiman/app`, generates secrets,
and sets up the services and nightly backups.

## 6. Add your OpenAI key and start

Setup stops and asks for your key. First set a **monthly spending limit** at
<https://platform.openai.com> → Settings → Limits. Then:

```bash
nano /opt/dokkiman/app/dokkiman/server/.env
```

Set `OPENAI_API_KEY=...`, `GOOGLE_CLIENT_ID=...` (from the next section) and
`SUPPORT_EMAIL=` for the Upgrade dialog. Save with Ctrl+O, exit with Ctrl+X,
then deploy:

```bash
bash /opt/dokkiman/app/dokkiman/deploy/deploy.sh
```

It ends with `Healthy: {"index_server":true,"status":"ok"}`. Open
`https://yourdomain.com`; Caddy gets the HTTPS certificate on the first visit.

### Set up Google sign-in

People create their account and sign in with Google, so the site needs a
Google OAuth client ID (free):

1. Open <https://console.cloud.google.com>, create a project (e.g. "Dokkiman").
2. **Google Auth Platform → Branding**: app name, support email, your logo
   (optional), and links to your privacy policy and terms. Under **Authorized
   domains** add `yourdomain.com`.
3. **Audience**: choose **External**, then **Publish app**. The app only asks
   for name and email (`openid`, `email`, `profile`), which don't need Google's
   review.
4. **Clients → Create client → Web application**. Under **Authorized JavaScript
   origins** add `https://yourdomain.com` (and `http://localhost:3000` plus
   `http://localhost` if you also test on your computer). No redirect URI is
   needed.
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into
   `GOOGLE_CLIENT_ID=` in `server/.env` and run `deploy.sh` again.

### Set up payments with Stripe (optional)

Without Stripe, "Upgrade to Basic/Pro" emails you and you upgrade people with
`manage_users.py`. To take payments online:

1. In the Stripe Dashboard (live mode), create a **restricted key** with:
   Customers *write*, Checkout Sessions *write*, Customer portal *write*,
   Subscriptions *read*, Prices *write*, Products *write*, Webhook Endpoints *write*.
   (After setup you can lower Prices, Products and Webhook Endpoints to *read*.)
2. Put it in `server/.env` as `STRIPE_SECRET_KEY=rk_live_...` with
   `STRIPE_MODE=live`, and set `PUBLIC_APP_URL=https://yourdomain.com`.
   (Without `STRIPE_MODE=live` the app uses `STRIPE_SECRET_TEST_KEY`, so a
   development machine never charges real cards.)
3. Run the one-time setup, which creates the Basic and Pro products and prices,
   the customer portal settings (including switching between Basic and Pro) and
   the webhook:
   ```bash
   cd /opt/dokkiman/app/dokkiman/server
   sudo -u dokkiman .venv/bin/python stripe_setup.py --webhook-url https://yourdomain.com/api/billing/webhook
   ```
4. Copy the `STRIPE_PORTAL_CONFIGURATION=` and `STRIPE_WEBHOOK_SECRET=` lines it
   prints into `server/.env`, then run `deploy.sh`.
5. Consider [Stripe Tax](https://docs.stripe.com/billing/taxes/collect-taxes) if
   you'll charge customers in places where you must collect sales tax or VAT.

## 7. Create your account and make it Pro

Sign in on the site with Google, then give your account unlimited access:

```bash
cd /opt/dokkiman/app/dokkiman/server
sudo -u dokkiman .venv/bin/python manage_users.py upgrade you@example.com
sudo -u dokkiman .venv/bin/python manage_users.py list
```

## Everyday tasks

| Task | Command (as root) |
|---|---|
| Deploy the latest code | `bash /opt/dokkiman/app/dokkiman/deploy/deploy.sh` |
| Watch the logs | `journalctl -u dokkiman-api -u dokkiman-index -f` |
| Restart the app | `systemctl restart dokkiman-index` (restarts the API too) |
| Check health | `curl http://127.0.0.1:5601/health` |
| Run a backup now | `systemctl start dokkiman-backup` |
| Manage accounts | `cd .../server && sudo -u dokkiman .venv/bin/python manage_users.py --help` |
| Someone paid for Pro | `manage_users.py upgrade them@example.com --months 1` (or `--years 1`). Renewing early adds to their current end date; when it passes, they move to Free automatically |
| Someone paid for Basic | `manage_users.py upgrade them@example.com --plan basic --months 1` |

## Backups and restore

Three layers, from widest to finest:

1. **Lightsail automatic snapshots** (instance → **Snapshots** → automatic, daily
   at 05:00 UTC; AWS keeps 7). A copy of the whole server, stored by AWS apart
   from it. Use this if the server is lost or broken: **create a new instance
   from the snapshot**, then attach the static IP to it.
2. **Nightly archives** (`dokkiman-backup.timer`, 03:30 UTC): accounts database,
   search index, uploaded documents and signature requests, in
   `/opt/dokkiman/backups` (14 days).
3. **Off-server copies of the archives** in a private S3 bucket (30 days, then a
   lifecycle rule deletes them). Set up once:
   - S3 bucket in the server's region (us-east-2), public access blocked, lifecycle
     rule "expire after 30 days".
   - An IAM user whose only permission is `s3:PutObject` on that bucket, so even
     someone with the server can't read or delete the backups.
   - On the server (AWS CLI from `snap install aws-cli --classic`):
     `sudo aws configure` with that user's key (stored in `/root/.aws`, root only),
     and `BACKUP_BUCKET=s3://your-bucket` in `server/.env`.

**If a backup fails** (including the copy to S3), `dokkiman-backup-failed.service`
emails `SUPPORT_EMAIL`. Check with `sudo journalctl -u dokkiman-backup -n 100`;
run one by hand with `sudo systemctl start dokkiman-backup`.

**Restore an archive** (for example after losing files, without rolling back the
whole server):

```bash
sudo systemctl stop dokkiman-api dokkiman-index
cd /opt/dokkiman/app/dokkiman/server
sudo tar -xzf /opt/dokkiman/backups/dokkiman-backup-YYYYMMDD-HHMMSS.tar.gz
sudo chown -R dokkiman:dokkiman instance saved_index stored_documents.pkl documents signature_requests
sudo systemctl start dokkiman-index dokkiman-api
```

To restore from S3, download the archive in the AWS console (S3 → bucket →
the file → Download), copy it to the server with
`scp file.tar.gz dokkiman:/tmp/`, and unpack it the same way.

## Security notes

- Only Caddy faces the internet. The API and index server listen on
  `127.0.0.1`, and the app runs as the unprivileged `dokkiman` user.
- `server/.env` (keys and secrets) and the data folders are readable only by
  the `dokkiman` user. Never commit `.env`.
- Login cookies are HTTPS-only (`SESSION_COOKIE_SECURE=true`).
- Ubuntu security updates install automatically.
- Uploaded documents (including tax documents) are stored on the server and in
  backups. Before inviting real users, add encryption at rest, email
  verification and password reset, and publish a privacy policy.

## Troubleshooting

| Problem | Check |
|---|---|
| Site doesn't load | Lightsail firewall allows 80/443; DNS points at the static IP; `systemctl status caddy` |
| HTTPS certificate error | DNS must resolve first; `journalctl -u caddy -n 50` |
| "Can't reach the server" in the app | `curl http://127.0.0.1:5601/health`; `journalctl -u dokkiman-api -u dokkiman-index -n 50` |
| AI answers fail | `OPENAI_API_KEY` in `server/.env`, OpenAI billing and limits |
| Basic or Pro doesn't switch on after paying | Stripe Dashboard → Developers → Webhooks: the endpoint's recent deliveries; `STRIPE_WEBHOOK_SECRET` must match that endpoint |
| "Sign-in isn't available right now" | `GOOGLE_CLIENT_ID` is empty in `server/.env` |
| Google button says the origin isn't allowed | Add `https://yourdomain.com` to the client's Authorized JavaScript origins (changes can take a few minutes) |
| Word to PDF fails | `soffice --version` (LibreOffice installed by setup) |
| Deploy says "didn't become healthy" | It prints recent logs; most often a missing/invalid OpenAI key |
