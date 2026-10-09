"""Deleting an account removes everything of the person's, and nothing of anyone else's."""

import io
import json
import os
import sqlite3

import config
import signature_requests


def _upload(user_client, name="lease.pdf"):
    response = user_client.post("/uploadFile", data={"file": (io.BytesIO(b"%PDF-1.4 test"), name)},
                                content_type="multipart/form-data")
    assert response.status_code == 200
    return response.get_json()["doc_id"]


def _request(user_client, make_pdf):
    data = {"signers": [{"name": "Alex", "email": "alex@example.com"}],
            "fields": [{"signer": 0, "kind": "signature", "page": 0, "x": 0.1, "y": 0.7, "width": 0.3, "height": 0.05}]}
    with open(make_pdf(pages=1), "rb") as f:
        response = user_client.post("/signature-requests", data={"file": (f, "lease.pdf"), "data": json.dumps(data)},
                                    content_type="multipart/form-data")
    assert response.status_code == 201
    return response.get_json()["request"]["id"]


def _count(db_path, table, column, value):
    with sqlite3.connect(db_path) as conn:
        return conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {column} = ?", (value,)).fetchone()[0]


def _everything(user_client, make_pdf):
    """Give an account a document, a folder and a signature request."""
    doc_id = _upload(user_client)
    folder_id = user_client.post("/folders", json={"name": "Willow"}).get_json()["folder"]["id"]
    user_client.post("/folders/move", json={"folder_id": folder_id, "document_ids": [doc_id]})
    request_id = _request(user_client, make_pdf)
    return doc_id, request_id


def test_deleting_needs_confirmation(signup):
    response = signup().delete("/account", json={})
    assert response.status_code == 400
    assert response.get_json()["code"] == "confirmation_required"


def test_deleting_removes_everything_of_the_account_only(signup, make_pdf, fresh_db, index_server, monkeypatch):
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    me = signup("me@example.com")
    my_id = me.user["id"]
    my_doc, my_request = _everything(me, make_pdf)
    other = signup("other@example.com")
    other_doc, other_request = _everything(other, make_pdf)
    assert os.path.exists(signature_requests._folder(my_request))

    response = me.delete("/account", json={"confirm": "delete"})
    assert response.get_json() == {"deleted": True}

    # Signed out, and the account is gone
    assert me.get("/auth/me").status_code == 401
    for table, column in (("users", "id"), ("folders", "owner_id"), ("document_folders", "owner_id"),
                          ("signature_requests", "owner_id"), ("daily_usage", "user_id")):
        assert _count(fresh_db, table, column, my_id) == 0, table
    assert _count(fresh_db, "signature_request_signers", "request_id", my_request) == 0
    assert my_doc not in index_server.docs
    assert not os.path.exists(signature_requests._folder(my_request))

    # The other account is untouched
    assert other.get("/auth/me").status_code == 200
    assert other_doc in index_server.docs
    assert other.get(f"/signature-requests/{other_request}").status_code == 200
    assert other.get("/folders").get_json()["folders"]

    # And the email can sign up again as a new account
    assert signup("me@example.com").user["id"] != my_id


def test_a_renewing_subscription_must_be_cancelled_first(signup, fresh_db):
    me = signup()
    with sqlite3.connect(fresh_db) as conn:
        conn.execute("UPDATE users SET stripe_customer_id = 'cus_1', stripe_subscription_id = 'sub_1',"
                     " subscription_status = 'active', cancel_at_period_end = 0")
    blocked = me.delete("/account", json={"confirm": "DELETE"})
    assert blocked.status_code == 409
    assert blocked.get_json()["code"] == "subscription_active"

    # Once cancelled (still paid until the period ends), deleting is allowed
    with sqlite3.connect(fresh_db) as conn:
        conn.execute("UPDATE users SET cancel_at_period_end = 1")
    assert me.delete("/account", json={"confirm": "DELETE"}).get_json() == {"deleted": True}


def test_guests_have_no_account_to_delete(client):
    assert client.delete("/account", json={"confirm": "DELETE"}).status_code == 401
