"""Free trial, caps, Pro plan and the manage_users admin tool."""

import io
import sqlite3
import sys

import pytest

import config
import manage_users
import plans

EXPIRED = "2020-01-01T00:00:00+00:00"


def _set_user(db_path, **fields):
    assignments = ", ".join(f"{name} = ?" for name in fields)
    with sqlite3.connect(db_path) as conn:
        conn.execute(f"UPDATE users SET {assignments}", tuple(fields.values()))


def _upload(user_client, name="doc.pdf", mode="fast"):
    return user_client.post(
        "/uploadFile",
        data={"file": (io.BytesIO(b"%PDF-1.4 test"), name), "processing_mode": mode},
        content_type="multipart/form-data",
    )


def _chat(user_client, doc_id, message="What is this?"):
    return user_client.post("/chat", json={"message": message, "documentId": doc_id})


# --- trial status ---------------------------------------------------------

def test_new_account_starts_a_trial(signup):
    plan = signup().user["plan"]
    assert plan["state"] == "trial"
    assert plan["trial_days_left"] == config.TRIAL_DAYS
    assert plan["limits"] == {
        "max_documents": config.TRIAL_MAX_DOCUMENTS,
        "max_questions_per_day": config.TRIAL_MAX_QUESTIONS_PER_DAY,
    }
    assert plan["usage"] == {"questions_today": 0}


def test_public_plan_terms(client):
    assert client.get("/plans").get_json() == {
        "trial_days": config.TRIAL_DAYS,
        "trial_max_documents": config.TRIAL_MAX_DOCUMENTS,
        "trial_max_questions_per_day": config.TRIAL_MAX_QUESTIONS_PER_DAY,
    }


def test_expired_trial_state(signup, fresh_db):
    user_client = signup()
    _set_user(fresh_db, trial_ends_at=EXPIRED)
    plan = user_client.get("/auth/me").get_json()["user"]["plan"]
    assert plan["state"] == "expired"
    assert plan["trial_days_left"] == 0


# --- caps during the trial -----------------------------------------------

def test_document_cap(signup, monkeypatch, index_server):
    monkeypatch.setattr(plans, "TRIAL_MAX_DOCUMENTS", 2)
    user_client = signup()
    assert _upload(user_client, "a.pdf").status_code == 200
    assert _upload(user_client, "b.pdf").status_code == 200

    blocked = _upload(user_client, "c.pdf")
    assert blocked.status_code == 403
    assert blocked.get_json()["code"] == "trial_document_limit"
    # Rejected before anything was stored
    assert len(index_server.docs) == 2


def test_question_cap_counts_only_answered_questions(signup, monkeypatch):
    monkeypatch.setattr(plans, "TRIAL_MAX_QUESTIONS_PER_DAY", 2)
    user_client = signup()
    doc_id = _upload(user_client).get_json()["doc_id"]

    # A failed question (unknown document) doesn't use up the allowance
    assert _chat(user_client, "missing-doc").status_code == 400
    assert _chat(user_client, doc_id).status_code == 200
    assert _chat(user_client, doc_id).status_code == 200

    blocked = _chat(user_client, doc_id)
    assert blocked.status_code == 429
    assert blocked.get_json()["code"] == "trial_question_limit"
    assert user_client.get("/auth/me").get_json()["user"]["plan"]["usage"]["questions_today"] == 2


def test_question_cap_resets_the_next_day(signup, monkeypatch):
    monkeypatch.setattr(plans, "TRIAL_MAX_QUESTIONS_PER_DAY", 1)
    user_client = signup()
    doc_id = _upload(user_client).get_json()["doc_id"]

    monkeypatch.setattr(plans, "_today", lambda: "2030-01-01")
    assert _chat(user_client, doc_id).status_code == 200
    assert _chat(user_client, doc_id).status_code == 429

    monkeypatch.setattr(plans, "_today", lambda: "2030-01-02")
    assert _chat(user_client, doc_id).status_code == 200


def test_query_route_shares_the_question_cap(signup, monkeypatch):
    monkeypatch.setattr(plans, "TRIAL_MAX_QUESTIONS_PER_DAY", 1)
    user_client = signup()
    assert user_client.get("/queryFile?text=hello").status_code == 200
    assert user_client.get("/queryFile?text=again").status_code == 429


# --- expired trial: read-only --------------------------------------------

