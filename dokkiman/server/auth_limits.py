"""
Rate limits for logins and sign-ups, and the password rules.

Attempts are stored in the accounts database (not in memory), so the limits
survive restarts and apply across all gunicorn workers and threads.
"""

import os
import time

from db import connect_db

# Failed logins: per account (any address) and per address (any account)
MAX_FAILED_LOGINS_PER_ACCOUNT = int(os.environ.get("MAX_FAILED_LOGINS_PER_ACCOUNT", "10"))
MAX_FAILED_LOGINS_PER_ADDRESS = int(os.environ.get("MAX_FAILED_LOGINS_PER_ADDRESS", "30"))
FAILED_LOGIN_WINDOW_SECONDS = 15 * 60

# New accounts (and so new free trials) per network address per day
MAX_SIGNUPS_PER_ADDRESS = int(os.environ.get("MAX_SIGNUPS_PER_ADDRESS", "5"))
SIGNUP_WINDOW_SECONDS = 24 * 60 * 60

KIND_LOGIN_ACCOUNT = "login-account"
KIND_LOGIN_ADDRESS = "login-address"
KIND_SIGNUP_ADDRESS = "signup-address"

MIN_PASSWORD_LENGTH = 8
# Hashing very long inputs is slow; nobody needs more than this
MAX_PASSWORD_LENGTH = 128
MAX_EMAIL_LENGTH = 254

# The most common passwords of 8+ characters (from public breach lists)
COMMON_PASSWORDS = {
    "password", "password1", "password12", "password123", "password1234", "passw0rd",
    "p@ssw0rd", "p@ssword", "12345678", "123456789", "1234567890", "12341234",
    "11111111", "00000000", "87654321", "123123123", "1q2w3e4r", "1qaz2wsx",
    "qwertyui", "qwerty123", "qwertyuiop", "qwerty12", "asdfghjk", "asdfasdf",
    "zxcvbnm1", "iloveyou", "iloveyou1", "sunshine", "princess", "football",
    "baseball", "welcome1", "welcome123", "letmein1", "trustno1", "superman",
    "starwars", "whatever", "dragon12", "monkey12", "abc12345", "abcd1234",
    "admin123", "administrator", "changeme", "computer", "internet", "michelle",
    "jennifer", "corvette", "mercedes", "samantha", "midnight", "charlie1",
    "aa123456", "q1w2e3r4", "zaq12wsx", "1234qwer", "qazwsxedc", "passpass",
    "testtest", "test1234", "secret12", "default1", "master12", "hello123",
}


def init_auth_limits():
    with connect_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS auth_attempts (
                kind TEXT NOT NULL,
                key TEXT NOT NULL,
                at REAL NOT NULL
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS auth_attempts_kind_key ON auth_attempts (kind, key, at)")
        _delete_expired(conn)


def _delete_expired(conn):
    """Nothing older than the longest window is needed (the privacy policy says 24 hours)."""
    conn.execute("DELETE FROM auth_attempts WHERE at < ?", (time.time() - SIGNUP_WINDOW_SECONDS,))


def recent_attempts(kind, key, window_seconds):
    with connect_db() as conn:
        _delete_expired(conn)
        return conn.execute(
            "SELECT COUNT(*) FROM auth_attempts WHERE kind = ? AND key = ? AND at > ?",
            (kind, key, time.time() - window_seconds),
        ).fetchone()[0]


def record_attempt(kind, key):
    now = time.time()
    with connect_db() as conn:
        conn.execute("INSERT INTO auth_attempts (kind, key, at) VALUES (?, ?, ?)", (kind, key, now))
        _delete_expired(conn)


def clear_attempts(kind, key):
    with connect_db() as conn:
        conn.execute("DELETE FROM auth_attempts WHERE kind = ? AND key = ?", (kind, key))


def login_blocked(email, address):
    return (
        recent_attempts(KIND_LOGIN_ACCOUNT, email, FAILED_LOGIN_WINDOW_SECONDS) >= MAX_FAILED_LOGINS_PER_ACCOUNT
        or recent_attempts(KIND_LOGIN_ADDRESS, address, FAILED_LOGIN_WINDOW_SECONDS) >= MAX_FAILED_LOGINS_PER_ADDRESS
    )


def address_blocked(address):
    """Too many failed sign-ins from this network address (any account or provider)."""
    return recent_attempts(KIND_LOGIN_ADDRESS, address, FAILED_LOGIN_WINDOW_SECONDS) >= MAX_FAILED_LOGINS_PER_ADDRESS


def record_failed_login(email, address):
    record_attempt(KIND_LOGIN_ACCOUNT, email)
    record_attempt(KIND_LOGIN_ADDRESS, address)


def signup_blocked(address):
    return recent_attempts(KIND_SIGNUP_ADDRESS, address, SIGNUP_WINDOW_SECONDS) >= MAX_SIGNUPS_PER_ADDRESS


def password_problem(password, email=""):
    """Why a new password isn't acceptable, or None if it is."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Password must be at most {MAX_PASSWORD_LENGTH} characters."
    lowered = password.lower()
    if lowered in COMMON_PASSWORDS or len(set(password)) < 3:
        return "This password is too easy to guess. Try a longer phrase or mix in other words."
    if email and lowered in {email.lower(), email.split("@")[0].lower()}:
        return "Your password can't be your email address."
    return None
