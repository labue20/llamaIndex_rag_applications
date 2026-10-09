"""Settings shared across the backend modules."""

import os

# Largest upload (or any request body) the API accepts, in megabytes
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "50"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Free trial: every new account gets full access for TRIAL_DAYS, within these caps.
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "30"))
TRIAL_MAX_DOCUMENTS = int(os.environ.get("TRIAL_MAX_DOCUMENTS", "10"))
TRIAL_MAX_QUESTIONS_PER_DAY = int(os.environ.get("TRIAL_MAX_QUESTIONS_PER_DAY", "50"))

# Free plan: where accounts go when the trial ends (unless upgraded to Pro)
FREE_MAX_DOCUMENTS = int(os.environ.get("FREE_MAX_DOCUMENTS", "3"))
FREE_MAX_QUESTIONS_PER_DAY = int(os.environ.get("FREE_MAX_QUESTIONS_PER_DAY", "10"))
# Fair use of PDF to Word, Word to PDF, Split PDF and Sign PDF on the Free plan
FREE_CONVERSIONS_PER_DAY = int(os.environ.get("FREE_CONVERSIONS_PER_DAY", "20"))

# Basic plan: a low-cost tier between Free and Pro, with higher caps than Free
# and no limit on file conversions (US dollars)
BASIC_PRICE_MONTHLY = float(os.environ.get("BASIC_PRICE_MONTHLY", "1.99"))
BASIC_PRICE_YEARLY = float(os.environ.get("BASIC_PRICE_YEARLY", "19.99"))
BASIC_MAX_DOCUMENTS = int(os.environ.get("BASIC_MAX_DOCUMENTS", "25"))
BASIC_MAX_QUESTIONS_PER_DAY = int(os.environ.get("BASIC_MAX_QUESTIONS_PER_DAY", "50"))

# Yearly billing (Basic and Pro by the year, as well as by the month). Off:
# monthly only, which keeps pricing simple; the yearly prices below are then unused.
YEARLY_BILLING = os.environ.get("YEARLY_BILLING", "false").strip().lower() == "true"

# Pro plan prices shown on the pricing page (US dollars)
PRO_PRICE_MONTHLY = float(os.environ.get("PRO_PRICE_MONTHLY", "9.99"))
PRO_PRICE_YEARLY = float(os.environ.get("PRO_PRICE_YEARLY", "90"))
# Pro's "unlimited" questions are subject to fair use, so one very heavy
# account can't cost more in OpenAI usage than the plan earns (see the Terms)
PRO_FAIR_USE_QUESTIONS_PER_DAY = int(os.environ.get("PRO_FAIR_USE_QUESTIONS_PER_DAY", "150"))

# Admin portal (/admin): accounts allowed in, by email, comma-separated.
# Set in the server's .env; nobody is an admin without it.
ADMIN_EMAILS = {email.strip().lower() for email in os.environ.get("ADMIN_EMAILS", "").split(",") if email.strip()}

# Shown to users whose trial has ended (optional)
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "")

# Request signatures: send a PDF to other people to sign by email.
# Requests each account can send per calendar month (UTC); -1 = unlimited.
SIGNATURE_REQUESTS_PER_MONTH_TRIAL = int(os.environ.get("SIGNATURE_REQUESTS_PER_MONTH_TRIAL", "3"))
SIGNATURE_REQUESTS_PER_MONTH_FREE = int(os.environ.get("SIGNATURE_REQUESTS_PER_MONTH_FREE", "0"))
SIGNATURE_REQUESTS_PER_MONTH_BASIC = int(os.environ.get("SIGNATURE_REQUESTS_PER_MONTH_BASIC", "10"))
SIGNATURE_REQUESTS_PER_MONTH_PRO = int(os.environ.get("SIGNATURE_REQUESTS_PER_MONTH_PRO", "-1"))
# Pro's unlimited requests are subject to fair use (see the Terms)
PRO_FAIR_USE_SIGNATURE_REQUESTS_PER_MONTH = int(os.environ.get("PRO_FAIR_USE_SIGNATURE_REQUESTS_PER_MONTH", "200"))
# On every plan, at most this many requests a day per account (limits misuse
# of signing emails for spam or phishing)
SIGNATURE_REQUESTS_PER_DAY = int(os.environ.get("SIGNATURE_REQUESTS_PER_DAY", "10"))
# "Understand before you sign": signers can read an AI summary of the document
# and ask questions about it (senders can turn it off per request)
SIGNING_AI_QUESTIONS_PER_SIGNER = int(os.environ.get("SIGNING_AI_QUESTIONS_PER_SIGNER", "10"))
SIGNATURE_REQUEST_MAX_SIGNERS = int(os.environ.get("SIGNATURE_REQUEST_MAX_SIGNERS", "10"))
# Signing links stop working this many days after a request is sent
SIGNATURE_REQUEST_DAYS = int(os.environ.get("SIGNATURE_REQUEST_DAYS", "30"))
# Where request PDFs are kept (relative to server/)
SIGNATURE_REQUESTS_DIR = os.environ.get("SIGNATURE_REQUESTS_DIR", "signature_requests")

