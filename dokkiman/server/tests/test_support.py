"""The Support form: kept, emailed to us with Reply-To the sender, limited per network."""

import sqlite3

import pytest

import config
import email_service
import support


@pytest.fixture(autouse=True)
def outbox(monkeypatch):
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    monkeypatch.setattr(config, "SUPPORT_EMAIL", "help@dokkiman.com")
    email_service.outbox.clear()
    return email_service.outbox


MESSAGE = {"name": "Jordan", "email": "Jordan@Example.com", "topic": "tool",
           "message": "How do I merge a Word file with a PDF?"}


def test_a_message_is_kept_and_emailed_to_us_with_reply_to_the_sender(client, outbox, fresh_db):
    response = client.post("/support", json=MESSAGE)
    assert response.status_code == 200 and response.get_json() == {"sent": True}

    assert len(outbox) == 1
    email = outbox[0]
    assert email["to"] == ["help@dokkiman.com"]
    assert email["reply_to"] == "jordan@example.com"
    assert email["subject"] == "[Support] Question about a tool: Jordan"
    assert "How do I merge a Word file with a PDF?" in email["text"]
    row = sqlite3.connect(fresh_db).execute("SELECT email, topic, emailed, user_id FROM support_messages").fetchone()
    assert row == ("jordan@example.com", "tool", 1, None)


def test_signed_in_messages_say_which_account(signup, outbox, fresh_db):
    user = signup("me@example.com")
    outbox.clear()
    assert user.post("/support", json={**MESSAGE, "email": "me@example.com"}).status_code == 200
    assert f"Signed in as account {user.user['id']}" in outbox[-1]["text"]


def test_the_message_is_escaped_in_the_email(client, outbox):
    client.post("/support", json={**MESSAGE, "message": "<script>alert(1)</script> please help"})
    assert "<script>" not in outbox[-1]["html"]
    assert "&lt;script&gt;" in outbox[-1]["html"]


@pytest.mark.parametrize("change,error", [
    ({"email": "not-an-email"}, "Enter your email"),
    ({"topic": "spam"}, "Choose what your message is about"),
    ({"message": "help"}, "Tell us a little more"),
    ({"message": "x" * 5001}, "up to 5000 characters"),
])
def test_messages_are_checked(client, outbox, change, error):
    response = client.post("/support", json={**MESSAGE, **change})
    assert response.status_code == 400 and error in response.get_json()["error"]
    assert outbox == []


def test_bots_filling_the_hidden_field_are_quietly_ignored(client, outbox, fresh_db):
    response = client.post("/support", json={**MESSAGE, "website": "http://spam.example"})
    assert response.status_code == 200
    assert outbox == []
    assert sqlite3.connect(fresh_db).execute("SELECT COUNT(*) FROM support_messages").fetchone()[0] == 0


def test_messages_are_limited_per_network(app, outbox, monkeypatch):
    monkeypatch.setattr(support, "MAX_MESSAGES_PER_HOUR", 2)
    browser = app.test_client()
    assert browser.post("/support", json=MESSAGE).status_code == 200
    assert browser.post("/support", json=MESSAGE).status_code == 200
    blocked = browser.post("/support", json=MESSAGE)
    assert blocked.status_code == 429 and "wait a little" in blocked.get_json()["error"]


def test_kept_even_when_the_email_fails(client, monkeypatch, fresh_db):
    def fail(*args, **kwargs):
        raise email_service.EmailError("down")
    monkeypatch.setattr(support, "send_email", fail)
    assert client.post("/support", json=MESSAGE).status_code == 200
    assert sqlite3.connect(fresh_db).execute("SELECT emailed FROM support_messages").fetchone() == (0,)
