"""E-Sign: requesting signatures from other people by email."""

import hashlib
import io
import json
import re
import sqlite3

import fitz
import pytest
from PIL import Image

import config
import email_service
import signature_requests

EXPIRED = "2020-01-01T00:00:00+00:00"


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    """Emails are collected instead of sent."""
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    email_service.outbox.clear()
    return email_service.outbox


def _png(color=(20, 20, 120, 255)):
    out = io.BytesIO()
    Image.new("RGBA", (120, 40), color).save(out, format="PNG")
    return out.getvalue()


def _field(signer=0, kind="signature", page=0, x=0.1, y=0.7, width=0.3, height=0.06):
    return {"signer": signer, "kind": kind, "page": page, "x": x, "y": y, "width": width, "height": height}


SIGNERS = [{"name": "Alex Lee", "email": "alex@example.com"}, {"name": "Sam Ray", "email": "sam@example.com"}]


def _create(user_client, make_pdf, signers=SIGNERS, fields=None, pages=2, **extra):
    if fields is None:
        fields = [_field(0), _field(1, x=0.55), _field(0, "date", y=0.8, height=0.03),
                  _field(1, "initials", page=1, width=0.1), _field(1, "name", page=1, y=0.2, height=0.03)]
    data = {"title": "Lease", "message": "Please sign", "signers": signers, "fields": fields, **extra}
    with open(make_pdf(pages=pages, name="lease.pdf"), "rb") as f:
        return user_client.post("/signature-requests", data={"file": (f, "lease.pdf"), "data": json.dumps(data)},
                                content_type="multipart/form-data")


def _token_for(outbox, email):
    """The signing link token in the newest email to `email`."""
    for message in reversed(outbox):
        if message["to"] == [email]:
            match = re.search(r"/sign/([\w-]+)", message["text"])
            if match:
                return match.group(1)
    raise AssertionError(f"No signing link emailed to {email}")


def _sign(client, token, signature=True, initials=False, consent="true"):
    data = {"consent": consent}
    if signature:
        data["signature"] = (io.BytesIO(_png()), "signature.png")
    if initials:
        data["initials"] = (io.BytesIO(_png((120, 20, 20, 255))), "initials.png")
    return client.post(f"/signing/{token}", data=data, content_type="multipart/form-data")


def _set(db_path, sql, *params):
    with sqlite3.connect(db_path) as conn:
        conn.execute(sql, params)


# --- sending --------------------------------------------------------------------------

def test_sending_emails_every_signer_a_private_link(signup, make_pdf, outbox):
    owner = signup("owner@example.com")
    response = _create(owner, make_pdf)
    assert response.status_code == 201, response.get_json()
    req = response.get_json()["request"]
    assert req["status"] == "sent"
    assert req["page_count"] == 2
    assert [s["status"] for s in req["signers"]] == ["sent", "sent"]

    assert [m["to"] for m in outbox] == [["alex@example.com"], ["sam@example.com"]]
    invite = outbox[0]
    assert invite["subject"] == 'owner@example.com sent you "Lease" to sign'
    assert invite["reply_to"] == "owner@example.com"
    assert "Please sign" in invite["text"]
    assert f"{config.PUBLIC_APP_URL}/sign/" in invite["text"]
    # Different links, and only their hashes are stored
    assert _token_for(outbox, "alex@example.com") != _token_for(outbox, "sam@example.com")
    with sqlite3.connect(config_db()) as conn:
        hashes = [row[0] for row in conn.execute("SELECT token_hash FROM signature_request_signers")]
    assert _token_for(outbox, "alex@example.com") not in hashes


def config_db():
    import db
    return db.DB_PATH


def test_signing_in_order_emails_one_signer_at_a_time(client, signup, make_pdf, outbox):
    owner = signup("owner@example.com")
    req = _create(owner, make_pdf, sequential=True).get_json()["request"]
    assert req["sequential"] is True
    assert [s["status"] for s in req["signers"]] == ["sent", "waiting"]
    assert [m["to"] for m in outbox] == [["alex@example.com"]]

    assert _sign(client, _token_for(outbox, "alex@example.com")).status_code == 200
    # Now it's Sam's turn
    assert outbox[-1]["to"] == ["sam@example.com"]


