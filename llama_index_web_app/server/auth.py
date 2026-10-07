"""
User accounts and session authentication for the Flask API.

Users live in a small SQLite database; passwords are hashed with werkzeug.
Logged-in state is kept in Flask's signed, HTTP-only session cookie.
"""

import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import db
from auth_limits import (
    KIND_LOGIN_ACCOUNT,
    KIND_SIGNUP_ADDRESS,
    MAX_EMAIL_LENGTH,
    MAX_PASSWORD_LENGTH,
    clear_attempts,
    init_auth_limits,
    login_blocked,
    password_problem,
    record_attempt,
    record_failed_login,
    signup_blocked,
)
from db import connect_db, enable_wal
from plans import init_plans, new_trial_end, plan_status
from signature_log import init_signature_log

SECRET_KEY_PATH = "instance/secret_key"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Checked against when the email is unknown, so a login takes as long for a
# missing account as for a wrong password (no hint about which emails exist)
_DUMMY_PASSWORD_HASH = generate_password_hash(secrets.token_hex(16))

# Requests that don't need a logged-in user
PUBLIC_PATHS = {"/", "/auth/signup", "/auth/login", "/auth/logout", "/auth/me", "/plans", "/health"}

# Routes guests (no account) may use to try the tools. Guests get an anonymous
# ID in their session; their usage limits are enforced in plans.py.
GUEST_PATHS = [
    re.compile(pattern)
    for pattern in (
        r"^/convertPdfToWord$",
        r"^/convertWordToPdf$",
        r"^/splitPdf$",
        r"^/signPdf$",
        r"^/uploadFile$",
        r"^/chat$",
        r"^/backgroundIndex/[^/]+$",
        r"^/getFullDocument/[^/]+$",
    )
]
GUEST_ID_PREFIX = "guest_"

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _load_secret_key():
    """Use FLASK_SECRET_KEY if set, otherwise a key persisted under instance/
    so sessions survive restarts."""
    if os.environ.get("FLASK_SECRET_KEY"):
        return os.environ["FLASK_SECRET_KEY"]
    if not os.path.exists(SECRET_KEY_PATH):
        fd = os.open(SECRET_KEY_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_hex(32))
    with open(SECRET_KEY_PATH) as f:
        return f.read().strip()


def init_auth(app):
    """Configure sessions, create the users table and require login on the API."""
    os.makedirs("instance", exist_ok=True)

    app.config.update(
        SECRET_KEY=_load_secret_key(),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        # Set SESSION_COOKIE_SECURE=true when serving over HTTPS
        SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true",
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    )

    init_db()
    app.register_blueprint(auth_bp)
    app.before_request(_require_login)


def init_db():
    """Create the users table (and plan/usage tables) if they don't exist."""
    os.makedirs(os.path.dirname(db.DB_PATH) or ".", exist_ok=True)
    with connect_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        # Bumped when the password changes: sessions from before are signed out
        if "session_version" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0")
    # The database holds password hashes: keep it readable by this user only
    os.chmod(db.DB_PATH, 0o600)
    enable_wal()
    init_plans()
    init_signature_log()
    init_auth_limits()


def _require_login():
    if request.method == "OPTIONS" or request.path in PUBLIC_PATHS:
        return None
    user = _session_user()
    if user is None and any(pattern.match(request.path) for pattern in GUEST_PATHS):
        user = _guest_identity()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    g.user = user
    return None


def _guest_identity():
    """The visitor's anonymous guest identity, created on first use."""
    guest_id = session.get("guest_id")
    if not guest_id:
        guest_id = GUEST_ID_PREFIX + uuid.uuid4().hex
        session["guest_id"] = guest_id
    return {"id": guest_id, "email": None, "guest": True}


def is_guest():
    """Whether the current request comes from a guest (no account)."""
    return bool(g.user.get("guest"))


