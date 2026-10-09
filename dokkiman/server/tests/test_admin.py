"""Admin portal: only ADMIN_EMAILS get in; stats, accounts and the changes admins can make."""

import json
import re
from datetime import datetime, timedelta, timezone

import pytest

import config
import email_service
from db import connect_db

ADMIN = "boss@example.com"


@pytest.fixture(autouse=True)
def admins(monkeypatch):
    monkeypatch.setattr(config, "ADMIN_EMAILS", {ADMIN})
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    email_service.outbox.clear()


@pytest.fixture
def admin(signup):
    return signup(ADMIN)


def _set(user_id, **columns):
    with connect_db() as conn:
        for column, value in columns.items():
            conn.execute(f"UPDATE users SET {column} = ? WHERE id = ?", (value, user_id))


def _send_request(user_client, make_pdf):
    data = {"title": "Lease", "signers": [{"name": "Sam Ray", "email": "sam@example.com"}],
            "fields": [{"signer": 0, "kind": "signature", "page": 0, "x": 0.1, "y": 0.7, "width": 0.3, "height": 0.05}]}
    with open(make_pdf(pages=1), "rb") as f:
        response = user_client.post("/signature-requests", data={"file": (f, "lease.pdf"), "data": json.dumps(data)},
                                    content_type="multipart/form-data")
    assert response.status_code == 201
    return response.get_json()["request"]["id"]


def test_only_admins_get_in(client, signup, admin):
    someone = signup("someone@example.com")
    assert someone.user["is_admin"] is False
    assert admin.user["is_admin"] is True
    for path in ("/admin/stats", "/admin/users", f"/admin/users/{someone.user['id']}"):
        assert someone.get(path).status_code == 404  # as if it didn't exist
        assert client.get(path).status_code == 401
        assert admin.get(path).status_code == 200
    assert someone.post(f"/admin/users/{someone.user['id']}/extend-trial", json={"days": 30}).status_code == 404