@pytest.mark.parametrize("change,message", [
    ({"signers": []}, "Add at least one signer"),
    ({"signers": [{"name": "A", "email": "not-an-email"}]}, "doesn't look right"),
    ({"signers": [{"name": "", "email": "a@example.com"}]}, "needs a name"),
    ({"signers": SIGNERS + [{"name": "Alex again", "email": "ALEX@example.com"}]}, "added twice"),
    ({"fields": []}, "Place at least one field"),
    ({"fields": [_field(0), _field(1, "initials")]}, "Place a signature field for Sam Ray"),
    ({"fields": [_field(0), _field(1, page=5)]}, "page that doesn't exist"),
    ({"fields": [_field(0), _field(1, x=0.9)]}, "outside the page"),
    ({"fields": [_field(0), _field(1, kind="stamp")]}, "isn't valid"),
    ({"fields": [_field(0), _field(2)]}, "isn't valid"),
])
def test_requests_are_checked_before_anything_is_sent(signup, make_pdf, outbox, change, message):
    owner = signup()
    kwargs = {"signers": change.get("signers", SIGNERS)}
    if "fields" in change:
        kwargs["fields"] = change["fields"]
    response = _create(owner, make_pdf, **kwargs)
    assert response.status_code == 400
    assert message in response.get_json()["error"]
    assert outbox == []


def test_too_many_signers(signup, make_pdf, monkeypatch):
    monkeypatch.setattr(config, "SIGNATURE_REQUEST_MAX_SIGNERS", 1)
    response = _create(signup(), make_pdf)
    assert response.status_code == 400
    assert "at most 1 signers" in response.get_json()["error"]


def test_guests_cannot_send_requests(client, make_pdf):
    response = _create(client, make_pdf)
    assert response.status_code == 401


# --- signing ---------------------------------------------------------------------------

def test_a_signer_sees_only_their_fields_and_opening_is_recorded(client, signup, make_pdf, outbox):
    owner = signup("owner@example.com")
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]

    info = client.get(f"/signing/{_token_for(outbox, 'sam@example.com')}").get_json()
    assert info["title"] == "Lease"
    assert info["sender"] == "owner@example.com"
    assert info["signer"] == {"name": "Sam Ray", "email": "sam@example.com"}
    assert info["can_sign"] is True
    assert sorted(f["kind"] for f in info["fields"]) == ["initials", "name", "signature"]

    detail = owner.get(f"/signature-requests/{request_id}").get_json()["request"]
    sam = next(s for s in detail["signers"] if s["name"] == "Sam Ray")
    assert sam["status"] == "viewed" and sam["viewed_at"]
    assert [e["event"] for e in detail["events"]] == ["created", "sent", "sent", "viewed"]

    document = client.get(f"/signing/{_token_for(outbox, 'sam@example.com')}/document")
    assert document.status_code == 200
    assert document.mimetype == "application/pdf"


def test_signing_needs_consent_and_each_image(client, signup, make_pdf, outbox):
    _create(signup(), make_pdf)
    sam = _token_for(outbox, "sam@example.com")
    assert _sign(client, sam, initials=True, consent="false").status_code == 400
    missing = _sign(client, sam)  # Sam has an initials field too
    assert missing.status_code == 400
    assert "initials" in missing.get_json()["error"]
    bad = client.post(f"/signing/{sam}", data={"consent": "true", "signature": (io.BytesIO(b"nope"), "s.png"),
                                               "initials": (io.BytesIO(_png()), "i.png")},
                      content_type="multipart/form-data")
    assert bad.status_code == 400


