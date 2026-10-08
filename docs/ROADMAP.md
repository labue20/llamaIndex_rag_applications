# Dokkiman Roadmap

What's left to do, roughly in priority order. Live site: <https://dokkiman.com>

## How to deploy

From your Mac's Terminal app:

**Step 1: Make sure your change is on `master`.** On GitHub, open a pull
request from `dev` to `master` and merge it. The server only deploys what's on
`master`.

**Step 2: Log in to the server.**

```
ssh dokkiman
```

You should see a prompt like `ubuntu@ip-172-26-4-43:~$`. The `dokkiman`
shortcut is in `~/.ssh/config`; it connects to `77.112.74.236` as `ubuntu` with
the key `~/.ssh/dokkiman_prod.pem`.

**Step 3: Run the deploy script.**

```
sudo bash /opt/dokkiman/app/dokkiman/deploy/deploy.sh master
```

It takes about 2–3 minutes and shows these steps:

```
==> Updating code (master)
==> Installing Python dependencies
==> Building the frontend
==> Installing services
==> Restarting
==> Checking health
Healthy: {"index_server":true,"status":"ok"}
```

Your data (accounts, documents, the index) isn't touched.

**Step 4: Check it worked.** The last line must say `Healthy`; if it shows an
error instead, read the lines above it. Then open <https://dokkiman.com> and
refresh with Cmd+Shift+R to skip the browser cache.

**Step 5: Log out of the server.**

```
exit
```

**Useful extras while logged in:**

| To | Run |
|---|---|
| See the app's live logs | `sudo journalctl -u dokkiman-api -u dokkiman-index -f` (Ctrl+C to stop) |
| Check the services are running | `systemctl status dokkiman-api dokkiman-index caddy` |
| Edit settings (keys, support email) | `sudo nano /opt/dokkiman/app/dokkiman/server/.env`, then run the deploy again |
| Restart without updating code | `sudo systemctl restart dokkiman-api dokkiman-index` |

**If `ssh dokkiman` fails** with "Permission denied", the key file may have
been moved. Check that `~/.ssh/dokkiman_prod.pem` exists; the original download
is `~/Downloads/dokkiman_ssh_prod_key.pem`.

## Before launch

- [ ] **Decide the prices.** Today there are four paid prices: Basic $1.99/month
      or $19.99/year, Pro $9.99/month or $90/year. Settle on the final set
      ("3 prices, not 4"), and decide whether Pro yearly stays at $90 or becomes
      $99.99 (2 months free, like Basic).
- [ ] **Turn on live payments with Stripe.** Payments are off on the live site
      for now, so "Upgrade" emails you instead. On the server:
      1. Put a restricted live key in `server/.env` (`STRIPE_SECRET_KEY=rk_live_...`).
      2. Run `stripe_setup.py --webhook-url https://dokkiman.com/api/billing/webhook`.
      3. Copy the printed `STRIPE_PORTAL_CONFIGURATION` and `STRIPE_WEBHOOK_SECRET`
         into `.env`, then run `deploy.sh`.
      4. Make one real purchase and refund it.
- [ ] **Set the support email** (`SUPPORT_EMAIL` in the server's `.env`). It's
      shown in the Upgrade dialog and on the legal pages.
- [x] **Ship the new logo.** The folded-page "D" logo and browser icons are live.
- [x] **Merge `dev` into `master`.** Done in PR #13, which included the
      `setup.sh` Caddy log fix, the tagline and Pricing on mobile.
- [ ] **Check the live site end to end:** sign in with Google, upload a
      document and ask a question, and try PDF to Word, Word to PDF, Split and Sign.
- [ ] **Set up off-server backups.** `BACKUP_BUCKET` is empty, so nightly
      backups stay on the server. If the server is lost, so are the backups.
- [ ] **Replace the OpenAI key** that was pasted into a chat, and confirm the
      monthly spending limit is set.

## Product

### Sign Word documents too (small, about 1 hour)

Sign PDF only accepts PDFs today. Converting `.docx` uploads to PDF
automatically (the Word to PDF converter already does this) makes
"sign any document" true.

### Request signatures (built, in E-Sign)

Next, if you want e-signature to be the main product: build "Request signatures". You enter
a signer's email, they get a link, sign in the browser without an account, and
everyone receives the signed copy with the audit trail. That needs an email
service (for example Resend or Amazon SES) and a few days of work, and it would
make "e-signature tool" fully true. It's also a natural thing to keep for Pro,
giving people a reason to upgrade.

Pieces:
- [x] Signature requests: the document, signers' emails, signing order, status
      (sent, viewed, signed, declined), reminders, cancel and delete
- [x] A signing page that works from a private link, with no account needed
- [x] The signed copy with the full audit trail (every signer, time and IP
      address, and the document fingerprint), emailed to everyone
- [x] Limits per plan: 3 a month on the trial and Basic, none on Free,
      unlimited on Pro (fair use 200 a month); `SIGNATURE_REQUESTS_PER_MONTH_*`
- [x] Terms and privacy policy updated to cover signers who don't have accounts
- [ ] **Turn on real email:** create a Resend account, verify `dokkiman.com`
      (add Resend's DNS records at Namecheap), then set `RESEND_API_KEY` and
      `EMAIL_FROM=Dokkiman <sign@dokkiman.com>` in the server's `.env` and deploy.
      Until then, emails are only written to the server log.

## Marketing

**One-liner:** Dokkiman lets you chat with your PDFs and Word documents, asking
questions and getting answers straight from the text, alongside everyday PDF
tools: convert, split and sign. Free to start, $1.99 a month for more.

**Tagline (chosen):** "Sign, convert and chat with your documents." It's used as
the homepage headline, the page title and the search description.

Other options considered:
- "Sign any document in seconds: PDF or Word, no account needed. Then ask it questions with AI."
- "Ask your documents anything, then convert, split or sign them, all in one place."

Once Request signatures exists: "The e-signature tool for all your documents."

- [ ] **Search engines:** give each tool page its own title and description
      (for example "Free PDF to Word converter, no sign-up") and submit the
      site to Google Search Console
- [ ] **Short demo videos** (20–30 seconds) for TikTok, Reels, Shorts and
      LinkedIn. For example: upload a 40-page contract and ask "What happens if I
      cancel early?"
- [ ] **Posts for each audience:** students, job seekers, freelancers and
      small businesses, renters and homeowners
- [ ] **Launch on Product Hunt** and share in relevant subreddits
      (r/productivity, r/GradSchool, r/smallbusiness) as "I built this"
- [ ] **Lead with the price** ("AI document chat for $1.99 a month") and
      with privacy (files aren't used to train AI, guest files are deleted after
      24 hours, signatures have an audit trail)
