"""Free trial, caps, Basic and Pro plans and the manage_users admin tool."""

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
        "max_conversions_per_day": None,
    }
    assert plan["usage"] == {"questions_today": 0, "conversions_today": 0}


def test_public_plan_terms(client):
    assert client.get("/plans").get_json() == {
        "trial_days": config.TRIAL_DAYS,
        "trial_max_documents": config.TRIAL_MAX_DOCUMENTS,
        "trial_max_questions_per_day": config.TRIAL_MAX_QUESTIONS_PER_DAY,
        "guest_max_documents": config.GUEST_MAX_DOCUMENTS,
        "guest_max_questions": config.GUEST_MAX_QUESTIONS,
        "support_email": config.SUPPORT_EMAIL,
        "guest_file_hours": config.GUEST_FILE_HOURS,
        "guest_conversions_per_hour": config.GUEST_CONVERSIONS_PER_HOUR,
        "free_max_documents": config.FREE_MAX_DOCUMENTS,
        "free_max_questions_per_day": config.FREE_MAX_QUESTIONS_PER_DAY,
        "free_conversions_per_day": config.FREE_CONVERSIONS_PER_DAY,
        "basic_price_monthly": config.BASIC_PRICE_MONTHLY,
        "basic_price_yearly": config.BASIC_PRICE_YEARLY,
        "basic_max_documents": config.BASIC_MAX_DOCUMENTS,
        "basic_max_questions_per_day": config.BASIC_MAX_QUESTIONS_PER_DAY,
        "pro_price_monthly": config.PRO_PRICE_MONTHLY,
        "pro_price_yearly": config.PRO_PRICE_YEARLY,
        "pro_fair_use_questions_per_day": config.PRO_FAIR_USE_QUESTIONS_PER_DAY,
        "trial_signature_requests_per_month": config.SIGNATURE_REQUESTS_PER_MONTH_TRIAL,
        "free_signature_requests_per_month": config.SIGNATURE_REQUESTS_PER_MONTH_FREE,
        "basic_signature_requests_per_month": config.SIGNATURE_REQUESTS_PER_MONTH_BASIC,
        "pro_signature_requests_per_month": config.SIGNATURE_REQUESTS_PER_MONTH_PRO,
        "online_payments": bool(config.STRIPE_SECRET_KEY),
    }


def test_account_moves_to_the_free_plan_when_the_trial_ends(signup, fresh_db):
    user_client = signup()
    _set_user(fresh_db, trial_ends_at=EXPIRED)
    plan = user_client.get("/auth/me").get_json()["user"]["plan"]
    assert plan["state"] == "free"
    assert plan["trial_days_left"] == 0
    assert plan["limits"] == {
        "max_documents": config.FREE_MAX_DOCUMENTS,
        "max_questions_per_day": config.FREE_MAX_QUESTIONS_PER_DAY,
        "max_conversions_per_day": config.FREE_CONVERSIONS_PER_DAY,
    }


# --- caps during the trial -----------------------------------------------

def test_document_cap(signup, monkeypatch, index_server):
    monkeypatch.setattr(plans, "TRIAL_MAX_DOCUMENTS", 2)
    user_client = signup()
    assert _upload(user_client, "a.pdf").status_code == 200
    assert _upload(user_client, "b.pdf").status_code == 200

    blocked = _upload(user_client, "c.pdf")
    assert blocked.status_code == 402
    assert blocked.get_json()["code"] == "document_limit"
    assert "free trial allows up to 2 documents" in blocked.get_json()["error"]
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
    assert blocked.status_code == 402
    assert blocked.get_json()["code"] == "question_limit"
    assert user_client.get("/auth/me").get_json()["user"]["plan"]["usage"]["questions_today"] == 2


def test_question_cap_resets_the_next_day(signup, monkeypatch):
    monkeypatch.setattr(plans, "TRIAL_MAX_QUESTIONS_PER_DAY", 1)
    user_client = signup()
    doc_id = _upload(user_client).get_json()["doc_id"]

    monkeypatch.setattr(plans, "_today", lambda: "2030-01-01")
    assert _chat(user_client, doc_id).status_code == 200
    assert _chat(user_client, doc_id).status_code == 402

    monkeypatch.setattr(plans, "_today", lambda: "2030-01-02")
    assert _chat(user_client, doc_id).status_code == 200


def test_query_route_shares_the_question_cap(signup, monkeypatch):
    monkeypatch.setattr(plans, "TRIAL_MAX_QUESTIONS_PER_DAY", 1)
    user_client = signup()
    assert user_client.get("/queryFile?text=hello").status_code == 200
    assert user_client.get("/queryFile?text=again").status_code == 402