def test_when_everyone_signs_the_final_pdf_goes_to_everyone(client, signup, make_pdf, outbox):
    owner = signup("owner@example.com")
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]
    alex, sam = _token_for(outbox, "alex@example.com"), _token_for(outbox, "sam@example.com")

    first = _sign(client, alex)
    assert first.get_json() == {"signed": True, "completed": False}
    assert _sign(client, alex).status_code == 409  # can't sign twice
    outbox.clear()
    assert _sign(client, sam, initials=True).get_json() == {"signed": True, "completed": True}

    detail = owner.get(f"/signature-requests/{request_id}").get_json()["request"]
    assert detail["status"] == "completed"
    assert detail["completed_at"] and detail["final_sha256"]
    assert detail["events"][-1]["event"] == "completed"

    # Everyone gets the signed PDF and its certificate, as two files (the DocuSign way)
    assert sorted(m["to"][0] for m in outbox) == ["alex@example.com", "owner@example.com", "sam@example.com"]
    (signed_name, signed_pdf), (certificate_name, certificate_pdf) = outbox[0]["attachments"]
    assert (signed_name, certificate_name) == ("lease_signed.pdf", "lease_certificate.pdf")
    assert "Certificate of Completion" in outbox[0]["text"]

    # The signed PDF is clean: the original pages with the signatures, nothing added
    signed = fitz.open(stream=signed_pdf, filetype="pdf")
    assert signed.page_count == 2
    assert "Sam Ray" in signed[1].get_text()  # the name field was filled in
    assert signed[0].get_images() and signed[1].get_images()
    assert detail["final_sha256"] == hashlib.sha256(signed_pdf).hexdigest()

    certificate = fitz.open(stream=certificate_pdf, filetype="pdf")
    text = certificate[0].get_text()
    for expected in ("Certificate of Completion", "Alex Lee <alex@example.com>", "Sam Ray <sam@example.com>",
                     "owner@example.com", request_id, hashlib.sha256(signed_pdf).hexdigest(), "lease_signed.pdf"):
        assert expected in text

    # Downloads: signed (default), certificate, or both in one PDF
    downloaded = owner.get(f"/signature-requests/{request_id}/document")
    assert downloaded.data == signed_pdf
    assert "lease_signed.pdf" in downloaded.headers["Content-Disposition"]
    assert owner.get(f"/signature-requests/{request_id}/document?part=certificate").data == certificate_pdf
    combined = owner.get(f"/signature-requests/{request_id}/document?part=combined")
    assert "lease_signed_with_certificate.pdf" in combined.headers["Content-Disposition"]
    assert fitz.open(stream=combined.data, filetype="pdf").page_count == 3
    assert owner.get(f"/signature-requests/{request_id}/document?part=other").status_code == 400

    # The links stop working
    assert client.get(f"/signing/{alex}").status_code == 404


def test_declining_stops_the_request_and_tells_the_sender(client, signup, make_pdf, outbox):
    owner = signup("owner@example.com")
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]
    alex, sam = _token_for(outbox, "alex@example.com"), _token_for(outbox, "sam@example.com")

    assert client.post(f"/signing/{sam}/decline", json={"reason": "Wrong rent amount"}).get_json() == {"declined": True}
    assert outbox[-1]["to"] == ["owner@example.com"]
    assert "Wrong rent amount" in outbox[-1]["text"]

    detail = owner.get(f"/signature-requests/{request_id}").get_json()["request"]
    assert detail["status"] == "declined"
    sam_status = next(s for s in detail["signers"] if s["name"] == "Sam Ray")
    assert sam_status["status"] == "declined" and sam_status["decline_reason"] == "Wrong rent amount"
    # Nobody can sign it anymore
    assert _sign(client, alex).status_code == 404


def test_signing_out_of_turn_is_refused(client, signup, make_pdf, outbox):
    owner = signup()
    req = _create(owner, make_pdf, sequential=True).get_json()["request"]
    # Sam has no link yet; even with a token planted, it isn't Sam's turn
    token, token_hash = signature_requests._new_token()
    _set(config_db(), "UPDATE signature_request_signers SET token_hash = ? WHERE position = 1", token_hash)
    info = client.get(f"/signing/{token}").get_json()
    assert info["can_sign"] is False and info["reason"] == "not_your_turn"
    response = _sign(client, token, initials=True)
    assert response.status_code == 409
    assert response.get_json()["code"] == "not_your_turn"
    assert req["id"]


