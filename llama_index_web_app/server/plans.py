"""
Plans and the free trial.

Every new account starts on a TRIAL_DAYS trial with usage caps. When the trial
ends the account is read-only (it can still list, view and delete documents)
until it is moved to the "pro" plan, which has no caps.
"""

import math
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import g, jsonify, request

from config import (
    GUEST_CONVERSIONS_PER_HOUR,
    GUEST_IP_MAX_DOCUMENTS_PER_DAY,
    GUEST_IP_MAX_QUESTIONS_PER_DAY,
    GUEST_MAX_DOCUMENTS,
    GUEST_MAX_QUESTIONS,
    SUPPORT_EMAIL,
    TRIAL_DAYS,
    TRIAL_MAX_DOCUMENTS,
    TRIAL_MAX_QUESTIONS_PER_DAY,
)
from db import connect_db

PLAN_TRIAL = "trial"
PLAN_PRO = "pro"
PLANS = (PLAN_TRIAL, PLAN_PRO)

# What a user can do right now
STATE_TRIAL = "trial"      # trial running: full access within the caps
STATE_EXPIRED = "expired"  # trial over: read-only
STATE_PRO = "pro"          # paid: no caps


def _now():
    return datetime.now(timezone.utc)


def _today():
    return _now().date().isoformat()


def new_trial_end(days=TRIAL_DAYS):
    return (_now() + timedelta(days=days)).isoformat()


def init_plans():
    """Add plan columns to users (for databases created before trials) and the usage table."""
    with connect_db() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        if "plan" not in columns:
            conn.execute(f"ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT '{PLAN_TRIAL}'")
        if "trial_ends_at" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN trial_ends_at TEXT")
        # Accounts that existed before trials get a fresh trial
        conn.execute(
            "UPDATE users SET trial_ends_at = ? WHERE trial_ends_at IS NULL", (new_trial_end(),)
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS daily_usage (
                user_id TEXT NOT NULL,
                day TEXT NOT NULL,
                questions INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, day)
            )"""
        )
        usage_columns = {row["name"] for row in conn.execute("PRAGMA table_info(daily_usage)")}
        if "documents" not in usage_columns:
            conn.execute("ALTER TABLE daily_usage ADD COLUMN documents INTEGER NOT NULL DEFAULT 0")


def questions_today(user_id):
    with connect_db() as conn:
        row = conn.execute(
            "SELECT questions FROM daily_usage WHERE user_id = ? AND day = ?", (user_id, _today())
        ).fetchone()
    return row["questions"] if row else 0


def _increment(key, column):
    with connect_db() as conn:
        conn.execute(
            f"""INSERT INTO daily_usage (user_id, day, {column}) VALUES (?, ?, 1)
               ON CONFLICT(user_id, day) DO UPDATE SET {column} = {column} + 1""",
            (key, _today()),
        )


def _guest_address_key():
    """Usage key for the visitor's network address (guests can clear cookies)."""
    return f"ip:{request.remote_addr}"


def _is_guest():
    return bool(getattr(g, "user", None) and g.user.get("guest"))


def record_question(user_id):
    _increment(user_id, "questions")
    if _is_guest():
        _increment(_guest_address_key(), "questions")


def record_document(user_id):
    """Count a guest upload against their network address (accounts are capped by
    how many documents they currently have instead)."""
    if _is_guest():
        _increment(_guest_address_key(), "documents")


def _total_questions(key):
    with connect_db() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(questions), 0) AS total FROM daily_usage WHERE user_id = ?", (key,)
        ).fetchone()
    return row["total"]


def _today_usage(key, column):
    with connect_db() as conn:
        row = conn.execute(
            f"SELECT {column} FROM daily_usage WHERE user_id = ? AND day = ?", (key, _today())
        ).fetchone()
    return row[column] if row else 0


