"""
User accounts and session authentication for the Flask API.

Accounts are created and signed in with Google (sign-in with Apple can be
added the same way), or with an email and password when PASSWORD_LOGIN_ENABLED.
Passwords are hashed (scrypt, via werkzeug). A password sign-up only becomes an
account once its email is confirmed through an emailed link, so nobody can
claim an address they don't own; forgotten passwords are reset by email.
Users live in a small SQLite database, and logged-in state is kept in
Flask's signed, HTTP-only session cookie.
"""

import hashlib
import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import config
import db
from billing import billing_info, init_billing
from auth_limits import (
    KIND_LOGIN_ACCOUNT,
    KIND_LOGIN_ADDRESS,
    KIND_SIGNUP_ADDRESS,
    MAX_EMAIL_LENGTH,
    MAX_PASSWORD_LENGTH,
    account_email_blocked,
    address_blocked,
    clear_attempts,
    init_auth_limits,
    login_blocked,
    password_problem,
    record_account_email,
    record_attempt,
    record_failed_login,
    signup_blocked,
)
from admin import init_admin, is_admin, record_seen
from db import connect_db, enable_wal
from plans import init_plans, new_trial_end, plan_status, signature_request_usage
from signature_log import init_signature_log
from signature_requests import init_signature_requests
from folders import init_folders
from support import init_support
from sso import SsoError, verify_google_credential
from email_service import EmailError, send_email

SECRET_KEY_PATH = "instance/secret_key"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Checked against when the email is unknown, so a login takes as long for a
# missing account as for a wrong password (no hint about which emails exist)
_DUMMY_PASSWORD_HASH = generate_password_hash(secrets.token_hex(16))

# Requests that don't need a logged-in user
# /billing/webhook is called by Stripe (it proves itself with a signature instead)
PUBLIC_PATHS = {"/", "/auth/config", "/auth/google", "/auth/signup", "/auth/login", "/auth/logout", "/auth/me",
                "/auth/verify-email", "/auth/forgot-password", "/auth/reset-password",
                "/plans", "/health", "/billing/webhook", "/support"}

# Accounts that sign in with Google have no password (an empty hash)
NO_PASSWORD = ""

# Routes guests (no account) may use to try the tools. Guests get an anonymous
# ID in their session; their usage limits are enforced in plans.py.
GUEST_PATHS = [
    re.compile(pattern)
    for pattern in (
        r"^/convertPdfToWord$",
        r"^/convertWordToPdf$",
        r"^/splitPdf$",
        r"^/compressPdf$",
        r"^/signPdf$",
        r"^/editPdf$",
        r"^/pdfText$",
        r"^/toPdf$",
        r"^/uploadFile$",
        r"^/chat$",
        r"^/backgroundIndex/[^/]+$",
        r"^/getFullDocument/[^/]+$",
    )
]
GUEST_ID_PREFIX = "guest_"

# Paths under these need no account (people signing a document sent to them)
PUBLIC_PREFIXES = ("/signing/",)

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
        # Password sign-ups waiting for their email to be confirmed (no account yet)
        conn.execute(
            """CREATE TABLE IF NOT EXISTS pending_signups (
                token_hash TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS password_resets (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT
            )"""
        )
        # Sign-in providers linked to an account (Google now; Apple later)
        conn.execute(
            """CREATE TABLE IF NOT EXISTS user_identities (
                provider TEXT NOT NULL,
                subject TEXT NOT NULL,
                user_id TEXT NOT NULL,
                email TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (provider, subject)
            )"""
        )
    # The database holds password hashes: keep it readable by this user only
    os.chmod(db.DB_PATH, 0o600)
    enable_wal()
    init_plans()
    init_signature_log()
    init_signature_requests()
    init_folders()
    init_support()
    init_auth_limits()
    init_billing()
    init_admin()


def _require_login():
    if request.method == "OPTIONS" or request.path in PUBLIC_PATHS:
        return None
    # Signing links: the token in the address identifies the signer
    if request.path.startswith(PUBLIC_PREFIXES):
        return None
    user = _session_user()
    if user is None and any(pattern.match(request.path) for pattern in GUEST_PATHS):
        user = _guest_identity()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    if not user.get("guest"):
        record_seen(user["id"])
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
    with connect_db() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    status = plan_status(user["id"])
    plan = {**status, "billing": billing_info(user["id"]),
            "signature_requests": signature_request_usage(user["id"], status["state"])}
    return {**user, "plan": plan, "has_password": bool(row and row["password_hash"]), "is_admin": is_admin(user)}


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


