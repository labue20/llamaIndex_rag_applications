# Deploying to AWS Lightsail

This guide puts the app on one Ubuntu server with HTTPS at your own domain.
Everything it needs is in `llama_index_web_app/deploy/`.

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
curl -fsSL -o setup.sh https://raw.githubusercontent.com/labue20/llamaIndex_rag_applications/master/llama_index_web_app/deploy/setup.sh
DOMAIN=yourdomain.com bash setup.sh
```

To deploy a different branch: `DOMAIN=yourdomain.com bash setup.sh https://github.com/labue20/llamaIndex_rag_applications.git dev`.

It takes 10-15 minutes. It installs Python, Node, Caddy and LibreOffice,
creates a `rag` user, downloads the app to `/opt/rag/app`, generates secrets,
and sets up the services and nightly backups.

## 6. Add your OpenAI key and start

Setup stops and asks for your key. First set a **monthly spending limit** at
<https://platform.openai.com> → Settings → Limits. Then:

```bash
nano /opt/rag/app/llama_index_web_app/server/.env
```

Set `OPENAI_API_KEY=...`, `GOOGLE_CLIENT_ID=...` (from the next section) and
`SUPPORT_EMAIL=` for the Upgrade dialog. Save with Ctrl+O, exit with Ctrl+X,
then deploy:

```bash
bash /opt/rag/app/llama_index_web_app/deploy/deploy.sh
```

It ends with `Healthy: {"index_server":true,"status":"ok"}`. Open
`https://yourdomain.com`; Caddy gets the HTTPS certificate on the first visit.

### Set up Google sign-in

People create their account and sign in with Google, so the site needs a
Google OAuth client ID (free):

1. Open <https://console.cloud.google.com>, create a project (e.g. "RAG Web App").
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

## 7. Create your account and make it Pro

Sign in on the site with Google, then give your account unlimited access:

```bash
cd /opt/rag/app/llama_index_web_app/server
sudo -u rag .venv/bin/python manage_users.py upgrade you@example.com
sudo -u rag .venv/bin/python manage_users.py list
```

## Everyday tasks

| Task | Command (as root) |
|---|---|
| Deploy the latest code | `bash /opt/rag/app/llama_index_web_app/deploy/deploy.sh` |
| Watch the logs | `journalctl -u rag-api -u rag-index -f` |
| Restart the app | `systemctl restart rag-index` (restarts the API too) |
| Check health | `curl http://127.0.0.1:5601/health` |
| Run a backup now | `systemctl start rag-backup` |
| Manage accounts | `cd .../server && sudo -u rag .venv/bin/python manage_users.py --help` |

## Backups

- **Nightly archive:** `rag-backup.timer` saves accounts, the search index,
  document records and uploaded files to `/opt/rag/backups` at 03:30 and keeps
  14 days.
- **Off-server copy (recommended):** these archives are on the same server, so
  also do one of:
  - Lightsail instance → **Snapshots** → turn on **automatic snapshots**
    (a full copy of the server each day; easiest), and/or
  - Create a Lightsail **bucket**, an access key for it, then on the server:
    `snap install aws-cli --classic`, `aws configure` (as root), and set
    `BACKUP_BUCKET=s3://your-bucket-name` in `server/.env`.
- **Restore an archive:** `systemctl stop rag-index`, unpack the archive into
  `/opt/rag/app/llama_index_web_app/server/` with `tar -xzf`, run
  `chown -R rag:rag` on the restored files, then `systemctl start rag-index rag-api`.

## Security notes

- Only Caddy faces the internet. The API and index server listen on
  `127.0.0.1`, and the app runs as the unprivileged `rag` user.
- `server/.env` (keys and secrets) and the data folders are readable only by
  the `rag` user. Never commit `.env`.
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
| "Can't reach the server" in the app | `curl http://127.0.0.1:5601/health`; `journalctl -u rag-api -u rag-index -n 50` |
| AI answers fail | `OPENAI_API_KEY` in `server/.env`, OpenAI billing and limits |
| "Sign-in isn't available right now" | `GOOGLE_CLIENT_ID` is empty in `server/.env` |
| Google button says the origin isn't allowed | Add `https://yourdomain.com` to the client's Authorized JavaScript origins (changes can take a few minutes) |
| Word to PDF fails | `soffice --version` (LibreOffice installed by setup) |
| Deploy says "didn't become healthy" | It prints recent logs; most often a missing/invalid OpenAI key |
