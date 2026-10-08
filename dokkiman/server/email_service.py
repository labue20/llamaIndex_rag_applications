"""
Sending email (signing invitations, reminders and signed copies) through
Resend's API. Without RESEND_API_KEY, emails are written to the log instead,
so everything works in development; tests read them from `outbox`.
"""

import base64
import logging

import requests

import config

log = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
# Resend accepts up to 40 MB per email; keep well under for inboxes
MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

# Emails "sent" without a key (newest last); handy in development and tests
outbox = []


class EmailError(RuntimeError):
    """The email couldn't be sent."""


def email_enabled():
    return bool(config.RESEND_API_KEY)


def send_email(to, subject, html, text, attachments=None, reply_to=None):
    """Send one email. attachments: [(file_name, bytes)]. Raises EmailError."""
    attachments = [(name, data) for name, data in (attachments or []) if len(data) <= MAX_ATTACHMENT_BYTES]
    message = {
        "from": config.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    if reply_to:
        message["reply_to"] = reply_to
    if attachments:
        message["attachments"] = [
            {"filename": name, "content": base64.b64encode(data).decode()} for name, data in attachments
        ]

    if not email_enabled():
        outbox.append({**message, "attachments": attachments})
        # A warning, so it shows in the server output (where developers find signing links)
        log.warning("Email not sent (no RESEND_API_KEY) to %s: %s\n%s", to, subject, text)
        return None

    try:
        response = requests.post(
            RESEND_URL, json=message, timeout=15,
            headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
        )
    except requests.RequestException as e:
        raise EmailError(f"Couldn't reach the email service: {e}") from e
    if response.status_code >= 400:
        raise EmailError(f"The email service refused the email ({response.status_code}): {response.text[:300]}")
    return response.json().get("id")