def _error(message, status, code=None):
    body = {"error": message}
    if code:
        body["code"] = code
    return jsonify(body), status


def _password_login_disabled():
    return _error("Sign in with Google instead.", 403, "password_login_disabled")


SIGNUPS_BLOCKED = "Too many accounts were created from your network today. Try again tomorrow."


def _create_user(email, password_hash):
    """Insert a new account on a fresh free trial. Raises sqlite3.IntegrityError
    if the email is taken. Returns the user."""
    user = {"id": uuid.uuid4().hex, "email": email}
    with connect_db() as conn:
        is_first_user = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
        conn.execute(
            "INSERT INTO users (id, email, password_hash, created_at, plan, trial_ends_at)"
            " VALUES (?, ?, ?, ?, 'trial', ?)",
            (user["id"], email, password_hash, datetime.now(timezone.utc).isoformat(), new_trial_end()),
        )
        # However the account was made (e.g. with Google), unconfirmed password sign-ups for it are void
        conn.execute("DELETE FROM pending_signups WHERE email = ?", (email,))
    record_attempt(KIND_SIGNUP_ADDRESS, request.remote_addr)

    # Documents uploaded before accounts existed belong to the first account
    if is_first_user:
        on_first_user = current_app.config.get("ON_FIRST_USER")
        if on_first_user:
            on_first_user(user["id"])
    return user


TOO_MANY_LOGINS = "Too many failed attempts. Wait 15 minutes and try again."


@auth_bp.route("/config", methods=["GET"])
def auth_config():
    """How people can sign in, for the login page."""
    return jsonify({
        "google_client_id": config.GOOGLE_CLIENT_ID,
        "password_login": config.PASSWORD_LOGIN_ENABLED,
    })


def _user_for_identity(provider, identity):
    """The account for a verified sign-in, linking or creating one if needed.
    Returns (user, created) or raises SsoError."""
    with connect_db() as conn:
        row = conn.execute(
            "SELECT u.id, u.email FROM user_identities i JOIN users u ON u.id = i.user_id"
            " WHERE i.provider = ? AND i.subject = ?",
            (provider, identity["subject"]),
        ).fetchone()
        if row:
            return {"id": row["id"], "email": row["email"]}, False
        # The provider has verified this email, so an account with it is theirs
        row = conn.execute("SELECT id, email FROM users WHERE email = ?", (identity["email"],)).fetchone()

    created = False
    if row:
        user = {"id": row["id"], "email": row["email"]}
    else:
        if signup_blocked(request.remote_addr):
            raise SsoError(SIGNUPS_BLOCKED)
        try:
            user = _create_user(identity["email"], NO_PASSWORD)
            created = True
        except sqlite3.IntegrityError:
            # Created by a simultaneous request: use that account
            with connect_db() as conn:
                row = conn.execute("SELECT id, email FROM users WHERE email = ?", (identity["email"],)).fetchone()
            user = {"id": row["id"], "email": row["email"]}

    with connect_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO user_identities (provider, subject, user_id, email, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (provider, identity["subject"], user["id"], identity["email"], datetime.now(timezone.utc).isoformat()),
        )
    return user, created


@auth_bp.route("/google", methods=["POST"])
def google_sign_in():
    """Sign in (or sign up, starting the free trial) with a Google ID token."""
    if not config.GOOGLE_CLIENT_ID:
        return _error("Google sign-in isn't set up on this server yet.", 503)
    address = request.remote_addr
    if address_blocked(address):
        return _error(TOO_MANY_LOGINS, 429)

    credential = str((request.get_json(silent=True) or {}).get("credential", ""))
    try:
        identity = verify_google_credential(credential, config.GOOGLE_CLIENT_ID)
    except SsoError as err:
        record_attempt(KIND_LOGIN_ADDRESS, address)
        return _error(str(err), 401)

    try:
        user, created = _user_for_identity("google", identity)
    except SsoError as err:
        return _error(str(err), 429)

    _start_session(user)
    return jsonify({"user": _user_payload(user), "created": created}), 201 if created else 200


# --- email confirmation and password reset ---------------------------------------------

VERIFY_LINK_HOURS = 24
RESET_LINK_MINUTES = 60
EMAILS_BLOCKED = "We've sent several emails to this address. Wait an hour, then try again."


def _token_hash(token):
    """Links carry a random token; only its hash is stored."""
    return hashlib.sha256(token.encode()).hexdigest()