# Email (signing invitations and signed copies) through Resend (resend.com).
# Without a key, emails are written to the server log instead of being sent.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
# The sender; its domain must be verified in Resend (DNS records at your registrar)
# (Quote it in .env: EMAIL_FROM="Dokkiman <sign@dokkiman.com>"; the < > would break shell scripts)
EMAIL_FROM = os.environ.get("EMAIL_FROM", "Dokkiman <sign@dokkiman.com>").strip().strip("\"'")

# Guests (no account) can try the tools before signing up.
# Converters are rate-limited per network address; chat is capped per guest
# and per address (so clearing cookies doesn't reset it). Guest files are
# deleted after GUEST_FILE_HOURS, or moved into the account on sign-up/login.
GUEST_MAX_DOCUMENTS = int(os.environ.get("GUEST_MAX_DOCUMENTS", "1"))
GUEST_MAX_QUESTIONS = int(os.environ.get("GUEST_MAX_QUESTIONS", "5"))
GUEST_IP_MAX_DOCUMENTS_PER_DAY = int(os.environ.get("GUEST_IP_MAX_DOCUMENTS_PER_DAY", "3"))
GUEST_IP_MAX_QUESTIONS_PER_DAY = int(os.environ.get("GUEST_IP_MAX_QUESTIONS_PER_DAY", "15"))
GUEST_CONVERSIONS_PER_HOUR = int(os.environ.get("GUEST_CONVERSIONS_PER_HOUR", "20"))
GUEST_FILE_HOURS = int(os.environ.get("GUEST_FILE_HOURS", "24"))

# Number of reverse proxies in front of the API (Caddy in production = 1), so
# the real visitor address is used for rate limits instead of the proxy's.
TRUSTED_PROXY_COUNT = int(os.environ.get("TRUSTED_PROXY_COUNT", "0"))

# Sign-in with Google: the OAuth client ID from Google Cloud Console
# (APIs & Services > Credentials). Leave empty to turn Google sign-in off.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()

# Accounts are created and signed in with Google. Set to true to also allow
# email + password (handy for local development without a Google client ID).
PASSWORD_LOGIN_ENABLED = os.environ.get("PASSWORD_LOGIN_ENABLED", "false").lower() == "true"

# Online payments with Stripe. Without a key, "Upgrade to Pro" emails you instead.
# Use restricted keys (rk_...) where possible; never commit keys.
#   STRIPE_MODE=test (default) uses STRIPE_SECRET_TEST_KEY  (sk_test_/rk_test_)
#   STRIPE_MODE=live           uses STRIPE_SECRET_KEY       (sk_live_/rk_live_)
# Defaulting to test means a development machine can't charge real cards.
STRIPE_MODE = os.environ.get("STRIPE_MODE", "test").strip().lower()
STRIPE_CONFIG_ERROR = ""


def _stripe_key():
    """The key for STRIPE_MODE, or "" (payments off) if it's missing or the wrong kind."""
    global STRIPE_CONFIG_ERROR
    if STRIPE_MODE not in ("test", "live"):
        STRIPE_CONFIG_ERROR = f"STRIPE_MODE must be test or live, not {STRIPE_MODE!r}"
        return ""
    name = "STRIPE_SECRET_TEST_KEY" if STRIPE_MODE == "test" else "STRIPE_SECRET_KEY"
    key = os.environ.get(name, "").strip()
    if key and f"_{STRIPE_MODE}_" not in key:
        STRIPE_CONFIG_ERROR = f"{name} isn't a {STRIPE_MODE}-mode key; online payments are off"
        return ""
    return key


# The key actually used (the rest of the app reads only this)
STRIPE_SECRET_KEY = _stripe_key()
# Signing secret of the webhook endpoint (whsec_...): from `stripe listen` when
# testing locally, or from the endpoint created by stripe_setup.py in production
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
# Customer portal settings created by stripe_setup.py (empty = account default)
STRIPE_PORTAL_CONFIGURATION = os.environ.get("STRIPE_PORTAL_CONFIGURATION", "").strip()
# Where the React app is, for Stripe's return links
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")
