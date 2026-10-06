"""Accounts, login sessions and access control."""

import sqlite3

import pytest

import auth

PROTECTED_ROUTES = [
    ("get", "/getDocuments"),
    ("get", "/getFullDocument/some-id"),
    ("delete", "/documents/some-id"),
    ("post", "/uploadFile"),
    ("post", "/chat"),
    ("get", "/queryFile?text=hi"),
    ("post", "/backgroundIndex/some-id"),
    ("post", "/convertPdfToWord"),
    ("post", "/convertWordToPdf"),
    ("post", "/splitPdf"),
]


@pytest.mark.parametrize("method,path", PROTECTED_ROUTES)
def test_routes_require_login(client, method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.get_json()["error"] == "Authentication required"


@pytest.mark.parametrize("path", ["/", "/plans"])
def test_public_routes_need_no_login(client, path):
    assert client.get(path).status_code == 200


@pytest.mark.parametrize("email,password,message", [
    ("not-an-email", "password-123", "Enter a valid email address."),
    ("", "password-123", "Enter a valid email address."),
    ("a@example.com", "short", "Password must be at least 8 characters."),
])
def test_signup_validation(client, email, password, message):
    response = client.post("/auth/signup", json={"email": email, "password": password})
    assert response.status_code == 400
    assert response.get_json()["error"] == message


def test_signup_logs_in_and_normalizes_email(client):
    response = client.post("/auth/signup", json={"email": "  Me@Example.COM ", "password": "password-123"})
    assert response.status_code == 201
    assert response.get_json()["user"]["email"] == "me@example.com"

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.get_json()["user"]["email"] == "me@example.com"


def test_duplicate_signup_rejected(client, signup):
    signup("me@example.com")
    response = client.post("/auth/signup", json={"email": "ME@example.com", "password": "password-123"})
    assert response.status_code == 409


def test_password_is_stored_hashed(signup, fresh_db):
    signup("me@example.com", "my-secret-pass")
    row = sqlite3.connect(fresh_db).execute("SELECT password_hash FROM users").fetchone()
    assert "my-secret-pass" not in row[0]
    assert row[0].startswith("scrypt:")


def test_login_logout_cycle(client, signup):
    signup("me@example.com", "password-123")

    assert client.post("/auth/login", json={"email": "me@example.com", "password": "wrong-pass"}).status_code == 401
    assert client.get("/auth/me").status_code == 401

    response = client.post("/auth/login", json={"email": "ME@example.com", "password": "password-123"})
    assert response.status_code == 200
    assert client.get("/getDocuments").status_code == 200

    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/me").status_code == 401
    assert client.get("/getDocuments").status_code == 401


def test_login_unknown_email_gives_same_error_as_wrong_password(client, signup):
    signup("me@example.com", "password-123")
    unknown = client.post("/auth/login", json={"email": "nobody@example.com", "password": "password-123"})
    wrong = client.post("/auth/login", json={"email": "me@example.com", "password": "nope-nope"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.get_json() == wrong.get_json()


def test_failed_logins_are_throttled_per_email(client, signup):
    signup("me@example.com", "password-123")
    signup("other@example.com", "password-123")

    for _ in range(auth.MAX_FAILED_LOGINS):
        client.post("/auth/login", json={"email": "me@example.com", "password": "wrong-pass"})

    # Even the right password is refused while throttled
    blocked = client.post("/auth/login", json={"email": "me@example.com", "password": "password-123"})
    assert blocked.status_code == 429

    # Other accounts are unaffected
    other = client.post("/auth/login", json={"email": "other@example.com", "password": "password-123"})
    assert other.status_code == 200


def test_session_cookie_flags(client):
    response = client.post("/auth/signup", json={"email": "me@example.com", "password": "password-123"})
    cookie = response.headers["Set-Cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie


def test_session_of_deleted_user_is_rejected(signup, fresh_db):
    user_client = signup("me@example.com")
    with sqlite3.connect(fresh_db) as conn:
        conn.execute("DELETE FROM users")
    assert user_client.get("/getDocuments").status_code == 401
    assert user_client.get("/auth/me").status_code == 401


def test_first_account_claims_pre_existing_documents(signup, index_server):
    index_server.docs["old-doc"] = {"owner_id": None, "file_name": "old.pdf", "file_path": "x"}

    first = signup("first@example.com")
    second = signup("second@example.com")

    assert [d["id"] for d in first.get("/getDocuments").get_json()] == ["old-doc"]
    assert second.get("/getDocuments").get_json() == []


def test_user_payload_includes_plan(signup):
    user = signup("me@example.com").user
    assert user["plan"]["state"] == "trial"
    assert "password_hash" not in user
