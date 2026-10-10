"""Email + password accounts: confirming the email before the account exists,
and resetting a forgotten password by email."""

import re
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

import auth
import auth_limits
import config
import email_service
from conftest import verify_token


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    email_service.outbox.clear()
    return email_service.outbox


def _signup(browser, email="alice@example.com", password="password-123"):
    return browser.post("/auth/signup", json={"email": email, "password": password})


def _login(browser, email="alice@example.com", password="password-123"):
    return browser.post("/auth/login", json={"email": email, "password": password})


def _reset_token(outbox, email):
    message = next(m for m in reversed(outbox) if m["to"] == [email] and "reset-password" in m["text"])
    return re.search(r"reset-password\?token=([\w-]+)", message["text"]).group(1)


# --- confirming the email ---------------------------------------------------------------

def test_no_account_until_the_email_is_confirmed(app, outbox, fresh_db):
    browser = app.test_client()
    assert _signup(browser).status_code == 202
    assert outbox[-1]["subject"] == "Confirm your email for Dokkiman"
    # Nothing to sign in to yet, and only the password's hash is kept meanwhile
    assert _login(app.test_client()).status_code == 401
    conn = sqlite3.connect(fresh_db)
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    assert conn.execute("SELECT password_hash FROM pending_signups").fetchone()[0].startswith("scrypt:")

    assert browser.post("/auth/verify-email", json={"token": verify_token(outbox, "alice@example.com")}).status_code == 201
    assert _login(app.test_client()).status_code == 200


def test_another_browser_must_know_the_password(app, outbox):
    _signup(app.test_client())
    token = verify_token(outbox, "alice@example.com")
    phone = app.test_client()

    response = phone.post("/auth/verify-email", json={"token": token})
    assert response.status_code == 400 and response.get_json()["code"] == "password_needed"
    response = phone.post("/auth/verify-email", json={"token": token, "password": "wrong-password"})
    assert response.status_code == 400 and "not the password you chose" in response.get_json()["error"]
    response = phone.post("/auth/verify-email", json={"token": token, "password": "password-123"})
    assert response.status_code == 201
    assert phone.get("/auth/me").get_json()["user"]["email"] == "alice@example.com"


def test_links_work_once_and_expire(app, outbox, fresh_db):
    browser = app.test_client()
    _signup(browser)
    token = verify_token(outbox, "alice@example.com")
    assert browser.post("/auth/verify-email", json={"token": token}).status_code == 201
    used = browser.post("/auth/verify-email", json={"token": token})
    assert used.status_code == 400 and used.get_json()["code"] == "link_invalid"

    later = app.test_client()
    _signup(later, email="bob@example.com")
    with sqlite3.connect(fresh_db) as conn:
        conn.execute("UPDATE pending_signups SET expires_at = ?",
                     ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),))
    expired = later.post("/auth/verify-email", json={"token": verify_token(outbox, "bob@example.com")})
    assert expired.status_code == 400 and expired.get_json()["code"] == "link_invalid"
    assert later.post("/auth/verify-email", json={"token": "made-up"}).status_code == 400


def test_someone_else_cant_claim_your_email_before_you_sign_in_with_google(app, outbox, monkeypatch):
    """An attacker signs up with alice's address and a password they know. Alice
    then signs in with Google: she gets a fresh account the attacker can't open."""
    attacker = app.test_client()
    assert _signup(attacker, email="alice@gmail.com", password="attacker-pass-1").status_code == 202

    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(auth, "verify_google_credential",
                        lambda credential, client_id: {"subject": "google-alice", "email": "alice@gmail.com"})
    alice = app.test_client()
    assert alice.post("/auth/google", json={"credential": "token"}).status_code in (200, 201)

    # The attacker's password opens nothing, and their link is void
    assert _login(app.test_client(), email="alice@gmail.com", password="attacker-pass-1").status_code == 401
    link = attacker.post("/auth/verify-email", json={"token": verify_token(outbox, "alice@gmail.com")})
    assert link.status_code == 400 and link.get_json()["code"] == "link_invalid"
    assert attacker.get("/auth/me").status_code == 401


