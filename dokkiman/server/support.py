"""
The Support form: people tell us how we can help. Each message is kept and
emailed to SUPPORT_EMAIL with Reply-To set to the sender, so answering is just
replying. Open to everyone (no account needed), so it's limited per network
address, and a hidden field catches simple bots. No email goes to the address
typed in, so the form can't be used to send mail to strangers.
"""

import html
import re
import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request, session

import config
from auth_limits import record_attempt, recent_attempts
from db import connect_db
from email_service import EmailError, send_email

support_bp = Blueprint("support", __name__)

TOPICS = {
    "tool": "Question about a tool",
    "account": "Account & sign-in",
    "billing": "Billing & plans",
    "problem": "Report a problem",
    "feature": "Suggest a feature",
    "other": "Other",
}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_NAME = 100
MAX_EMAIL = 254
MIN_MESSAGE = 10
MAX_MESSAGE = 5000
KIND_SUPPORT = "support-address"
MAX_MESSAGES_PER_HOUR = 5


def init_support():
    with connect_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS support_messages (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                user_id TEXT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                topic TEXT NOT NULL,
                message TEXT NOT NULL,
                emailed INTEGER NOT NULL DEFAULT 0
            )"""
        )


def _error(message, status=400):
    return jsonify({"error": message}), status


@support_bp.route("/support", methods=["POST"])
def send_support_message():
    data = request.get_json(silent=True) or {}
    # Bots fill in every field, including this one people never see
    if str(data.get("website", "")).strip():
        return jsonify({"sent": True}), 200

    name = " ".join(str(data.get("name", "")).split())[:MAX_NAME]
    email = str(data.get("email", "")).strip().lower()
    topic = str(data.get("topic", ""))
    message = str(data.get("message", "")).strip()

    if len(email) > MAX_EMAIL or not EMAIL_RE.match(email):
        return _error("Enter your email address, so we can reply.")
    if topic not in TOPICS:
        return _error("Choose what your message is about.")
    if len(message) < MIN_MESSAGE:
        return _error("Tell us a little more, so we can help.")
    if len(message) > MAX_MESSAGE:
        return _error(f"Messages can be up to {MAX_MESSAGE} characters.")
    if recent_attempts(KIND_SUPPORT, request.remote_addr, 3600) >= MAX_MESSAGES_PER_HOUR:
        return _error("You've sent several messages in the last hour. Please wait a little before sending another.",
                      429)
    record_attempt(KIND_SUPPORT, request.remote_addr)

    message_id = uuid.uuid4().hex
    user_id = session.get("user_id")  # signed in: helps us find their account
    with connect_db() as conn:
        conn.execute(
            "INSERT INTO support_messages (id, created_at, user_id, name, email, topic, message)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (message_id, datetime.now(timezone.utc).isoformat(), user_id, name, email, topic, message),
        )

    if config.SUPPORT_EMAIL:
        sender = name or email
        subject = f"[Support] {TOPICS[topic]}: {sender}"
        account = f"Signed in as account {user_id}" if user_id else "Not signed in"
        text = f"From: {sender} <{email}>\nTopic: {TOPICS[topic]}\n{account}\n\n{message}\n"
        body = (
            f"<p><strong>From:</strong> {html.escape(sender)} &lt;{html.escape(email)}&gt;<br>"
            f"<strong>Topic:</strong> {html.escape(TOPICS[topic])}<br>{html.escape(account)}</p>"
            f"<p style=\"white-space:pre-wrap\">{html.escape(message)}</p>"
            "<p style=\"color:#64748b;font-size:12px\">Reply to this email to answer them.</p>"
        )
        try:
            send_email(config.SUPPORT_EMAIL, subject, body, text, reply_to=email)
            with connect_db() as conn:
                conn.execute("UPDATE support_messages SET emailed = 1 WHERE id = ?", (message_id,))
        except EmailError:
            # It's kept either way; the admin can find it
            current_app.logger.exception("Support email failed")
    return jsonify({"sent": True}), 200