def test_conversions_are_unlimited_during_the_trial(signup, monkeypatch, make_pdf):
    monkeypatch.setattr(plans, "FREE_CONVERSIONS_PER_DAY", 1)
    user_client = signup()
    for _ in range(3):
        assert _split(user_client, make_pdf()).status_code == 200


# --- Free plan (after the trial) ---------------------------------------------

def _split(user_client, pdf_path):
    with open(pdf_path, "rb") as f:
        return user_client.post("/splitPdf", data={"file": (io.BytesIO(f.read()), "a.pdf"), "mode": "every"},
                                content_type="multipart/form-data")


def test_free_plan_keeps_everything_working_with_smaller_caps(signup, fresh_db, monkeypatch, make_pdf):
    monkeypatch.setattr(plans, "FREE_MAX_DOCUMENTS", 1)
    monkeypatch.setattr(plans, "FREE_MAX_QUESTIONS_PER_DAY", 1)
    user_client = signup()
    _set_user(fresh_db, trial_ends_at=EXPIRED)

    doc_id = _upload(user_client, "a.pdf").get_json()["doc_id"]
    blocked_upload = _upload(user_client, "b.pdf")
    assert blocked_upload.status_code == 402
    assert "Free plan allows up to 1 document." in blocked_upload.get_json()["error"]

    assert _chat(user_client, doc_id).status_code == 200
    blocked_chat = _chat(user_client, doc_id)
    assert blocked_chat.status_code == 402
    assert blocked_chat.get_json()["code"] == "question_limit"
    assert "Free plan" in blocked_chat.get_json()["error"]

    # Viewing and deleting always work
    assert user_client.get(f"/getFullDocument/{doc_id}").status_code == 200
    assert user_client.delete(f"/documents/{doc_id}").status_code == 200
    assert _upload(user_client, "c.pdf").status_code == 200


def test_documents_kept_from_the_trial_stay_but_block_new_uploads(signup, fresh_db, monkeypatch):
    monkeypatch.setattr(plans, "FREE_MAX_DOCUMENTS", 1)
    user_client = signup()
    ids = [_upload(user_client, f"{n}.pdf").get_json()["doc_id"] for n in range(3)]
    _set_user(fresh_db, trial_ends_at=EXPIRED)

    assert sorted(d["id"] for d in user_client.get("/getDocuments").get_json()) == sorted(ids)
    assert _upload(user_client, "new.pdf").status_code == 402


def test_free_plan_conversions_have_a_daily_fair_use_limit(signup, fresh_db, monkeypatch, make_pdf):
    monkeypatch.setattr(plans, "FREE_CONVERSIONS_PER_DAY", 2)
    user_client = signup()
    _set_user(fresh_db, trial_ends_at=EXPIRED)

    # A failed conversion doesn't count
    bad = user_client.post("/splitPdf", data={"file": (io.BytesIO(b"not a pdf"), "a.pdf"), "mode": "every"},
                           content_type="multipart/form-data")
    assert bad.status_code == 400
    assert _split(user_client, make_pdf()).status_code == 200
    assert _split(user_client, make_pdf()).status_code == 200

    blocked = _split(user_client, make_pdf())
    assert blocked.status_code == 402
    assert blocked.get_json()["code"] == "conversion_limit"
    assert user_client.get("/auth/me").get_json()["user"]["plan"]["usage"]["conversions_today"] == 2

    monkeypatch.setattr(plans, "_today", lambda: "2099-01-01")
    assert _split(user_client, make_pdf()).status_code == 200


@pytest.mark.parametrize("path,data", [
    ("/convertPdfToWord", {}),
    ("/convertWordToPdf", {}),
    ("/signPdf", {"placements": "[]"}),
])
def test_every_tool_shares_the_free_conversion_limit(signup, fresh_db, monkeypatch, path, data):
    monkeypatch.setattr(plans, "FREE_CONVERSIONS_PER_DAY", 0)
    user_client = signup()
    _set_user(fresh_db, trial_ends_at=EXPIRED)
    response = user_client.post(path, data={"file": (io.BytesIO(b"x"), "a.pdf"), **data},
                                content_type="multipart/form-data")
    assert response.status_code == 402
    assert response.get_json()["code"] == "conversion_limit"


# --- Pro plan --------------------------------------------------------------

