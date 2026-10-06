"""
User accounts and session authentication for the Flask API.

Users live in a small SQLite database; passwords are hashed with werkzeug.
Logged-in state is kept in Flask's signed, HTTP-only session cookie.
"""

import os
import re
import secrets
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import db
from db import connect_db
from plans import init_plans, new_trial_end, plan_status

SECRET_KEY_PATH = "instance/secret_key"

MIN_PASSWORD_LENGTH = 8
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Failed-login throttling: at most MAX_FAILED_LOGINS per email+IP per window
MAX_FAILED_LOGINS = 10
FAILED_LOGIN_WINDOW_SECONDS = 15 * 60

# Requests that don't need a logged-in user
PUBLIC_PATHS = {"/", "/auth/signup", "/auth/login", "/auth/logout", "/auth/me", "/plans"}

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

_failed_logins = {}
_failed_logins_lock = threading.Lock()


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
    # The database holds password hashes: keep it readable by this user only
    os.chmod(db.DB_PATH, 0o600)
    init_plans()


def _require_login():
    if request.method == "OPTIONS" or request.path in PUBLIC_PATHS:
        return None
    user = _session_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    g.user = user
    return None


def _session_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    with connect_db() as conn:
        row = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        session.clear()
        return None
    return {"id": row["id"], "email": row["email"]}


def current_user_id():
    """ID of the logged-in user for the current request."""
    return g.user["id"]


def _user_payload(user):
    """User fields sent to the browser, including trial/plan status."""
    return {**user, "plan": plan_status(user["id"])}


def _start_session(user):
    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]


def _credentials_from_request():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    return email, password


def _throttle_key(email):
    return f"{email}|{request.remote_addr}"


def _is_throttled(key):
    now = time.time()
    with _failed_logins_lock:
        attempts = [t for t in _failed_logins.get(key, []) if now - t < FAILED_LOGIN_WINDOW_SECONDS]
        _failed_logins[key] = attempts
        return len(attempts) >= MAX_FAILED_LOGINS


def _record_failed_login(key):
    with _failed_logins_lock:
        _failed_logins.setdefault(key, []).append(time.time())


@auth_bp.route("/signup", methods=["POST"])
def signup():
    email, password = _credentials_from_request()

    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address."}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({"error": f"Password must be at least {MIN_PASSWORD_LENGTH} characters."}), 400

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
        return jsonify({"error": "An account with this email already exists."}), 409

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
    key = _throttle_key(email)

    if _is_throttled(key):
        return jsonify({"error": "Too many failed attempts. Try again in a few minutes."}), 429

    with connect_db() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()

    if row is None or not check_password_hash(row["password_hash"], password):
        _record_failed_login(key)
        return jsonify({"error": "Incorrect email or password."}), 401

    with _failed_logins_lock:
        _failed_logins.pop(key, None)

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
