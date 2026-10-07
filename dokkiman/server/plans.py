"""
Plans: the free trial, the Free plan, Basic and Pro.

Every new account starts on a TRIAL_DAYS trial with generous caps. When the
trial ends the account moves to the Free plan, with smaller caps, until it is
moved to a paid plan: "basic" (low-cost, higher caps than Free, unlimited
conversions) or "pro" (no caps, apart from a fair-use limit on questions).
A paid plan can have an end date (pro_until, set by Stripe payments or by
manage_users.py); after it the account is back on Free.
"""

import math
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import current_app, g, jsonify, request

from config import (
    FREE_CONVERSIONS_PER_DAY,
    FREE_MAX_DOCUMENTS,
    FREE_MAX_QUESTIONS_PER_DAY,
    BASIC_MAX_DOCUMENTS,
    BASIC_MAX_QUESTIONS_PER_DAY,
    BASIC_PRICE_MONTHLY,
    BASIC_PRICE_YEARLY,
    GUEST_CONVERSIONS_PER_HOUR,
    GUEST_FILE_HOURS,
    GUEST_IP_MAX_DOCUMENTS_PER_DAY,
    GUEST_IP_MAX_QUESTIONS_PER_DAY,
    GUEST_MAX_DOCUMENTS,
    GUEST_MAX_QUESTIONS,
    PRO_FAIR_USE_QUESTIONS_PER_DAY,
    PRO_PRICE_MONTHLY,
    PRO_PRICE_YEARLY,
    SUPPORT_EMAIL,
    TRIAL_DAYS,
    TRIAL_MAX_DOCUMENTS,
    TRIAL_MAX_QUESTIONS_PER_DAY,
)
import config
from db import connect_db

PLAN_TRIAL = "trial"
PLAN_BASIC = "basic"
PLAN_PRO = "pro"
PLANS = (PLAN_TRIAL, PLAN_BASIC, PLAN_PRO)
PAID_PLANS = (PLAN_BASIC, PLAN_PRO)

# What a user can do right now
STATE_TRIAL = "trial"  # trial running: full access within generous caps
STATE_FREE = "free"    # trial over, not upgraded: the Free plan's smaller caps
STATE_BASIC = "basic"    # paid, low-cost: higher caps than Free, unlimited conversions
STATE_PRO = "pro"      # paid: no caps


def _count(number, word):
    """'1 question', '10 questions'."""
    return f"{number} {word}{'' if number == 1 else 's'}"


def _limits(state):
    """Caps for a state (None = no caps)."""
    if state == STATE_TRIAL:
        return {"max_documents": TRIAL_MAX_DOCUMENTS, "max_questions_per_day": TRIAL_MAX_QUESTIONS_PER_DAY,
                "max_conversions_per_day": None}
    if state == STATE_FREE:
        return {"max_documents": FREE_MAX_DOCUMENTS, "max_questions_per_day": FREE_MAX_QUESTIONS_PER_DAY,
                "max_conversions_per_day": FREE_CONVERSIONS_PER_DAY}
    if state == STATE_BASIC:
        return {"max_documents": BASIC_MAX_DOCUMENTS, "max_questions_per_day": BASIC_MAX_QUESTIONS_PER_DAY,
                "max_conversions_per_day": None}
    return None


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
        # When a paid (Basic or Pro) period ends (NULL = no end date)
        if "pro_until" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN pro_until TEXT")
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
        if "conversions" not in usage_columns:
            conn.execute("ALTER TABLE daily_usage ADD COLUMN conversions INTEGER NOT NULL DEFAULT 0")
        _delete_old_anonymous_usage(conn)


def questions_today(user_id):
    with connect_db() as conn:
        row = conn.execute(
            "SELECT questions FROM daily_usage WHERE user_id = ? AND day = ?", (user_id, _today())
        ).fetchone()
    return row["questions"] if row else 0


