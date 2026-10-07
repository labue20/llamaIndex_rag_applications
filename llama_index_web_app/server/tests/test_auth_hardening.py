"""Login and sign-up protections: rate limits, password rules, sessions and password changes."""

import sqlite3
import subprocess
import sys

import pytest

import auth
import auth_limits
from tests.conftest import SERVER_DIR


def _login(client, email="me@example.com", password="password-123", address="10.0.0.1"):
    return client.post("/auth/login", json={"email": email, "password": password},
                       environ_base={"REMOTE_ADDR": address})


@pytest.mark.parametrize("password,message", [
    ("password123", "too easy to guess"),
    ("aaaaaaaaaaaa", "too easy to guess"),
    ("me@example.com", "can't be your email"),
    ("x" * 129, "at most 128 characters"),
])
def test_weak_or_oversized_passwords_are_rejected(client, password, message):
    response = client.post("/auth/signup", json={"email": "me@example.com", "password": password})
    assert response.status_code == 400
    assert message in response.get_json()["error"]


def test_overlong_email_is_rejected(client):
    email = "a" * 250 + "@example.com"
    response = client.post("/auth/signup", json={"email": email, "password": "password-123"})
    assert response.status_code == 400


def test_duplicate_email_has_a_code_for_the_sign_in_shortcut(client, signup):
    signup("me@example.com")
    response = client.post("/auth/signup", json={"email": "me@example.com", "password": "password-123"})
    assert response.status_code == 409
    assert response.get_json()["code"] == "email_taken"


def test_signups_are_limited_per_address(app):
    for number in range(auth_limits.MAX_SIGNUPS_PER_ADDRESS):
        response = app.test_client().post(
            "/auth/signup", json={"email": f"user{number}@example.com", "password": "password-123"},
            environ_base={"REMOTE_ADDR": "10.0.0.9"})
        assert response.status_code == 201

    blocked = app.test_client().post(
        "/auth/signup", json={"email": "one-more@example.com", "password": "password-123"},
        environ_base={"REMOTE_ADDR": "10.0.0.9"})
    assert blocked.status_code == 429
    assert "Try again tomorrow" in blocked.get_json()["error"]

    # Another network is unaffected
    other = app.test_client().post(
        "/auth/signup", json={"email": "elsewhere@example.com", "password": "password-123"},
        environ_base={"REMOTE_ADDR": "10.0.0.10"})
    assert other.status_code == 201


def test_rejected_signups_do_not_count_towards_the_limit(app, signup):
    signup("me@example.com")
    for _ in range(auth_limits.MAX_SIGNUPS_PER_ADDRESS + 2):
        app.test_client().post("/auth/signup", json={"email": "me@example.com", "password": "password-123"},
                               environ_base={"REMOTE_ADDR": "10.0.0.9"})
    response = app.test_client().post("/auth/signup", json={"email": "new@example.com", "password": "password-123"},
                                      environ_base={"REMOTE_ADDR": "10.0.0.9"})
    assert response.status_code == 201


def test_account_is_protected_from_guessing_across_addresses(client, signup):
    signup("me@example.com", "password-123")
    for number in range(auth_limits.MAX_FAILED_LOGINS_PER_ACCOUNT):
        _login(client, password="wrong-pass", address=f"10.0.1.{number}")

    assert _login(client, address="10.0.2.1").status_code == 429


def test_one_address_cannot_try_many_accounts(client, signup, monkeypatch):
    monkeypatch.setattr(auth_limits, "MAX_FAILED_LOGINS_PER_ADDRESS", 5)
    signup("me@example.com", "password-123")
    for number in range(5):
        _login(client, email=f"guess{number}@example.com", password="wrong-pass")

    assert _login(client).status_code == 429
    assert _login(client, address="10.0.0.2").status_code == 200


def test_limits_survive_a_restart(client, signup):
    """Attempts are stored in the database, not in memory."""
    signup("me@example.com", "password-123")
    for _ in range(auth_limits.MAX_FAILED_LOGINS_PER_ACCOUNT):
        _login(client, password="wrong-pass")
    auth.init_db()  # what a restart runs
    assert _login(client).status_code == 429


def test_successful_login_resets_the_account_counter(client, signup):
    signup("me@example.com", "password-123")
    for _ in range(auth_limits.MAX_FAILED_LOGINS_PER_ACCOUNT - 1):
        _login(client, password="wrong-pass")
    assert _login(client).status_code == 200
    _login(client, password="wrong-pass")
    assert _login(client).status_code == 200