def test_expired_requests_cannot_be_signed(client, signup, make_pdf, outbox):
    owner = signup()
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]
    _set(config_db(), "UPDATE signature_requests SET expires_at = ?", EXPIRED)
    token = _token_for(outbox, "alex@example.com")
    assert client.get(f"/signing/{token}").get_json()["reason"] == "expired"
    assert _sign(client, token).status_code == 409
    assert client.get(f"/signing/{token}/document").status_code == 410
    assert owner.get(f"/signature-requests/{request_id}").get_json()["request"]["status"] == "expired"


def test_the_certificate_is_only_ready_when_everyone_has_signed(signup, make_pdf):
    owner = signup()
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]
    original = owner.get(f"/signature-requests/{request_id}/document")
    assert original.status_code == 200
    assert "lease.pdf" in original.headers["Content-Disposition"]
    assert owner.get(f"/signature-requests/{request_id}/document?part=certificate").status_code == 409


def test_unknown_links(client):
    assert client.get("/signing/not-a-real-token").status_code == 404
    assert client.get("/signing/not-a-real-token").get_json()["code"] == "invalid_link"
    assert _sign(client, "not-a-real-token").status_code == 404


# --- managing requests -------------------------------------------------------------------

def test_requests_are_private_to_their_owner(signup, make_pdf):
    owner = signup("owner@example.com")
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]
    other = signup("other@example.com")
    assert other.get(f"/signature-requests/{request_id}").status_code == 404
    assert other.post(f"/signature-requests/{request_id}/cancel").status_code == 404
    assert other.get("/signature-requests").get_json() == {"requests": []}
    listed = owner.get("/signature-requests").get_json()["requests"]
    assert [r["id"] for r in listed] == [request_id]


def test_reminders_send_a_new_link(client, signup, make_pdf, outbox):
    owner = signup()
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]
    old = _token_for(outbox, "alex@example.com")
    response = owner.post(f"/signature-requests/{request_id}/remind")
    assert sorted(response.get_json()["reminded"]) == ["alex@example.com", "sam@example.com"]
    assert outbox[-1]["subject"] == 'Reminder: please sign "Lease"'
    new = _token_for(outbox, "alex@example.com")
    assert new != old
    assert client.get(f"/signing/{old}").status_code == 404
    assert client.get(f"/signing/{new}").status_code == 200
    # Not again within the hour
    assert owner.post(f"/signature-requests/{request_id}/remind").status_code == 429


def test_cancelling_tells_signers_and_closes_the_links(client, signup, make_pdf, outbox):
    owner = signup()
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]
    token = _token_for(outbox, "alex@example.com")
    assert owner.delete(f"/signature-requests/{request_id}").status_code == 409  # cancel first
    outbox.clear()
    assert owner.post(f"/signature-requests/{request_id}/cancel").get_json() == {"status": "cancelled"}
    assert sorted(m["to"][0] for m in outbox) == ["alex@example.com", "sam@example.com"]
    assert client.get(f"/signing/{token}").status_code == 404
    assert owner.post(f"/signature-requests/{request_id}/cancel").status_code == 409

    assert owner.delete(f"/signature-requests/{request_id}").get_json() == {"deleted": True}
    assert owner.get(f"/signature-requests/{request_id}").status_code == 404
    import os
    assert not os.path.exists(signature_requests._folder(request_id))


def test_a_failed_email_is_recorded_and_the_request_still_works(signup, make_pdf, monkeypatch, outbox):
    def failing(*args, **kwargs):
        raise email_service.EmailError("service down")
    monkeypatch.setattr(signature_requests, "send_email", failing)
    owner = signup()
    response = _create(owner, make_pdf)
    assert response.status_code == 201
    request_id = response.get_json()["request"]["id"]
    events = owner.get(f"/signature-requests/{request_id}").get_json()["request"]["events"]
    assert [e["event"] for e in events].count("email_failed") == 2