def test_an_existing_account_cant_be_signed_up_again(app, signup):
    signup("alice@example.com")
    response = _signup(app.test_client())
    assert response.status_code == 409
    assert "reset your password" in response.get_json()["error"]


def test_confirmation_emails_are_limited(app, outbox, monkeypatch):
    monkeypatch.setattr(auth_limits, "MAX_ACCOUNT_EMAILS_PER_EMAIL", 2)
    browser = app.test_client()
    assert _signup(browser).status_code == 202
    assert _signup(browser).status_code == 202
    blocked = _signup(browser)
    assert blocked.status_code == 429 and "Wait an hour" in blocked.get_json()["error"]
    assert len(outbox) == 2


def test_a_failed_email_leaves_nothing_behind(app, monkeypatch, fresh_db):
    def fail(*args, **kwargs):
        raise email_service.EmailError("down")
    monkeypatch.setattr(auth, "send_email", fail)
    response = _signup(app.test_client())
    assert response.status_code == 502 and "couldn't send" in response.get_json()["error"]
    assert sqlite3.connect(fresh_db).execute("SELECT COUNT(*) FROM pending_signups").fetchone()[0] == 0


# --- forgotten passwords ---------------------------------------------------------------------

def test_forgot_password_answers_the_same_for_unknown_emails(app, signup, outbox):
    signup("alice@example.com")
    outbox.clear()
    known = app.test_client().post("/auth/forgot-password", json={"email": "alice@example.com"})
    unknown = app.test_client().post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.get_json() == unknown.get_json() == {"sent": True}
    assert [m["to"] for m in outbox] == [["alice@example.com"]]  # only real accounts get an email


def test_reset_sets_a_new_password_signs_out_other_devices_and_works_once(app, signup, outbox):
    old_device = signup("alice@example.com", "password-123")
    app.test_client().post("/auth/forgot-password", json={"email": "alice@example.com"})
    token = _reset_token(outbox, "alice@example.com")

    browser = app.test_client()
    weak = browser.post("/auth/reset-password", json={"token": token, "password": "123"})
    assert weak.status_code == 400
    done = browser.post("/auth/reset-password", json={"token": token, "password": "brand-new-pass-9"})
    assert done.status_code == 200
    assert browser.get("/auth/me").status_code == 200
    assert old_device.get("/auth/me").status_code == 401  # signed out everywhere else

    assert _login(app.test_client(), password="password-123").status_code == 401
    assert _login(app.test_client(), password="brand-new-pass-9").status_code == 200
    again = browser.post("/auth/reset-password", json={"token": token, "password": "another-pass-9"})
    assert again.status_code == 400 and again.get_json()["code"] == "link_invalid"


def test_reset_links_expire(app, signup, outbox, fresh_db):
    signup("alice@example.com")
    app.test_client().post("/auth/forgot-password", json={"email": "alice@example.com"})
    with sqlite3.connect(fresh_db) as conn:
        conn.execute("UPDATE password_resets SET expires_at = ?",
                     ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),))
    response = app.test_client().post("/auth/reset-password", json={
        "token": _reset_token(outbox, "alice@example.com"), "password": "brand-new-pass-9"})
    assert response.status_code == 400 and response.get_json()["code"] == "link_invalid"


def test_all_of_it_is_off_without_password_login(app, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD_LOGIN_ENABLED", False)
    browser = app.test_client()
    for path, body in [("/auth/signup", {"email": "a@example.com", "password": "password-123"}),
                       ("/auth/verify-email", {"token": "x"}),
                       ("/auth/forgot-password", {"email": "a@example.com"}),
                       ("/auth/reset-password", {"token": "x", "password": "password-123"})]:
        assert browser.post(path, json=body).status_code == 403
