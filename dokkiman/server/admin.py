"""
Admin portal: how the service is doing, and looking after accounts.

Only accounts listed in ADMIN_EMAILS get in; for everyone else these routes
don't exist (404). Every change an admin makes is written to admin_actions.

- GET  /admin/stats                      sign-ups, plans, revenue, E-Sign and document totals
- GET  /admin/users?q=&state=&page=      accounts (search by email, or by a signature request's ID)
- GET  /admin/users/<id>                 one account: plan, billing, usage, recent requests
- POST /admin/users/<id>/extend-trial    {days}
- POST /admin/users/<id>/grant-plan      {plan, months}: Basic or Pro without paying (not over a subscription)
- POST /admin/users/<id>/end-plan        ends a granted plan (not a subscription; that's cancelled in Stripe)
- POST /admin/users/<id>/sign-out        signs the account out on every device

Admins see account details and counts, not documents or their contents.
"""

import logging
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request

import config
from billing import ACTIVE_STATUSES, billing_info
from db import connect_db
from plans import PAID_PLANS, PLAN_TRIAL, STATE_FREE, STATE_TRIAL, plan_status, signature_request_usage

log = logging.getLogger(__name__)

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

PAGE_SIZE = 50
SIGNUP_DAYS = 30
MAX_TRIAL_DAYS = 365
MAX_GRANT_MONTHS = 24
# last_seen_at is written at most this often per account
SEEN_EVERY = timedelta(hours=1)


def _now():
    return datetime.now(timezone.utc)


def is_admin(user):
    return bool(user and not user.get("guest") and (user.get("email") or "").lower() in config.ADMIN_EMAILS)


def init_admin():
    with connect_db() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        # When the account last used the app (to the hour), for "active users"
        if "last_seen_at" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN last_seen_at TEXT")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS admin_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_email TEXT NOT NULL,
                action TEXT NOT NULL,
                user_id TEXT,
                user_email TEXT,
                detail TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )"""
        )


def record_seen(user_id):
    """Note that the account is using the app (one write an hour at most)."""
    now = _now()
    with connect_db() as conn:
        conn.execute(
            "UPDATE users SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)",
            (now.isoformat(), user_id, (now - SEEN_EVERY).isoformat()),
        )


def _error(message, status, code=None):
    body = {"error": message}
    if code:
        body["code"] = code
    return jsonify(body), status


@admin_bp.before_request
def _admins_only():
    if not is_admin(getattr(g, "user", None)):
        return _error("Not found", 404)
    # Changes only as JSON, which another site can't send with the admin's cookie
    if request.method == "POST" and request.get_json(silent=True) is None:
        return _error("Send the details as JSON.", 400)
    return None


def _log_action(action, user, detail=""):
    with connect_db() as conn:
        conn.execute(
            "INSERT INTO admin_actions (admin_email, action, user_id, user_email, detail, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (g.user["email"], action, user["id"], user["email"], detail, _now().isoformat()),
        )
    log.info("Admin %s: %s on account %s %s", g.user["email"], action, user["id"], detail)


def _recent_actions(user_id=None, limit=10):
    query = "SELECT admin_email, action, user_id, user_email, detail, created_at FROM admin_actions"
    params = []
    if user_id:
        query += " WHERE user_id = ?"
        params.append(user_id)
    with connect_db() as conn:
        rows = conn.execute(query + " ORDER BY id DESC LIMIT ?", (*params, limit)).fetchall()
    return [dict(row) for row in rows]


def _document_counts():
    """{owner_id: documents} from the index server, or None if it can't be reached."""
    try:
        return current_app.config["INDEX_MANAGER"]().document_counts()._getvalue()
    except Exception:  # the index server is down or restarting
        log.exception("Admin: couldn't get document counts")
        return None


# The plan state of each account in SQL, matching plans.plan_status
_STATE_SQL = (
    "CASE WHEN plan IN ({paid}) AND (pro_until IS NULL OR pro_until > :now) THEN plan"
    " WHEN trial_ends_at > :now THEN '{trial}' ELSE '{free}' END"
).format(paid=", ".join(f"'{p}'" for p in PAID_PLANS), trial=STATE_TRIAL, free=STATE_FREE)
STATES = (STATE_TRIAL, STATE_FREE, *PAID_PLANS)