# Usage counts of visitors without an account (guest IDs and network
# addresses) are deleted after this many days, as the privacy policy says
ANONYMOUS_USAGE_DAYS = 30


def _delete_old_anonymous_usage(conn):
    cutoff = (_now() - timedelta(days=ANONYMOUS_USAGE_DAYS)).date().isoformat()
    conn.execute(
        "DELETE FROM daily_usage WHERE day < ? AND (user_id LIKE 'ip:%' OR user_id LIKE 'guest\\_%' ESCAPE '\\')",
        (cutoff,),
    )


def _increment(key, column):
    with connect_db() as conn:
        conn.execute(
            f"""INSERT INTO daily_usage (user_id, day, {column}) VALUES (?, ?, 1)
               ON CONFLICT(user_id, day) DO UPDATE SET {column} = {column} + 1""",
            (key, _today()),
        )
        _delete_old_anonymous_usage(conn)


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
            "SELECT plan, trial_ends_at, pro_until FROM users WHERE id = ?", (user_id,)
        ).fetchone()

    plan = row["plan"] if row else PLAN_TRIAL
    trial_ends_at = row["trial_ends_at"] if row else None
    pro_until = datetime.fromisoformat(row["pro_until"]) if row and row["pro_until"] else None

    # Basic or Pro until the paid period ends; after that the account is on its trial or Free
    if plan in PAID_PLANS and (pro_until is None or pro_until > _now()):
        status = {"plan": plan, "state": plan, "limits": _limits(plan),
                  "pro_until": pro_until.isoformat() if pro_until else None, "support_email": SUPPORT_EMAIL}
        if plan == PLAN_BASIC:
            status["usage"] = {"questions_today": questions_today(user_id),
                               "conversions_today": _today_usage(user_id, "conversions")}
        return status

    ends = datetime.fromisoformat(trial_ends_at) if trial_ends_at else _now()
    remaining = ends - _now()
    state = STATE_TRIAL if remaining.total_seconds() > 0 else STATE_FREE
    return {
        "plan": plan,
        "state": state,
        "trial_ends_at": ends.isoformat(),
        "trial_days_left": max(0, math.ceil(remaining.total_seconds() / 86400)),
        "limits": _limits(state),
        "usage": {
            "questions_today": questions_today(user_id),
            "conversions_today": _today_usage(user_id, "conversions"),
        },
        "support_email": SUPPORT_EMAIL,
    }


def public_plan_info():
    """Plan terms and prices shown on the homepage and pricing page."""
    return {
        "trial_days": TRIAL_DAYS,
        "free_max_documents": FREE_MAX_DOCUMENTS,
        "free_max_questions_per_day": FREE_MAX_QUESTIONS_PER_DAY,
        "free_conversions_per_day": FREE_CONVERSIONS_PER_DAY,
        "basic_price_monthly": BASIC_PRICE_MONTHLY,
        "basic_price_yearly": BASIC_PRICE_YEARLY,
        "basic_max_documents": BASIC_MAX_DOCUMENTS,
        "basic_max_questions_per_day": BASIC_MAX_QUESTIONS_PER_DAY,
        "pro_price_monthly": PRO_PRICE_MONTHLY,
        "pro_price_yearly": PRO_PRICE_YEARLY,
        "pro_fair_use_questions_per_day": PRO_FAIR_USE_QUESTIONS_PER_DAY,
        # Pay online with Stripe; otherwise upgrades are by email
        "online_payments": bool(config.STRIPE_SECRET_KEY),
        "guest_conversions_per_hour": GUEST_CONVERSIONS_PER_HOUR,
        "trial_max_documents": TRIAL_MAX_DOCUMENTS,
        "trial_max_questions_per_day": TRIAL_MAX_QUESTIONS_PER_DAY,
        "guest_max_documents": GUEST_MAX_DOCUMENTS,
        "guest_max_questions": GUEST_MAX_QUESTIONS,
        # For "Forgot password?" help and the privacy policy's contact details
        "support_email": SUPPORT_EMAIL,
        # How long guests' files are kept (privacy policy)
        "guest_file_hours": GUEST_FILE_HOURS,
    }