def test_pro_has_no_caps_even_after_trial_end(signup, fresh_db, monkeypatch, make_pdf):
    monkeypatch.setattr(plans, "FREE_MAX_DOCUMENTS", 1)
    monkeypatch.setattr(plans, "FREE_MAX_QUESTIONS_PER_DAY", 1)
    monkeypatch.setattr(plans, "FREE_CONVERSIONS_PER_DAY", 0)
    user_client = signup()
    _set_user(fresh_db, plan="pro", trial_ends_at=EXPIRED)

    doc_id = _upload(user_client, "a.pdf").get_json()["doc_id"]
    assert _upload(user_client, "b.pdf").status_code == 200
    assert _chat(user_client, doc_id).status_code == 200
    assert _chat(user_client, doc_id).status_code == 200
    assert _split(user_client, make_pdf()).status_code == 200
    assert user_client.get("/auth/me").get_json()["user"]["plan"]["state"] == "pro"


def test_public_plan_terms_include_free_plan_and_prices(client):
    info = client.get("/plans").get_json()
    assert info["free_max_documents"] == config.FREE_MAX_DOCUMENTS
    assert info["free_max_questions_per_day"] == config.FREE_MAX_QUESTIONS_PER_DAY
    assert info["free_conversions_per_day"] == config.FREE_CONVERSIONS_PER_DAY
    assert info["pro_price_monthly"] == 9.99
    assert info["pro_price_yearly"] == 90
    assert info["basic_price_monthly"] == 1.99
    assert info["basic_price_yearly"] == 19.99


# --- Basic plan --------------------------------------------------------------

def test_basic_has_its_own_caps_and_unlimited_conversions(signup, fresh_db, monkeypatch, make_pdf):
    monkeypatch.setattr(plans, "BASIC_MAX_DOCUMENTS", 2)
    monkeypatch.setattr(plans, "BASIC_MAX_QUESTIONS_PER_DAY", 1)
    monkeypatch.setattr(plans, "FREE_CONVERSIONS_PER_DAY", 0)
    user_client = signup()
    _set_user(fresh_db, plan="basic", trial_ends_at=EXPIRED, pro_until="2099-01-01T00:00:00+00:00")

    plan = user_client.get("/auth/me").get_json()["user"]["plan"]
    assert plan["state"] == "basic"
    assert plan["limits"] == {"max_documents": 2, "max_questions_per_day": 1, "max_conversions_per_day": None}
    assert plan["usage"] == {"questions_today": 0, "conversions_today": 0}

    doc_id = _upload(user_client, "a.pdf").get_json()["doc_id"]
    assert _upload(user_client, "b.pdf").status_code == 200
    blocked_upload = _upload(user_client, "c.pdf")
    assert blocked_upload.status_code == 402
    assert "Basic plan allows up to 2 documents" in blocked_upload.get_json()["error"]
    assert "upgrade to Pro" in blocked_upload.get_json()["error"]

    assert _chat(user_client, doc_id).status_code == 200
    blocked_chat = _chat(user_client, doc_id)
    assert blocked_chat.status_code == 402
    assert blocked_chat.get_json()["code"] == "question_limit"
    assert "Basic plan" in blocked_chat.get_json()["error"]

    # Conversions aren't capped on Basic, even with the Free plan's cap at 0
    assert _split(user_client, make_pdf()).status_code == 200


def test_basic_ends_with_its_paid_period_and_the_account_moves_to_free(signup, fresh_db):
    user_client = signup()
    _set_user(fresh_db, plan="basic", trial_ends_at=EXPIRED, pro_until=EXPIRED)
    assert user_client.get("/auth/me").get_json()["user"]["plan"]["state"] == "free"


# --- Pro paid periods and fair use --------------------------------------------

def test_pro_ends_with_its_paid_period_and_the_account_moves_to_free(signup, fresh_db):
    user_client = signup()
    _set_user(fresh_db, plan="pro", trial_ends_at=EXPIRED, pro_until="2099-01-01T00:00:00+00:00")
    plan = user_client.get("/auth/me").get_json()["user"]["plan"]
    assert plan["state"] == "pro"
    assert plan["pro_until"].startswith("2099-01-01")

    _set_user(fresh_db, pro_until=EXPIRED)
    assert user_client.get("/auth/me").get_json()["user"]["plan"]["state"] == "free"


def test_pro_ending_during_the_trial_returns_to_the_trial(signup, fresh_db):
    user_client = signup()
    _set_user(fresh_db, plan="pro", pro_until=EXPIRED)
    assert user_client.get("/auth/me").get_json()["user"]["plan"]["state"] == "trial"