def test_nobody_is_an_admin_without_the_setting(signup, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_EMAILS", set())
    boss = signup(ADMIN)
    assert boss.user["is_admin"] is False
    assert boss.get("/admin/stats").status_code == 404


def test_stats(admin, signup, make_pdf, index_server):
    paying = signup("paying@example.com")
    gifted = signup("gifted@example.com")
    ended = signup("ended@example.com")
    future = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    _set(paying.user["id"], plan="pro", pro_until=future, stripe_customer_id="cus_1",
         stripe_subscription_id="sub_1", subscription_status="active", subscription_interval="monthly",
         cancel_at_period_end=1)
    _set(gifted.user["id"], plan="basic", pro_until=future)
    _set(ended.user["id"], trial_ends_at=(datetime.now(timezone.utc) - timedelta(days=1)).isoformat())
    _send_request(paying, make_pdf)
    index_server.docs["d1"] = {"owner_id": paying.user["id"], "file_name": "a.pdf", "file_path": "x"}
    index_server.docs["d2"] = {"owner_id": gifted.user["id"], "file_name": "b.pdf", "file_path": "x"}

    stats = admin.get("/admin/stats").get_json()
    assert stats["users"]["total"] == 4
    assert stats["users"]["new_today"] == 4
    assert stats["users"]["by_state"] == {"trial": 1, "free": 1, "basic": 1, "pro": 1}
    assert stats["users"]["active_7_days"] >= 2  # the admin and the sender used the app
    assert stats["signups_by_day"][-1]["count"] == 4 and len(stats["signups_by_day"]) == 30
    assert stats["revenue"] == {"paying": {"basic": 0, "pro": 1}, "paying_total": 1,
                                "mrr": config.PRO_PRICE_MONTHLY, "cancelling": 1, "past_due": 0, "granted": 1}
    assert stats["signature_requests"]["total"] == 1
    assert stats["signature_requests"]["by_status"] == {"sent": 1}
    assert stats["documents"]["total"] == 2


def test_users_list_search_and_filter(admin, signup, make_pdf):
    alice = signup("alice@example.com")
    signup("bob@example.com")
    request_id = _send_request(alice, make_pdf)

    listed = admin.get("/admin/users").get_json()
    assert listed["total"] == 3
    assert {u["email"] for u in listed["users"]} == {ADMIN, "alice@example.com", "bob@example.com"}
    row = next(u for u in listed["users"] if u["email"] == "alice@example.com")
    assert row["state"] == "trial" and row["signature_requests"] == 1 and row["sign_in"] == "password"
    assert "password_hash" not in row

    assert [u["email"] for u in admin.get("/admin/users?q=ALICE").get_json()["users"]] == ["alice@example.com"]
    # The request ID from an abuse report finds who sent it
    assert [u["email"] for u in admin.get(f"/admin/users?q={request_id}").get_json()["users"]] == ["alice@example.com"]
    # % and _ are matched literally
    assert admin.get("/admin/users?q=%25").get_json()["total"] == 0
    assert admin.get("/admin/users?state=pro").get_json()["total"] == 0
    assert admin.get("/admin/users?state=trial").get_json()["total"] == 3


def test_user_detail(admin, signup, make_pdf):
    alice = signup("alice@example.com")
    request_id = _send_request(alice, make_pdf)
    detail = admin.get(f"/admin/users/{alice.user['id']}").get_json()["user"]
    assert detail["email"] == "alice@example.com"
    assert detail["plan"]["state"] == "trial"
    assert detail["signature_request_usage"]["used"] == 1
    assert detail["recent_signature_requests"][0]["id"] == request_id
    assert detail["recent_signature_requests"][0]["signers"] == 1
    # Counts and IDs, not the documents' contents
    assert "title" not in detail["recent_signature_requests"][0]
    assert admin.get("/admin/users/nope").status_code == 404


def test_extend_trial_is_logged(admin, signup):
    alice = signup("alice@example.com")
    url = f"/admin/users/{alice.user['id']}/extend-trial"
    before = admin.get(f"/admin/users/{alice.user['id']}").get_json()["user"]["plan"]["trial_days_left"]
    response = admin.post(url, json={"days": 14})
    assert response.status_code == 200
    assert response.get_json()["user"]["plan"]["trial_days_left"] == before + 14
    action = response.get_json()["user"]["admin_actions"][0]
    assert action["action"] == "extend_trial" and action["admin_email"] == ADMIN
    assert admin.get("/admin/stats").get_json()["recent_actions"][0]["user_email"] == "alice@example.com"
    for bad in ({"days": 0}, {"days": 366}, {"days": "x"}, {}):
        assert admin.post(url, json=bad).status_code == 400


def test_changes_must_be_json(admin, signup):
    alice = signup("alice@example.com")
    response = admin.post(f"/admin/users/{alice.user['id']}/sign-out", data="x")
    assert response.status_code == 400


def test_grant_and_end_a_plan(admin, signup):
    alice = signup("alice@example.com")
    base = f"/admin/users/{alice.user['id']}"
    granted = admin.post(f"{base}/grant-plan", json={"plan": "pro", "months": 2}).get_json()["user"]
    assert granted["state"] == "pro" and granted["plan"]["state"] == "pro"
    assert alice.get("/auth/me").get_json()["user"]["plan"]["state"] == "pro"
    assert admin.post(f"{base}/grant-plan", json={"plan": "gold", "months": 1}).status_code == 400
    assert admin.post(f"{base}/grant-plan", json={"plan": "pro", "months": 25}).status_code == 400
    ended = admin.post(f"{base}/end-plan", json={}).get_json()["user"]
    assert ended["state"] == "trial"


def test_subscribers_plans_are_left_to_stripe(admin, signup):
    alice = signup("alice@example.com")
    _set(alice.user["id"], plan="basic", pro_until=(datetime.now(timezone.utc) + timedelta(days=20)).isoformat(),
         stripe_customer_id="cus_1", stripe_subscription_id="sub_1", subscription_status="active")
    base = f"/admin/users/{alice.user['id']}"
    for path, body in (("grant-plan", {"plan": "pro", "months": 1}), ("end-plan", {})):
        response = admin.post(f"{base}/{path}", json=body)
        assert response.status_code == 409
        assert response.get_json()["code"] == "has_subscription"


def test_sign_out_everywhere(admin, signup):
    alice = signup("alice@example.com")
    assert alice.get("/folders").status_code == 200
    assert admin.post(f"/admin/users/{alice.user['id']}/sign-out", json={}).status_code == 200
    assert alice.get("/folders").status_code == 401


def test_last_seen_is_written_at_most_hourly(signup):
    alice = signup("alice@example.com")
    alice.get("/folders")
    with connect_db() as conn:
        first = conn.execute("SELECT last_seen_at FROM users WHERE id = ?", (alice.user["id"],)).fetchone()[0]
    assert first
    alice.get("/folders")
    with connect_db() as conn:
        assert conn.execute("SELECT last_seen_at FROM users WHERE id = ?", (alice.user["id"],)).fetchone()[0] == first
    assert re.match(r"\d{4}-\d\d-\d\dT", first)