@pytest.mark.parametrize("method,path,kwargs", [
    ("post", "/uploadFile", {"data": {"file": (io.BytesIO(b"x"), "a.pdf")}, "content_type": "multipart/form-data"}),
    ("post", "/chat", {"json": {"message": "hi", "documentId": "d"}}),
    ("get", "/queryFile?text=hi", {}),
    ("post", "/backgroundIndex/d", {}),
    ("post", "/convertPdfToWord", {"data": {"file": (io.BytesIO(b"x"), "a.pdf")}, "content_type": "multipart/form-data"}),
    ("post", "/convertWordToPdf", {"data": {"file": (io.BytesIO(b"x"), "a.docx")}, "content_type": "multipart/form-data"}),
])
def test_expired_trial_blocks_product_features(signup, fresh_db, method, path, kwargs):
    user_client = signup()
    _set_user(fresh_db, trial_ends_at=EXPIRED)
    response = getattr(user_client, method)(path, **kwargs)
    assert response.status_code == 402
    assert response.get_json()["code"] == "trial_expired"


def test_expired_trial_can_still_list_view_and_delete(signup, fresh_db):
    user_client = signup()
    doc_id = _upload(user_client).get_json()["doc_id"]
    _set_user(fresh_db, trial_ends_at=EXPIRED)

    assert [d["id"] for d in user_client.get("/getDocuments").get_json()] == [doc_id]
    assert user_client.get(f"/getFullDocument/{doc_id}").status_code == 200
    assert user_client.delete(f"/documents/{doc_id}").status_code == 200


# --- Pro plan --------------------------------------------------------------

def test_pro_has_no_caps_even_after_trial_end(signup, fresh_db, monkeypatch):
    monkeypatch.setattr(plans, "TRIAL_MAX_DOCUMENTS", 1)
    monkeypatch.setattr(plans, "TRIAL_MAX_QUESTIONS_PER_DAY", 1)
    user_client = signup()
    _set_user(fresh_db, plan="pro", trial_ends_at=EXPIRED)

    doc_id = _upload(user_client, "a.pdf").get_json()["doc_id"]
    assert _upload(user_client, "b.pdf").status_code == 200
    assert _chat(user_client, doc_id).status_code == 200
    assert _chat(user_client, doc_id).status_code == 200
    assert user_client.get("/auth/me").get_json()["user"]["plan"]["state"] == "pro"


# --- database migration ------------------------------------------------------

def test_init_plans_upgrades_an_old_users_table(tmp_path, monkeypatch):
    import db

    db_path = tmp_path / "old.db"
    monkeypatch.setattr(db, "DB_PATH", str(db_path))
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, created_at TEXT)")
        conn.execute("INSERT INTO users VALUES ('u1', 'old@example.com', 'x', '2026-01-01')")

    plans.init_plans()

    status = plans.plan_status("u1")
    assert status["state"] == "trial"
    assert status["trial_days_left"] == config.TRIAL_DAYS


# --- manage_users.py ----------------------------------------------------------

def _run_cli(monkeypatch, capsys, *args):
    monkeypatch.setattr(sys, "argv", ["manage_users.py", *args])
    manage_users.main()
    return capsys.readouterr().out


def test_cli_upgrade_downgrade_and_list(signup, monkeypatch, capsys):
    user_id = signup("me@example.com").user["id"]

    assert "trial, 7 day(s) left" in _run_cli(monkeypatch, capsys, "list")

    _run_cli(monkeypatch, capsys, "upgrade", "ME@example.com")
    assert plans.plan_status(user_id)["state"] == "pro"
    assert "pro" in _run_cli(monkeypatch, capsys, "list")

    _run_cli(monkeypatch, capsys, "downgrade", "me@example.com")
    assert plans.plan_status(user_id)["state"] == "trial"


def test_cli_extend_trial_counts_from_today_when_expired(signup, fresh_db, monkeypatch, capsys):
    user_id = signup("me@example.com").user["id"]
    _set_user(fresh_db, trial_ends_at=EXPIRED)

    _run_cli(monkeypatch, capsys, "extend-trial", "me@example.com", "3")

    status = plans.plan_status(user_id)
    assert status["state"] == "trial"
    assert status["trial_days_left"] == 3


def test_cli_unknown_email_fails(fresh_db, monkeypatch, capsys):
    with pytest.raises(SystemExit) as exit_info:
        _run_cli(monkeypatch, capsys, "upgrade", "nobody@example.com")
    assert "No account" in str(exit_info.value)