def plan_status(user_id):
    """Plan, trial timing, caps and today's usage for a user."""
    with connect_db() as conn:
        row = conn.execute(
            "SELECT plan, trial_ends_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()

    plan = row["plan"] if row else PLAN_TRIAL
    trial_ends_at = row["trial_ends_at"] if row else None

    if plan == PLAN_PRO:
        return {"plan": plan, "state": STATE_PRO, "support_email": SUPPORT_EMAIL}

    ends = datetime.fromisoformat(trial_ends_at) if trial_ends_at else _now()
    remaining = ends - _now()
    return {
        "plan": plan,
        "state": STATE_TRIAL if remaining.total_seconds() > 0 else STATE_EXPIRED,
        "trial_ends_at": ends.isoformat(),
        "trial_days_left": max(0, math.ceil(remaining.total_seconds() / 86400)),
        "limits": {
            "max_documents": TRIAL_MAX_DOCUMENTS,
            "max_questions_per_day": TRIAL_MAX_QUESTIONS_PER_DAY,
        },
        "usage": {"questions_today": questions_today(user_id)},
        "support_email": SUPPORT_EMAIL,
    }


def public_plan_info():
    """Trial terms shown on the homepage before anyone logs in."""
    return {
        "trial_days": TRIAL_DAYS,
        "trial_max_documents": TRIAL_MAX_DOCUMENTS,
        "trial_max_questions_per_day": TRIAL_MAX_QUESTIONS_PER_DAY,
        "guest_max_documents": GUEST_MAX_DOCUMENTS,
        "guest_max_questions": GUEST_MAX_QUESTIONS,
        # For "Forgot password?" help until password reset emails exist
        "support_email": SUPPORT_EMAIL,
    }


def _limit_error(message, code, status):
    return jsonify({"error": message, "code": code}), status


def requires_active_plan(view):
    """Reject the request with 402 if the user's trial has ended."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        # Guests have no trial; their limits are checked separately
        if not _is_guest() and plan_status(g.user["id"])["state"] == STATE_EXPIRED:
            return _limit_error(
                "Your free trial has ended. Upgrade to keep uploading, chatting and converting.",
                "trial_expired",
                402,
            )
        return view(*args, **kwargs)
    return wrapper


GUEST_SIGNUP_HINT = "Create a free account to keep going. Your document comes with you."


def question_limit_error(user_id):
    """Error response if the user has used today's trial questions, else None."""
    if _is_guest():
        if (_total_questions(user_id) >= GUEST_MAX_QUESTIONS
                or _today_usage(_guest_address_key(), "questions") >= GUEST_IP_MAX_QUESTIONS_PER_DAY):
            return _limit_error(
                f"You've used the {GUEST_MAX_QUESTIONS} free guest questions. {GUEST_SIGNUP_HINT}",
                "guest_limit",
                402,
            )
        return None

    status = plan_status(user_id)
    if status["state"] == STATE_TRIAL and status["usage"]["questions_today"] >= TRIAL_MAX_QUESTIONS_PER_DAY:
        return _limit_error(
            f"You've used today's {TRIAL_MAX_QUESTIONS_PER_DAY} trial questions. "
            "They reset at midnight UTC, or upgrade for unlimited questions.",
            "trial_question_limit",
            429,
        )
    return None


def document_limit_error(user_id, document_count):
    """Error response if the user already has the trial's maximum documents, else None."""
    if _is_guest():
        if (document_count >= GUEST_MAX_DOCUMENTS
                or _today_usage(_guest_address_key(), "documents") >= GUEST_IP_MAX_DOCUMENTS_PER_DAY):
            return _limit_error(
                f"Guests can chat with {GUEST_MAX_DOCUMENTS} "
                f"{'document' if GUEST_MAX_DOCUMENTS == 1 else 'documents'}. {GUEST_SIGNUP_HINT}",
                "guest_limit",
                402,
            )
        return None

    if plan_status(user_id)["state"] == STATE_TRIAL and document_count >= TRIAL_MAX_DOCUMENTS:
        return _limit_error(
            f"The free trial allows up to {TRIAL_MAX_DOCUMENTS} documents. "
            "Delete one to upload another, or upgrade for unlimited documents.",
            "trial_document_limit",
            403,
        )
    return None


# --- guest conversions -----------------------------------------------------------

_guest_conversions = {}
_guest_conversions_lock = threading.Lock()


def limit_guest_conversions(view):
    """Rate-limit converter routes for guests: GUEST_CONVERSIONS_PER_HOUR per address."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if _is_guest():
            now = time.time()
            key = request.remote_addr
            with _guest_conversions_lock:
                recent = [t for t in _guest_conversions.get(key, []) if now - t < 3600]
                if len(recent) >= GUEST_CONVERSIONS_PER_HOUR:
                    _guest_conversions[key] = recent
                    return _limit_error(
                        "You've reached the guest limit for conversions this hour. "
                        "Try again later, or create a free account.",
                        "guest_rate_limit",
                        429,
                    )
                recent.append(now)
                _guest_conversions[key] = recent
        return view(*args, **kwargs)
    return wrapper
