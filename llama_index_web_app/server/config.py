"""Settings shared across the backend modules."""

import os

# Largest upload (or any request body) the API accepts, in megabytes
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "50"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Free trial: every new account gets full access for TRIAL_DAYS, within these caps.
# When the trial ends the account is read-only until it is upgraded to "pro".
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "7"))
TRIAL_MAX_DOCUMENTS = int(os.environ.get("TRIAL_MAX_DOCUMENTS", "10"))
TRIAL_MAX_QUESTIONS_PER_DAY = int(os.environ.get("TRIAL_MAX_QUESTIONS_PER_DAY", "50"))

# Shown to users whose trial has ended (optional)
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "")

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