def _now():
    return datetime.now(timezone.utc)


def _delete_expired_links(conn):
    """Unused sign-ups and reset links aren't kept once they've expired."""
    now = _now().isoformat()
    conn.execute("DELETE FROM pending_signups WHERE expires_at < ?", (now,))
    conn.execute("DELETE FROM password_resets WHERE expires_at < ?", (now,))


def _account_email(to, subject, heading, intro, button, link, outro):
    """A short email with one button (the link also in plain text)."""
    html = (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;'
        'max-width:480px;margin:0 auto;padding:24px;color:#0f172a">'
        f'<h1 style="font-size:20px;margin:0 0 12px">{heading}</h1>'
        f'<p style="font-size:15px;line-height:1.5;color:#334155">{intro}</p>'
        f'<p style="margin:24px 0"><a href="{link}" style="background:#2563eb;color:#fff;padding:12px 20px;'
        f'border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">{button}</a></p>'
        f'<p style="font-size:13px;line-height:1.5;color:#64748b">{outro}</p>'
        f'<p style="font-size:12px;color:#94a3b8;word-break:break-all">{link}</p>'
        '</div>'
    )
    text = f"{heading}\n\n{intro}\n\n{button}: {link}\n\n{outro}\n"
    send_email(to, subject, html, text)


@auth_bp.route("/signup", methods=["POST"])
def signup():
    """Start a password sign-up: the account is made once the emailed link is used."""
    if not config.PASSWORD_LOGIN_ENABLED:
        return _password_login_disabled()
    email, password = _credentials_from_request()

    if len(email) > MAX_EMAIL_LENGTH or not EMAIL_RE.match(email):
        return _error("Enter a valid email address.", 400)
    problem = password_problem(password, email)
    if problem:
        return _error(problem, 400)
    # Limits free trials: only so many new accounts per network address per day
    if signup_blocked(request.remote_addr):
        return _error(SIGNUPS_BLOCKED, 429)
    with connect_db() as conn:
        taken = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
    if taken:
        return _error("An account with this email already exists. Sign in, or reset your password.", 409,
                      "email_taken")
    if account_email_blocked(email, request.remote_addr):
        return _error(EMAILS_BLOCKED, 429)

    token = secrets.token_urlsafe(32)
    token_hash = _token_hash(token)
    now = _now()
    with connect_db() as conn:
        _delete_expired_links(conn)
        conn.execute(
            "INSERT INTO pending_signups (token_hash, email, password_hash, created_at, expires_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (token_hash, email, generate_password_hash(password), now.isoformat(),
             (now + timedelta(hours=VERIFY_LINK_HOURS)).isoformat()),
        )
    record_account_email(email, request.remote_addr)
    try:
        _account_email(
            email, "Confirm your email for Dokkiman", "Confirm your email",
            "Click the button to confirm your email address and finish creating your Dokkiman account.",
            "Confirm my email", f"{config.PUBLIC_APP_URL}/verify-email?token={token}",
            f"The link works for {VERIFY_LINK_HOURS} hours. If you didn't sign up for Dokkiman, ignore this email: "
            "no account is created without it.",
        )
    except EmailError:
        current_app.logger.exception("Confirmation email failed")
        with connect_db() as conn:
            conn.execute("DELETE FROM pending_signups WHERE token_hash = ?", (token_hash,))
        return _error("We couldn't send the confirmation email. Please try again in a few minutes.", 502)

    # Opened in this browser, the link finishes the sign-up without asking for the password again
    session["pending_signup"] = token_hash
    return jsonify({"verification_sent": True, "email": email}), 202