def _session_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    with connect_db() as conn:
        row = conn.execute(
            "SELECT id, email, session_version FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    # Deleted account, or signed out everywhere (e.g. the password was changed)
    if row is None or session.get("session_version", 0) != row["session_version"]:
        session.clear()
        return None
    return {"id": row["id"], "email": row["email"]}


def current_user_id():
    """ID of the logged-in user for the current request."""
    return g.user["id"]


def _user_payload(user):
    """User fields sent to the browser, including trial/plan status."""
    return {**user, "plan": plan_status(user["id"])}


def _session_version(user_id):
    with connect_db() as conn:
        return conn.execute("SELECT session_version FROM users WHERE id = ?", (user_id,)).fetchone()[0]


def _start_session(user):
    # A guest who signs up or logs in keeps the document they were trying
    guest_id = session.get("guest_id")
    # A fresh session (new cookie contents), so an old one can't be reused
    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["session_version"] = _session_version(user["id"])
    on_guest_claim = current_app.config.get("ON_GUEST_CLAIM")
    if guest_id and on_guest_claim:
        on_guest_claim(guest_id, user["id"])


def _credentials_from_request():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    return email, password


def _error(message, status):
    return jsonify({"error": message}), status


TOO_MANY_LOGINS = "Too many failed attempts. Wait 15 minutes and try again."


@auth_bp.route("/signup", methods=["POST"])
def signup():
    email, password = _credentials_from_request()

    if len(email) > MAX_EMAIL_LENGTH or not EMAIL_RE.match(email):
        return _error("Enter a valid email address.", 400)
    problem = password_problem(password, email)
    if problem:
        return _error(problem, 400)
    # Limits free trials: only so many new accounts per network address per day
    if signup_blocked(request.remote_addr):
        return _error("Too many accounts were created from your network today. Try again tomorrow.", 429)

    user = {"id": uuid.uuid4().hex, "email": email}
    try:
        with connect_db() as conn:
            is_first_user = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
            conn.execute(
                "INSERT INTO users (id, email, password_hash, created_at, plan, trial_ends_at)"
                " VALUES (?, ?, ?, ?, 'trial', ?)",
                (user["id"], email, generate_password_hash(password),
                 datetime.now(timezone.utc).isoformat(), new_trial_end()),
            )
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with this email already exists.", "code": "email_taken"}), 409
    record_attempt(KIND_SIGNUP_ADDRESS, request.remote_addr)

    # Documents uploaded before accounts existed belong to the first account
    if is_first_user:
        on_first_user = current_app.config.get("ON_FIRST_USER")
        if on_first_user:
            on_first_user(user["id"])

    _start_session(user)
    return jsonify({"user": _user_payload(user)}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    email, password = _credentials_from_request()
    if not email or not password or len(password) > MAX_PASSWORD_LENGTH:
        return _error("Incorrect email or password.", 401)

    if login_blocked(email, request.remote_addr):
        return _error(TOO_MANY_LOGINS, 429)

    with connect_db() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()

    # Always check a hash, so unknown emails take as long as wrong passwords
    password_ok = check_password_hash(row["password_hash"] if row else _DUMMY_PASSWORD_HASH, password)
    if row is None or not password_ok:
        record_failed_login(email, request.remote_addr)
        return _error("Incorrect email or password.", 401)

    clear_attempts(KIND_LOGIN_ACCOUNT, email)

    user = {"id": row["id"], "email": row["email"]}
    _start_session(user)
    return jsonify({"user": _user_payload(user)}), 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True}), 200


@auth_bp.route("/me", methods=["GET"])
def me():
    user = _session_user()
    if user is None:
        return jsonify({"error": "Not logged in"}), 401
    return jsonify({"user": _user_payload(user)}), 200


@auth_bp.route("/change-password", methods=["POST"])
def change_password():
    user = _session_user()
    if user is None:
        return _error("Not logged in", 401)
    data = request.get_json(silent=True) or {}
    current = str(data.get("current_password", ""))
    new = str(data.get("new_password", ""))

    if login_blocked(user["email"], request.remote_addr):
        return _error(TOO_MANY_LOGINS, 429)
    with connect_db() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if len(current) > MAX_PASSWORD_LENGTH or not check_password_hash(row["password_hash"], current):
        record_failed_login(user["email"], request.remote_addr)
        return _error("Your current password is incorrect.", 400)

    problem = password_problem(new, user["email"])
    if problem:
        return _error(problem, 400)
    if new == current:
        return _error("Choose a password different from your current one.", 400)

    set_password(user["id"], new)
    # Stay signed in here; every other device is signed out
    _start_session(user)
    return jsonify({"user": _user_payload(user)}), 200


def set_password(user_id, password):
    """Store a new password and sign the account out everywhere."""
    with connect_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?",
            (generate_password_hash(password), user_id),
        )