def test_unknown_email_still_checks_a_password_hash(client, monkeypatch):
    checked = []
    real_check = auth.check_password_hash
    monkeypatch.setattr(auth, "check_password_hash", lambda h, p: checked.append(h) or real_check(h, p))
    assert _login(client, email="nobody@example.com").status_code == 401
    assert checked == [auth._DUMMY_PASSWORD_HASH]


def test_overlong_login_password_is_refused_without_hashing(client, signup, monkeypatch):
    signup("me@example.com")
    monkeypatch.setattr(auth, "check_password_hash", lambda *a: pytest.fail("hashed an oversized password"))
    assert _login(client, password="x" * 10_000).status_code == 401


def _change(client, current="password-123", new="a-new-long-phrase"):
    return client.post("/auth/change-password", json={"current_password": current, "new_password": new})


def test_change_password_signs_out_other_devices(app, signup):
    laptop = signup("me@example.com", "password-123")
    phone = app.test_client()
    assert _login(phone).status_code == 200

    response = _change(laptop)
    assert response.status_code == 200
    assert response.get_json()["user"]["email"] == "me@example.com"

    assert laptop.get("/auth/me").status_code == 200      # stays signed in
    assert phone.get("/auth/me").status_code == 401       # signed out
    assert phone.get("/getDocuments").status_code == 401

    assert _login(app.test_client()).status_code == 401
    assert _login(app.test_client(), password="a-new-long-phrase").status_code == 200


@pytest.mark.parametrize("current,new,message", [
    ("wrong-pass", "a-new-long-phrase", "current password is incorrect"),
    ("password-123", "short", "at least 8 characters"),
    ("password-123", "password1", "too easy to guess"),
    ("password-123", "password-123", "different from your current one"),
])
def test_change_password_validation(signup, current, new, message):
    user_client = signup("me@example.com", "password-123")
    response = _change(user_client, current, new)
    assert response.status_code == 400
    assert message in response.get_json()["error"]
    assert user_client.get("/auth/me").status_code == 200


def test_change_password_needs_login_and_is_throttled(client, signup):
    assert _change(client).status_code == 401

    user_client = signup("me@example.com", "password-123")
    for _ in range(auth_limits.MAX_FAILED_LOGINS_PER_ACCOUNT):
        _change(user_client, current="wrong-pass")
    assert _change(user_client).status_code == 429


def test_logout_then_reusing_an_old_cookie_after_password_change_fails(app, signup, fresh_db):
    user_client = signup("me@example.com", "password-123")
    stolen = user_client.get_cookie("session").value

    _change(user_client)

    thief = app.test_client()
    thief.set_cookie("session", stolen)
    assert thief.get("/auth/me").status_code == 401


def test_reset_password_command(signup, fresh_db):
    user_client = signup("me@example.com", "password-123")
    result = subprocess.run(
        [sys.executable, "manage_users.py", "reset-password", "ME@example.com"],
        cwd=SERVER_DIR, env={"USERS_DB_PATH": fresh_db, "PATH": ""}, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    temporary = result.stdout.strip().rsplit(" ", 1)[-1]

    assert user_client.get("/auth/me").status_code == 401  # signed out everywhere
    hash_ = sqlite3.connect(fresh_db).execute("SELECT password_hash FROM users").fetchone()[0]
    assert auth.check_password_hash(hash_, temporary)


def test_database_connections_are_closed(fresh_db):
    import db
    with db.connect_db() as conn:
        conn.execute("SELECT 1")
    with pytest.raises(sqlite3.ProgrammingError):
        conn.execute("SELECT 1")


def test_sign_in_records_expire_after_24_hours(client, fresh_db):
    """The privacy policy says failed sign-in and new-account records are kept up to 24 hours."""
    import time

    with sqlite3.connect(fresh_db) as conn:
        conn.execute("INSERT INTO auth_attempts (kind, key, at) VALUES ('login-address', '10.0.0.1', ?)",
                     (time.time() - 25 * 3600,))
    _login(client)  # any sign-in check clears expired records
    with sqlite3.connect(fresh_db) as conn:
        expired = conn.execute("SELECT COUNT(*) FROM auth_attempts WHERE at < ?", (time.time() - 24 * 3600,))
        assert expired.fetchone()[0] == 0
