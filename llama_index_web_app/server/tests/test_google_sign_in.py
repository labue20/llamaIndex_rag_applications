"""Sign-in with Google: token checks, account creation and linking, limits.

Tokens are real JWTs signed with a throwaway key; Google's published keys are
swapped for its certificate, so the genuine signature/audience/expiry checks run.
"""

import datetime
import sqlite3
import time

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from google.auth import crypt, jwt
from google.oauth2 import id_token

import auth_limits
import config

CLIENT_ID = "test-client.apps.googleusercontent.com"


def _key_and_cert():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(1).not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=1)).sign(key, hashes.SHA256()))
    key_pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                serialization.NoEncryption()).decode()
    return key_pem, cert.public_bytes(serialization.Encoding.PEM).decode()


GOOGLE_KEY, GOOGLE_CERT = _key_and_cert()
OTHER_KEY, _ = _key_and_cert()


@pytest.fixture(autouse=True)
def google_keys(monkeypatch):
    """Google's published signing keys, replaced by our test certificate."""
    monkeypatch.setattr(id_token, "_fetch_certs", lambda request, url: {"test-key": GOOGLE_CERT})
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", CLIENT_ID)


def make_token(sub="google-user-1", email="me@gmail.com", key=GOOGLE_KEY, **overrides):
    now = int(time.time())
    claims = {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": sub, "email": email,
              "email_verified": True, "iat": now, "exp": now + 600, **overrides}
    signer = crypt.RSASigner.from_string(key, key_id="test-key")
    return jwt.encode(signer, claims).decode()


def google(client, token=None, address="10.0.0.1"):
    return client.post("/auth/google", json={"credential": token or make_token()},
                       environ_base={"REMOTE_ADDR": address})


def test_first_google_sign_in_creates_an_account_on_a_trial(client):
    response = google(client)
    assert response.status_code == 201
    body = response.get_json()
    assert body["created"] is True
    assert body["user"]["email"] == "me@gmail.com"
    assert body["user"]["plan"]["state"] == "trial"
    assert body["user"]["has_password"] is False

    assert client.get("/auth/me").get_json()["user"]["email"] == "me@gmail.com"
    assert client.get("/getDocuments").status_code == 200


def test_signing_in_again_uses_the_same_account(app, client):
    first = google(client).get_json()["user"]
    again = google(app.test_client())
    assert again.status_code == 200
    assert again.get_json()["created"] is False
    assert again.get_json()["user"]["id"] == first["id"]


def test_the_google_account_id_is_what_counts_not_the_email(app, client):
    """If the Gmail address changes later, the same Google account still gets in."""
    first = google(client, make_token(email="old@gmail.com")).get_json()["user"]
    later = google(app.test_client(), make_token(email="new@gmail.com")).get_json()["user"]
    assert later["id"] == first["id"]


def test_an_existing_account_with_that_email_is_linked(app, signup):
    existing = signup("me@gmail.com", "password-123").user
    response = google(app.test_client(), make_token(email="Me@Gmail.com"))
    assert response.status_code == 200
    assert response.get_json()["user"]["id"] == existing["id"]
    assert response.get_json()["user"]["has_password"] is True


@pytest.mark.parametrize("token,message", [
    (make_token(aud="someone-elses-app.apps.googleusercontent.com"), "didn't complete"),
    (make_token(key=OTHER_KEY), "didn't complete"),
    (make_token(iat=int(time.time()) - 7200, exp=int(time.time()) - 3600), "didn't complete"),
    (make_token(iss="https://evil.example.com"), "didn't complete"),
    (make_token(email_verified=False), "isn't verified"),
    ("not-a-token", "didn't complete"),
])
def test_bad_tokens_are_rejected(client, fresh_db, token, message):
    response = google(client, token)
    assert response.status_code == 401
    assert message in response.get_json()["error"]
    assert client.get("/auth/me").status_code == 401
    assert sqlite3.connect(fresh_db).execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def test_missing_credential_is_rejected(client):
    assert client.post("/auth/google", json={}).status_code == 401


def test_google_sign_in_off_when_not_configured(client, monkeypatch):
    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "")
    response = google(client)
    assert response.status_code == 503
    assert "isn't set up" in response.get_json()["error"]


def test_new_accounts_count_towards_the_daily_sign_up_limit(app, monkeypatch):
    monkeypatch.setattr(auth_limits, "MAX_SIGNUPS_PER_ADDRESS", 2)
    assert google(app.test_client(), make_token(sub="a", email="a@gmail.com")).status_code == 201
    assert google(app.test_client(), make_token(sub="b", email="b@gmail.com")).status_code == 201

    blocked = google(app.test_client(), make_token(sub="c", email="c@gmail.com"))
    assert blocked.status_code == 429
    assert "Try again tomorrow" in blocked.get_json()["error"]

    # Existing accounts can still sign in
    assert google(app.test_client(), make_token(sub="a", email="a@gmail.com")).status_code == 200


def test_repeated_bad_tokens_from_one_address_are_blocked(client, monkeypatch):
    monkeypatch.setattr(auth_limits, "MAX_FAILED_LOGINS_PER_ADDRESS", 3)
    for _ in range(3):
        google(client, "not-a-token")
    assert google(client).status_code == 429
    assert google(client, address="10.0.0.2").status_code == 201


def test_guest_documents_move_into_the_new_account(client, index_server):
    index_server.docs["guest-doc"] = {"owner_id": None, "file_name": "w2.pdf", "file_path": "x"}
    with client.session_transaction() as session:
        session["guest_id"] = "guest_abc"
    index_server.docs["guest-doc"]["owner_id"] = "guest_abc"

    google(client)
    assert [d["id"] for d in client.get("/getDocuments").get_json()] == ["guest-doc"]


def test_auth_config_tells_the_login_page_what_to_show(client, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD_LOGIN_ENABLED", False)
    assert client.get("/auth/config").get_json() == {"google_client_id": CLIENT_ID, "password_login": False}


@pytest.mark.parametrize("path", ["/auth/signup", "/auth/login", "/auth/change-password"])
def test_password_routes_are_off_by_default(client, monkeypatch, path):
    google(client)  # signed in, so Change password gets past the login check
    monkeypatch.setattr(config, "PASSWORD_LOGIN_ENABLED", False)
    response = client.post(path, json={"email": "me@example.com", "password": "password-123"})
    assert response.status_code == 403
    assert response.get_json()["code"] == "password_login_disabled"


def test_network_trouble_reaching_google_is_explained(client, monkeypatch):
    from google.auth import exceptions

    def offline(request, url):
        raise exceptions.TransportError("no network")

    monkeypatch.setattr(id_token, "_fetch_certs", offline)
    response = google(client)
    assert response.status_code == 401
    assert "Couldn't reach Google" in response.get_json()["error"]


def test_google_only_accounts_cannot_log_in_with_a_password(app, client):
    google(client)
    response = app.test_client().post("/auth/login", json={"email": "me@gmail.com", "password": "anything-at-all"})
    assert response.status_code == 401

    change = client.post("/auth/change-password",
                         json={"current_password": "anything", "new_password": "a-new-long-phrase"})
    assert change.status_code == 400
    assert "signs in with Google" in change.get_json()["error"]


def test_password_off_is_the_default_setting():
    import importlib
    import os

    saved = os.environ.pop("PASSWORD_LOGIN_ENABLED")
    try:
        assert importlib.reload(config).PASSWORD_LOGIN_ENABLED is False
    finally:
        os.environ["PASSWORD_LOGIN_ENABLED"] = saved
        importlib.reload(config)
