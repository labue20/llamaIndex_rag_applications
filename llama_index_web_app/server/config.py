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
