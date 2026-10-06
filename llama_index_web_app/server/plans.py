"""
Plans and the free trial.

Every new account starts on a TRIAL_DAYS trial with usage caps. When the trial
ends the account is read-only (it can still list, view and delete documents)
until it is moved to the "pro" plan, which has no caps.
"""

import math
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import g, jsonify

from config import (
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


def questions_today(user_id):
    with connect_db() as conn:
        row = conn.execute(
            "SELECT questions FROM daily_usage WHERE user_id = ? AND day = ?", (user_id, _today())
        ).fetchone()
    return row["questions"] if row else 0


def record_question(user_id):
    with connect_db() as conn:
        conn.execute(
            """INSERT INTO daily_usage (user_id, day, questions) VALUES (?, ?, 1)
               ON CONFLICT(user_id, day) DO UPDATE SET questions = questions + 1""",
            (user_id, _today()),
        )


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
    }


def _limit_error(message, code, status):
    return jsonify({"error": message, "code": code}), status


def requires_active_plan(view):
    """Reject the request with 402 if the user's trial has ended."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if plan_status(g.user["id"])["state"] == STATE_EXPIRED:
            return _limit_error(
                "Your free trial has ended. Upgrade to keep uploading, chatting and converting.",
                "trial_expired",
                402,
            )
        return view(*args, **kwargs)
    return wrapper


def question_limit_error(user_id):
    """Error response if the user has used today's trial questions, else None."""
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
    if plan_status(user_id)["state"] == STATE_TRIAL and document_count >= TRIAL_MAX_DOCUMENTS:
        return _limit_error(
            f"The free trial allows up to {TRIAL_MAX_DOCUMENTS} documents. "
            "Delete one to upload another, or upgrade for unlimited documents.",
            "trial_document_limit",
            403,
        )
    return None