def test_pro_questions_have_a_fair_use_limit(signup, fresh_db, monkeypatch):
    monkeypatch.setattr(plans, "PRO_FAIR_USE_QUESTIONS_PER_DAY", 2)
    monkeypatch.setattr(plans, "SUPPORT_EMAIL", "help@example.com")
    user_client = signup()
    _set_user(fresh_db, plan="pro")
    doc_id = _upload(user_client).get_json()["doc_id"]

    assert _chat(user_client, doc_id).status_code == 200
    assert _chat(user_client, doc_id).status_code == 200
    blocked = _chat(user_client, doc_id)
    # Not an upgrade question: 429, so the app doesn't offer an upgrade
    assert blocked.status_code == 429
    assert blocked.get_json()["code"] == "fair_use_limit"
    assert "help@example.com" in blocked.get_json()["error"]

    monkeypatch.setattr(plans, "_today", lambda: "2099-01-01")
    assert _chat(user_client, doc_id).status_code == 200


def test_cli_upgrade_for_a_paid_period_and_renewal(signup, monkeypatch, capsys):
    from datetime import datetime, timedelta, timezone

    user_id = signup("me@example.com").user["id"]
    today = datetime.now(timezone.utc)

    out = _run_cli(monkeypatch, capsys, "upgrade", "me@example.com", "--months", "1")
    first_end = datetime.fromisoformat(plans.plan_status(user_id)["pro_until"])
    assert timedelta(days=27) < first_end - today < timedelta(days=32)
    assert "moves to the Free plan" in out
    assert f"pro until {first_end:%Y-%m-%d}" in _run_cli(monkeypatch, capsys, "list")

    # Renewing early adds to the current end date, so no paid days are lost
    _run_cli(monkeypatch, capsys, "upgrade", "me@example.com", "--years", "1")
    second_end = datetime.fromisoformat(plans.plan_status(user_id)["pro_until"])
    assert timedelta(days=360) < second_end - first_end < timedelta(days=367)

    _run_cli(monkeypatch, capsys, "downgrade", "me@example.com")
    assert plans.plan_status(user_id)["state"] == "trial"


@pytest.mark.parametrize("start,months,expected", [
    ("2026-01-31", 1, "2026-02-28"),
    ("2028-01-31", 1, "2028-02-29"),
    ("2026-11-15", 2, "2027-01-15"),
    ("2026-12-31", 12, "2027-12-31"),
])
def test_months_are_calendar_months(start, months, expected):
    from datetime import datetime

    assert manage_users._add_months(datetime.fromisoformat(start), months).date().isoformat() == expected


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
    assert "pro (no end date)" in _run_cli(monkeypatch, capsys, "list")

    _run_cli(monkeypatch, capsys, "downgrade", "me@example.com")
    assert plans.plan_status(user_id)["state"] == "trial"


def test_cli_upgrade_to_basic_and_then_pro(signup, monkeypatch, capsys):
    user_id = signup("me@example.com").user["id"]

    out = _run_cli(monkeypatch, capsys, "upgrade", "me@example.com", "--plan", "basic", "--months", "1")
    assert "is on Basic until" in out
    basic_end = plans.plan_status(user_id)["pro_until"]
    assert plans.plan_status(user_id)["state"] == "basic"
    assert f"basic until {basic_end[:10]}" in _run_cli(monkeypatch, capsys, "list")

    # Moving to Pro starts a new period today rather than adding to the Basic one
    _run_cli(monkeypatch, capsys, "upgrade", "me@example.com", "--months", "1")
    status = plans.plan_status(user_id)
    assert status["state"] == "pro"
    assert status["pro_until"][:10] == basic_end[:10]


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


def test_anonymous_usage_counts_are_deleted_after_30_days(fresh_db, signup):
    """The privacy policy promises this for guests and network addresses."""
    import sqlite3

    import plans

    user_id = signup().user["id"]
    old = (plans._now() - plans.timedelta(days=plans.ANONYMOUS_USAGE_DAYS + 1)).date().isoformat()
    recent = (plans._now() - plans.timedelta(days=plans.ANONYMOUS_USAGE_DAYS - 1)).date().isoformat()
    with sqlite3.connect(fresh_db) as conn:
        conn.executemany("INSERT INTO daily_usage (user_id, day, questions) VALUES (?, ?, 1)", [
            ("ip:10.0.0.1", old), ("guest_abc", old), ("ip:10.0.0.1", recent), (user_id, old),
            ("guestbook-user", old),  # an account ID that only looks similar
        ])

    plans.init_plans()  # runs at start-up (and on every count)

    with sqlite3.connect(fresh_db) as conn:
        rows = set(conn.execute("SELECT user_id, day FROM daily_usage"))
    assert rows == {("ip:10.0.0.1", recent), (user_id, old), ("guestbook-user", old)}