def test_resend_is_called_when_a_key_is_set(monkeypatch):
    calls = []

    class Response:
        status_code = 200

        def json(self):
            return {"id": "email_1"}

    monkeypatch.setattr(config, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_service.requests, "post", lambda url, **kw: calls.append((url, kw)) or Response())
    assert email_service.send_email("a@example.com", "Hi", "<p>Hi</p>", "Hi",
                                    attachments=[("a.pdf", b"%PDF")], reply_to="b@example.com") == "email_1"
    url, kwargs = calls[0]
    assert url == email_service.RESEND_URL
    assert kwargs["headers"]["Authorization"] == "Bearer re_test"
    assert kwargs["json"]["to"] == ["a@example.com"]
    assert kwargs["json"]["reply_to"] == "b@example.com"
    assert kwargs["json"]["attachments"][0]["filename"] == "a.pdf"


# --- plan limits -------------------------------------------------------------------------

def test_the_trial_allows_a_few_requests_a_month(signup, make_pdf, monkeypatch):
    monkeypatch.setattr("plans.SIGNATURE_REQUESTS_PER_MONTH_TRIAL", 2)
    owner = signup()
    assert _create(owner, make_pdf).status_code == 201
    assert _create(owner, make_pdf).status_code == 201
    blocked = _create(owner, make_pdf)
    assert blocked.status_code == 402
    assert blocked.get_json()["code"] == "signature_request_limit"
    usage = owner.get("/auth/me").get_json()["user"]["plan"]["signature_requests"]
    assert usage == {"limit": 2, "used": 2}


def test_the_free_plan_must_upgrade_to_request_signatures(signup, make_pdf, fresh_db):
    owner = signup()
    _set(fresh_db, "UPDATE users SET trial_ends_at = ?", EXPIRED)
    blocked = _create(owner, make_pdf)
    assert blocked.status_code == 402
    assert "isn't included in the Free plan" in blocked.get_json()["error"]


def test_pro_is_unlimited_within_fair_use(signup, make_pdf, fresh_db, monkeypatch):
    monkeypatch.setattr("plans.PRO_FAIR_USE_SIGNATURE_REQUESTS_PER_MONTH", 3)
    owner = signup()
    _set(fresh_db, "UPDATE users SET plan = 'pro'")
    for _ in range(3):
        assert _create(owner, make_pdf).status_code == 201
    assert owner.get("/auth/me").get_json()["user"]["plan"]["signature_requests"] == {"limit": None, "used": 3}
    blocked = _create(owner, make_pdf)
    assert blocked.status_code == 429
    assert blocked.get_json()["code"] == "fair_use_limit"


# --- misuse protections ----------------------------------------------------------------------

def test_signing_emails_say_who_sent_them_and_how_to_report_misuse(signup, make_pdf, outbox, monkeypatch):
    monkeypatch.setattr(config, "SUPPORT_EMAIL", "support@dokkiman.com")
    owner = signup("owner@example.com")
    request_id = _create(owner, make_pdf).get_json()["request"]["id"]
    invite = outbox[0]
    assert "sent by owner@example.com using Dokkiman" in invite["text"]
    assert "Dokkiman didn't write this message" in invite["text"]
    assert f"report it to support@dokkiman.com (request {request_id})" in invite["text"]
    assert "mailto:support@dokkiman.com?subject=Report%20abuse" in invite["html"]
    assert request_id in invite["html"]


def test_there_is_a_daily_cap_on_every_plan(signup, make_pdf, fresh_db, monkeypatch):
    monkeypatch.setattr(config, "SIGNATURE_REQUESTS_PER_DAY", 2)
    owner = signup()
    _set(fresh_db, "UPDATE users SET plan = 'pro'")  # unlimited per month, still capped per day
    assert _create(owner, make_pdf).status_code == 201
    assert _create(owner, make_pdf).status_code == 201
    blocked = _create(owner, make_pdf)
    assert blocked.status_code == 429
    assert blocked.get_json()["code"] == "daily_limit"
