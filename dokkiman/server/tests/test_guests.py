"""Guests (no account) trying the tools: access, limits, and keeping their work on sign-up."""

import io

import pytest

import config
import plans


def _upload(client, name="report.pdf"):
    return client.post(
        "/uploadFile",
        data={"file": (io.BytesIO(b"%PDF-1.4 test"), name), "processing_mode": "fast"},
        content_type="multipart/form-data",
    )


def _chat(client, doc_id, message="What is this?"):
    return client.post("/chat", json={"message": message, "documentId": doc_id})


def _split(client, make_pdf):
    return client.post(
        "/splitPdf",
        data={"file": (io.BytesIO(make_pdf(pages=2).read_bytes()), "a.pdf"), "mode": "every"},
        content_type="multipart/form-data",
    )


# --- access ------------------------------------------------------------------

def test_guests_can_use_the_converters(client, make_pdf):
    assert _split(client, make_pdf).status_code == 200


def test_guests_can_upload_and_chat(client, index_server):
    doc_id = _upload(client).get_json()["doc_id"]
    assert index_server.docs[doc_id]["owner_id"].startswith("guest_")

    response = _chat(client, doc_id)
    assert response.status_code == 200
    assert response.get_json()["response"] == "Answer to: What is this?"


def test_guests_cannot_use_account_features(client):
    for method, path in [("get", "/getDocuments"), ("delete", "/documents/x"),
                         ("get", "/documents/x/file"), ("get", "/queryFile?text=hi")]:
        assert getattr(client, method)(path).status_code == 401, path


def test_guests_are_kept_apart(app, index_server):
    alice, bob = app.test_client(), app.test_client()
    doc_id = _upload(alice).get_json()["doc_id"]
    assert _chat(bob, doc_id).status_code == 400  # not Bob's document
    assert _chat(alice, doc_id).status_code == 200


def test_guest_identity_persists_across_requests(client, index_server):
    doc_id = _upload(client).get_json()["doc_id"]
    owner = index_server.docs[doc_id]["owner_id"]
    _chat(client, doc_id)
    assert index_server.calls[-1][3] == owner


def test_public_plan_info_includes_guest_limits(client):
    info = client.get("/plans").get_json()
    assert info["guest_max_documents"] == config.GUEST_MAX_DOCUMENTS
    assert info["guest_max_questions"] == config.GUEST_MAX_QUESTIONS


# --- guest limits -----------------------------------------------------------------

def test_guest_document_limit(client):
    assert _upload(client, "a.pdf").status_code == 200
    blocked = _upload(client, "b.pdf")
    assert blocked.status_code == 402
    assert blocked.get_json()["code"] == "guest_limit"
    assert "Create a free account" in blocked.get_json()["error"]


def test_guest_question_limit(client, monkeypatch):
    monkeypatch.setattr(plans, "GUEST_MAX_QUESTIONS", 2)
    doc_id = _upload(client).get_json()["doc_id"]
    assert _chat(client, doc_id).status_code == 200
    assert _chat(client, doc_id).status_code == 200

    blocked = _chat(client, doc_id)
    assert blocked.status_code == 402
    assert blocked.get_json()["code"] == "guest_limit"


def test_clearing_cookies_does_not_reset_guest_limits(app, monkeypatch):
    """Limits are also counted per network address."""
    monkeypatch.setattr(plans, "GUEST_IP_MAX_DOCUMENTS_PER_DAY", 2)
    monkeypatch.setattr(plans, "GUEST_IP_MAX_QUESTIONS_PER_DAY", 1)
    first, second, third = app.test_client(), app.test_client(), app.test_client()

    doc_id = _upload(first).get_json()["doc_id"]
    assert _chat(first, doc_id).status_code == 200
    # A "new" guest from the same address: question allowance is already used
    second_doc = _upload(second).get_json()["doc_id"]
    assert _chat(second, second_doc).status_code == 402
    # ...and so is the daily document allowance for that address
    assert _upload(third).status_code == 402


def test_guest_conversion_rate_limit(client, make_pdf, monkeypatch):
    monkeypatch.setattr(plans, "GUEST_CONVERSIONS_PER_HOUR", 2)
    monkeypatch.setattr(plans, "_guest_conversions", {})
    assert _split(client, make_pdf).status_code == 200
    assert _split(client, make_pdf).status_code == 200

    blocked = _split(client, make_pdf)
    assert blocked.status_code == 429
    assert blocked.get_json()["code"] == "guest_rate_limit"


def test_accounts_are_not_held_to_guest_limits(signup, make_pdf, monkeypatch):
    monkeypatch.setattr(plans, "GUEST_CONVERSIONS_PER_HOUR", 1)
    monkeypatch.setattr(plans, "_guest_conversions", {})
    user_client = signup()
    for _ in range(3):
        assert _split(user_client, make_pdf).status_code == 200
    assert _upload(user_client, "a.pdf").status_code == 200
    assert _upload(user_client, "b.pdf").status_code == 200


# --- keeping guest work ------------------------------------------------------------

@pytest.mark.parametrize("route", ["/auth/signup", "/auth/login"])
def test_signing_up_or_in_keeps_the_guest_document(client, signup, index_server, route):
    if route == "/auth/login":
        signup("me@example.com", "password-123")
    doc_id = _upload(client).get_json()["doc_id"]

    response = client.post(route, json={"email": "me@example.com", "password": "password-123"})
    assert response.status_code in (200, 201)

    assert [d["id"] for d in client.get("/getDocuments").get_json()] == [doc_id]
    assert not index_server.docs[doc_id]["owner_id"].startswith("guest_")


def test_proxy_address_is_used_when_trusted(make_pdf, monkeypatch):
    """Behind Caddy, each visitor's own address is rate-limited, not the proxy's."""
    from werkzeug.middleware.proxy_fix import ProxyFix
    import flask_demo

    monkeypatch.setattr(plans, "GUEST_CONVERSIONS_PER_HOUR", 1)
    monkeypatch.setattr(plans, "_guest_conversions", {})
    monkeypatch.setattr(flask_demo.app, "wsgi_app", ProxyFix(flask_demo.app.wsgi_app, x_for=1))
    client = flask_demo.app.test_client()

    def split_from(address):
        return client.post(
            "/splitPdf",
            data={"file": (io.BytesIO(make_pdf(pages=2).read_bytes()), "a.pdf"), "mode": "every"},
            content_type="multipart/form-data",
            headers={"X-Forwarded-For": address},
        )

    assert split_from("203.0.113.1").status_code == 200
    assert split_from("203.0.113.1").status_code == 429
    assert split_from("203.0.113.2").status_code == 200  # a different visitor
