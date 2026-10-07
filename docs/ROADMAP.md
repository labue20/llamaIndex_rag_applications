# Dokkiman Roadmap

What's left to do, roughly in priority order. Live site: <https://dokkiman.com>

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
- [ ] **Ship the new logo.** The folded-page "D" logo and browser icons are
      ready locally. Commit them, merge to `master` and deploy.
- [ ] **Merge `dev` into `master`.** This includes the `setup.sh` Caddy log fix.
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

### Request signatures (the big one)

Next, if you want e-signature to be the main product: build "Request signatures". You enter
a signer's email, they get a link, sign in the browser without an account, and
everyone receives the signed copy with the audit trail. That needs an email
service (for example Resend or Amazon SES) and a few days of work, and it would
make "e-signature tool" fully true. It's also a natural thing to keep for Pro,
giving people a reason to upgrade.

Pieces to build:
- [ ] Email sending (Resend or Amazon SES), with a domain verified for
      `dokkiman.com` (SPF/DKIM records at Namecheap)
- [ ] Signature requests: the document, signers' emails, signing order, status
      (sent, viewed, signed, declined) and reminders
- [ ] A signing page that works from a private link, with no account needed
- [ ] The signed copy with the full audit trail (every signer, time and IP
      address, and the document fingerprint), emailed to everyone
- [ ] Limits per plan, for example Pro only or a few requests a month on Basic
- [ ] Terms and privacy policy updated to cover signers who don't have accounts

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