def _monthly_price(plan, interval):
    if plan == "basic":
        return config.BASIC_PRICE_YEARLY / 12 if interval == "yearly" else config.BASIC_PRICE_MONTHLY
    return config.PRO_PRICE_YEARLY / 12 if interval == "yearly" else config.PRO_PRICE_MONTHLY


@admin_bp.route("/stats", methods=["GET"])
def stats():
    now = _now()
    today = now.date()
    params = {"now": now.isoformat()}
    with connect_db() as conn:
        one = lambda sql, p=(): conn.execute(sql, p).fetchone()[0]  # noqa: E731
        users = {
            "total": one("SELECT COUNT(*) FROM users"),
            "new_today": one("SELECT COUNT(*) FROM users WHERE created_at >= ?", (today.isoformat(),)),
            "new_7_days": one("SELECT COUNT(*) FROM users WHERE created_at >= ?",
                              ((now - timedelta(days=7)).isoformat(),)),
            "new_30_days": one("SELECT COUNT(*) FROM users WHERE created_at >= ?",
                               ((now - timedelta(days=30)).isoformat(),)),
            "active_7_days": one("SELECT COUNT(*) FROM users WHERE last_seen_at >= ?",
                                 ((now - timedelta(days=7)).isoformat(),)),
            "by_state": {state: 0 for state in STATES},
        }
        for row in conn.execute(f"SELECT {_STATE_SQL} AS state, COUNT(*) AS n FROM users GROUP BY state", params):
            users["by_state"][row["state"]] = row["n"]

        first_day = today - timedelta(days=SIGNUP_DAYS - 1)
        by_day = {row["day"]: row["n"] for row in conn.execute(
            "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day",
            (first_day.isoformat(),))}
        signups = [{"day": (first_day + timedelta(days=i)).isoformat(),
                    "count": by_day.get((first_day + timedelta(days=i)).isoformat(), 0)} for i in range(SIGNUP_DAYS)]

        # Paying = a Stripe subscription that's active; granted = a paid plan given by an admin
        paying = {plan: 0 for plan in PAID_PLANS}
        mrr = 0.0
        cancelling = past_due = granted = 0
        for row in conn.execute(
            f"SELECT plan, stripe_subscription_id, subscription_status, subscription_interval, cancel_at_period_end"
            f" FROM users WHERE {_STATE_SQL} NOT IN (:trial, :free)",
            {**params, "trial": STATE_TRIAL, "free": STATE_FREE},
        ):
            if row["stripe_subscription_id"] and row["subscription_status"] in ACTIVE_STATUSES:
                paying[row["plan"]] += 1
                mrr += _monthly_price(row["plan"], row["subscription_interval"])
                cancelling += bool(row["cancel_at_period_end"])
                past_due += row["subscription_status"] == "past_due"
            else:
                granted += 1

        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        requests_by_status = {row["status"]: row["n"] for row in conn.execute(
            "SELECT CASE WHEN status = 'sent' AND expires_at < ? THEN 'expired' ELSE status END AS status,"
            " COUNT(*) AS n FROM signature_requests GROUP BY 1", (params["now"],))}
        signature_requests = {
            "total": one("SELECT COUNT(*) FROM signature_requests"),
            "this_month": one("SELECT COUNT(*) FROM signature_requests WHERE created_at >= ?", (month_start,)),
            "by_status": requests_by_status,
            "senders": one("SELECT COUNT(DISTINCT owner_id) FROM signature_requests"),
            "ai_summaries": one("SELECT COUNT(*) FROM signature_requests WHERE ai_summary IS NOT NULL"),
            "ai_questions": one("SELECT COALESCE(SUM(ai_questions), 0) FROM signature_request_signers"),
        }
        signed_pdfs = one("SELECT COUNT(*) FROM signature_audit")
        questions_30_days = one(
            "SELECT COALESCE(SUM(questions), 0) FROM daily_usage WHERE day >= ? AND user_id IN (SELECT id FROM users)",
            ((today - timedelta(days=29)).isoformat(),))

    counts = _document_counts()
    return jsonify({
        "users": users,
        "signups_by_day": signups,
        "revenue": {"paying": paying, "paying_total": sum(paying.values()), "mrr": round(mrr, 2),
                    "cancelling": cancelling, "past_due": past_due, "granted": granted},
        "signature_requests": signature_requests,
        "documents": {"total": sum(counts.values()) if counts is not None else None, "signed_pdfs": signed_pdfs,
                      "ai_questions_30_days": questions_30_days},
        "recent_actions": _recent_actions(),
        "generated_at": now.isoformat(),
    })