@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    """Finish a password sign-up from its emailed link. In another browser than the
    one that signed up, the password chosen is asked for too, so a link someone
    else triggered can't set their password on your account."""
    if not config.PASSWORD_LOGIN_ENABLED:
        return _password_login_disabled()
    data = request.get_json(silent=True) or {}
    token_hash = _token_hash(str(data.get("token", "")))
    with connect_db() as conn:
        row = conn.execute("SELECT * FROM pending_signups WHERE token_hash = ?", (token_hash,)).fetchone()
    if row is None or row["expires_at"] < _now().isoformat():
        return _error("This link has expired or was already used. Sign up again to get a new one.", 400,
                      "link_invalid")

    email = row["email"]
    if session.get("pending_signup") != token_hash:
        password = str(data.get("password", ""))
        if not password:
            return _error("Enter the password you chose to finish creating your account.", 400,
                          "password_needed")
        if login_blocked(email, request.remote_addr):
            return _error(TOO_MANY_LOGINS, 429)
        if len(password) > MAX_PASSWORD_LENGTH or not check_password_hash(row["password_hash"], password):
            record_failed_login(email, request.remote_addr)
            return _error("That's not the password you chose when signing up.", 400, "password_needed")

    with connect_db() as conn:
        taken = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        conn.execute("DELETE FROM pending_signups WHERE email = ?", (email,))
    if taken:
        return _error("This email already has an account. Sign in instead.", 409, "email_taken")
    try:
        user = _create_user(email, row["password_hash"])
    except sqlite3.IntegrityError:
        return _error("This email already has an account. Sign in instead.", 409, "email_taken")
    _start_session(user)
    return jsonify({"user": _user_payload(user)}), 201


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """Email a password reset link, if there's an account. The answer is the same
    either way, so it doesn't tell anyone which emails have accounts."""
    if not config.PASSWORD_LOGIN_ENABLED:
        return _password_login_disabled()
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    if len(email) > MAX_EMAIL_LENGTH or not EMAIL_RE.match(email):
        return _error("Enter a valid email address.", 400)
    if account_email_blocked(email, request.remote_addr):
        return _error(EMAILS_BLOCKED, 429)
    record_account_email(email, request.remote_addr)

    with connect_db() as conn:
        user = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if user:
        token = secrets.token_urlsafe(32)
        now = _now()
        with connect_db() as conn:
            _delete_expired_links(conn)
            conn.execute(
                "INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (_token_hash(token), user["id"], now.isoformat(),
                 (now + timedelta(minutes=RESET_LINK_MINUTES)).isoformat()),
            )
        try:
            _account_email(
                email, "Reset your Dokkiman password", "Reset your password",
                "Someone (hopefully you) asked to reset the password for your Dokkiman account.",
                "Choose a new password", f"{config.PUBLIC_APP_URL}/reset-password?token={token}",
                f"The link works once, for {RESET_LINK_MINUTES} minutes. If you didn't ask for this, ignore this "
                "email: your password stays the same.",
            )
        except EmailError:
            current_app.logger.exception("Password reset email failed")
    return jsonify({"sent": True}), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """Set a new password from a reset link; signs out every other device."""
    if not config.PASSWORD_LOGIN_ENABLED:
        return _password_login_disabled()
    data = request.get_json(silent=True) or {}
    token_hash = _token_hash(str(data.get("token", "")))
    password = str(data.get("password", ""))
    with connect_db() as conn:
        row = conn.execute(
            "SELECT r.user_id, r.expires_at, u.email FROM password_resets r JOIN users u ON u.id = r.user_id"
            " WHERE r.token_hash = ? AND r.used_at IS NULL", (token_hash,)
        ).fetchone()
    if row is None or row["expires_at"] < _now().isoformat():
        return _error("This link has expired or was already used. Ask for a new one.", 400, "link_invalid")
    problem = password_problem(password, row["email"])
    if problem:
        return _error(problem, 400)

    set_password(row["user_id"], password)
    with connect_db() as conn:
        # Every reset link for the account stops working
        conn.execute("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
                     (_now().isoformat(), row["user_id"]))
    clear_attempts(KIND_LOGIN_ACCOUNT, row["email"])
    user = {"id": row["user_id"], "email": row["email"]}
    _start_session(user)
    return jsonify({"user": _user_payload(user)}), 200


@auth_bp.route("/login", methods=["POST"])
def login():
    if not config.PASSWORD_LOGIN_ENABLED:
        return _password_login_disabled()
    email, password = _credentials_from_request()
    if not email or not password or len(password) > MAX_PASSWORD_LENGTH:
        return _error("Incorrect email or password.", 401)

    if login_blocked(email, request.remote_addr):
        return _error(TOO_MANY_LOGINS, 429)

    with connect_db() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()

    # Always check a hash, so unknown emails (and Google-only accounts) take as long as wrong passwords
    stored_hash = row["password_hash"] if row and row["password_hash"] else _DUMMY_PASSWORD_HASH
    password_ok = check_password_hash(stored_hash, password) and stored_hash != _DUMMY_PASSWORD_HASH
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
    if not config.PASSWORD_LOGIN_ENABLED:
        return _password_login_disabled()
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
    if not row["password_hash"]:
        return _error("This account signs in with Google, so it has no password to change.", 400)
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