def _limit_error(message, code, status):
    return jsonify({"error": message, "code": code}), status


# Account limits answer 402 ("upgrade needed"), which opens the Upgrade dialog in the app
UPGRADE_STATUS = 402
PLAN_NAMES = {STATE_TRIAL: "free trial", STATE_FREE: "Free plan", STATE_BASIC: "Basic plan"}


GUEST_SIGNUP_HINT = "Create a free account to keep going. Your document comes with you."


def question_limit_error(user_id):
    """Error response if the user has used today's questions for their plan, else None."""
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
    if status["state"] == STATE_PRO:
        # Fair use: not an upgrade question, so 429 rather than 402
        if questions_today(user_id) >= PRO_FAIR_USE_QUESTIONS_PER_DAY:
            contact = f" If you need more, contact us at {SUPPORT_EMAIL}." if SUPPORT_EMAIL else ""
            return _limit_error(
                f"You've asked {_count(PRO_FAIR_USE_QUESTIONS_PER_DAY, 'question')} today, the fair-use limit for Pro. "
                f"You can ask more after midnight UTC.{contact}",
                "fair_use_limit",
                429,
            )
        return None
    limits = status["limits"]
    if limits and status["usage"]["questions_today"] >= limits["max_questions_per_day"]:
        return _limit_error(
            f"You've used today's {_count(limits['max_questions_per_day'], 'question')} on the "
            f"{PLAN_NAMES[status['state']]}. They reset at midnight UTC, or upgrade to Pro for unlimited questions.",
            "question_limit",
            UPGRADE_STATUS,
        )
    return None


def document_limit_error(user_id, document_count):
    """Error response if the user already has their plan's maximum documents, else None."""
    if _is_guest():
        if (document_count >= GUEST_MAX_DOCUMENTS
                or _today_usage(_guest_address_key(), "documents") >= GUEST_IP_MAX_DOCUMENTS_PER_DAY):
            return _limit_error(
                f"Guests can chat with {_count(GUEST_MAX_DOCUMENTS, 'document')}. {GUEST_SIGNUP_HINT}",
                "guest_limit",
                402,
            )
        return None

    status = plan_status(user_id)
    limits = status["limits"]
    if limits and document_count >= limits["max_documents"]:
        return _limit_error(
            f"The {PLAN_NAMES[status['state']]} allows up to {_count(limits['max_documents'], 'document')}. "
            "Delete one to upload another, or upgrade to Pro for unlimited documents.",
            "document_limit",
            UPGRADE_STATUS,
        )
    return None


# --- conversions (PDF to Word, Word to PDF, Split PDF, Sign PDF) -----------------

_guest_conversions = {}
_guest_conversions_lock = threading.Lock()


def limit_conversions(view):
    """Guests: GUEST_CONVERSIONS_PER_HOUR per network address. Free plan:
    FREE_CONVERSIONS_PER_DAY per account (only successful ones count).
    Trial, Basic and Pro: no limit."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not _is_guest():
            user_id = g.user["id"]
            status = plan_status(user_id)
            cap = (status["limits"] or {}).get("max_conversions_per_day")
            if cap is None:
                return view(*args, **kwargs)
            if status["usage"]["conversions_today"] >= cap:
                return _limit_error(
                    f"You've used today's {_count(cap, 'file conversion')} on the Free plan. "
                    "They reset at midnight UTC, or upgrade to Pro for unlimited use.",
                    "conversion_limit",
                    UPGRADE_STATUS,
                )
            response = current_app.make_response(view(*args, **kwargs))
            if response.status_code < 400:
                _increment(user_id, "conversions")
            return response

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