def _user_row(row, counts):
    return {
        "id": row["id"],
        "email": row["email"],
        "created_at": row["created_at"],
        "last_seen_at": row["last_seen_at"],
        "state": row["state"],
        "sign_in": "password" if row["password_hash"] else "google",
        "subscription_status": row["subscription_status"],
        "cancel_at_period_end": bool(row["cancel_at_period_end"]),
        "signature_requests": row["requests"],
        "documents": counts.get(row["id"], 0) if counts is not None else None,
        "is_admin": row["email"].lower() in config.ADMIN_EMAILS,
    }


_USER_COLUMNS = (f"u.id, u.email, u.created_at, u.last_seen_at, u.password_hash, u.subscription_status,"
                 f" u.cancel_at_period_end, {_STATE_SQL} AS state,"
                 f" (SELECT COUNT(*) FROM signature_requests r WHERE r.owner_id = u.id) AS requests")


@admin_bp.route("/users", methods=["GET"])
def users():
    q = request.args.get("q", "").strip().lower()[:200]
    state = request.args.get("state", "")
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    where, params = [], {"now": _now().isoformat()}
    if q:
        # An email (or part of one), or the ID of a signature request (from an abuse report)
        where.append("(u.email LIKE :like ESCAPE '\\' OR u.id = :q"
                     " OR u.id IN (SELECT owner_id FROM signature_requests WHERE id = :q))")
        params["like"] = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        params["q"] = q
    if state in STATES:
        where.append(f"{_STATE_SQL} = :state")
        params["state"] = state
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    with connect_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM users u{clause}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT {_USER_COLUMNS} FROM users u{clause} ORDER BY u.created_at DESC LIMIT :limit OFFSET :offset",
            {**params, "limit": PAGE_SIZE, "offset": (page - 1) * PAGE_SIZE},
        ).fetchall()
    counts = _document_counts()
    return jsonify({"users": [_user_row(row, counts) for row in rows], "total": total, "page": page,
                    "page_size": PAGE_SIZE})


def _find_user(user_id):
    with connect_db() as conn:
        row = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def _user_detail(user_id):
    with connect_db() as conn:
        row = conn.execute(f"SELECT {_USER_COLUMNS} FROM users u WHERE u.id = :id",
                           {"id": user_id, "now": _now().isoformat()}).fetchone()
        if row is None:
            return None
        requests_by_status = {r["status"]: r["n"] for r in conn.execute(
            "SELECT CASE WHEN status = 'sent' AND expires_at < ? THEN 'expired' ELSE status END AS status,"
            " COUNT(*) AS n FROM signature_requests WHERE owner_id = ? GROUP BY 1", (_now().isoformat(), user_id))}
        recent_requests = [dict(r) for r in conn.execute(
            "SELECT r.id, CASE WHEN r.status = 'sent' AND r.expires_at < ? THEN 'expired' ELSE r.status END AS status,"
            " r.created_at, (SELECT COUNT(*) FROM signature_request_signers s WHERE s.request_id = r.id) AS signers"
            " FROM signature_requests r WHERE r.owner_id = ? ORDER BY r.created_at DESC LIMIT 10",
            (_now().isoformat(), user_id))]
        folders = conn.execute("SELECT COUNT(*) FROM folders WHERE owner_id = ?", (user_id,)).fetchone()[0]
        signed_pdfs = conn.execute("SELECT COUNT(*) FROM signature_audit WHERE user_id = ?", (user_id,)).fetchone()[0]
        questions = conn.execute("SELECT COALESCE(SUM(questions), 0) FROM daily_usage WHERE user_id = ?",
                                 (user_id,)).fetchone()[0]
    status = plan_status(user_id)
    return {
        **_user_row(row, _document_counts()),
        "plan": status,
        "billing": billing_info(user_id),
        "signature_request_usage": signature_request_usage(user_id, status["state"]),
        "signature_requests_by_status": requests_by_status,
        "recent_signature_requests": recent_requests,
        "folders": folders,
        "signed_pdfs": signed_pdfs,
        "ai_questions_total": questions,
        "admin_actions": _recent_actions(user_id, limit=20),
    }


@admin_bp.route("/users/<user_id>", methods=["GET"])
def user(user_id):
    detail = _user_detail(user_id)
    if detail is None:
        return _error("No such account.", 404)
    return jsonify({"user": detail})


def _target(user_id):
    user = _find_user(user_id)
    return user, (None if user else _error("No such account.", 404))


def _int_field(data, name, low, high):
    try:
        value = int(data.get(name))
    except (TypeError, ValueError):
        return None
    return value if low <= value <= high else None


def _has_subscription(user_id):
    billing = billing_info(user_id)
    return bool(billing and billing["has_subscription"] and billing["status"] in ACTIVE_STATUSES)


@admin_bp.route("/users/<user_id>/extend-trial", methods=["POST"])
def extend_trial(user_id):
    user, error = _target(user_id)
    if error:
        return error
    days = _int_field(request.get_json(), "days", 1, MAX_TRIAL_DAYS)
    if days is None:
        return _error(f"Days must be a whole number from 1 to {MAX_TRIAL_DAYS}.", 400)
    now = _now()
    with connect_db() as conn:
        row = conn.execute("SELECT trial_ends_at FROM users WHERE id = ?", (user_id,)).fetchone()
        current_end = datetime.fromisoformat(row["trial_ends_at"]) if row["trial_ends_at"] else now
        # From today if the trial already ended, otherwise from its current end
        new_end = max(current_end, now) + timedelta(days=days)
        conn.execute("UPDATE users SET trial_ends_at = ? WHERE id = ?", (new_end.isoformat(), user_id))
    _log_action("extend_trial", user, f"+{days} days, ends {new_end:%Y-%m-%d}")
    return jsonify({"user": _user_detail(user_id)})


def _add_months(when, months):
    """Same day of the month, `months` later (the 31st becomes the month's last day)."""
    month_index = when.month - 1 + months
    year, month = when.year + month_index // 12, month_index % 12 + 1
    days_in_month = (datetime(year + month // 12, month % 12 + 1, 1) - timedelta(days=1)).day
    return when.replace(year=year, month=month, day=min(when.day, days_in_month))


@admin_bp.route("/users/<user_id>/grant-plan", methods=["POST"])
def grant_plan(user_id):
    user, error = _target(user_id)
    if error:
        return error
    data = request.get_json()
    plan = data.get("plan")
    months = _int_field(data, "months", 1, MAX_GRANT_MONTHS)
    if plan not in PAID_PLANS or months is None:
        return _error(f"Choose Basic or Pro, for 1 to {MAX_GRANT_MONTHS} months.", 400)
    # Stripe sets the plan of subscribers; a grant would be overwritten (or overwrite it)
    if _has_subscription(user_id):
        return _error("This account has a Stripe subscription. Change its plan in the Stripe Dashboard.", 409,
                      "has_subscription")
    until = _add_months(_now(), months)
    with connect_db() as conn:
        conn.execute("UPDATE users SET plan = ?, pro_until = ? WHERE id = ?", (plan, until.isoformat(), user_id))
    _log_action("grant_plan", user, f"{plan} for {months} month{'s' if months != 1 else ''}, until {until:%Y-%m-%d}")
    return jsonify({"user": _user_detail(user_id)})


@admin_bp.route("/users/<user_id>/end-plan", methods=["POST"])
def end_plan(user_id):
    user, error = _target(user_id)
    if error:
        return error
    if _has_subscription(user_id):
        return _error("This account pays through Stripe. Cancel the subscription in the Stripe Dashboard.", 409,
                      "has_subscription")
    with connect_db() as conn:
        conn.execute("UPDATE users SET plan = ?, pro_until = NULL WHERE id = ?", (PLAN_TRIAL, user_id))
    _log_action("end_plan", user, "back to its trial, or the Free plan")
    return jsonify({"user": _user_detail(user_id)})


@admin_bp.route("/users/<user_id>/sign-out", methods=["POST"])
def sign_out(user_id):
    user, error = _target(user_id)
    if error:
        return error
    with connect_db() as conn:
        conn.execute("UPDATE users SET session_version = session_version + 1 WHERE id = ?", (user_id,))
    _log_action("sign_out", user, "signed out on every device")
    return jsonify({"user": _user_detail(user_id)})
