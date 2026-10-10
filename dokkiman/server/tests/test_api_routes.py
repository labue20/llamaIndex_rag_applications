"""API routes: uploads, document ownership, chat, CORS and request limits."""

import io
import os
import zipfile
import re


def _upload(user_client, name="report.pdf", mode="fast", content=b"%PDF-1.4 test"):
    return user_client.post(
        "/uploadFile",
        data={"file": (io.BytesIO(content), name), "processing_mode": mode},
        content_type="multipart/form-data",
    )


# --- uploads ---------------------------------------------------------------

def test_upload_gets_a_random_id_and_the_uploader_as_owner(signup, index_server):
    user_client = signup()
    response = _upload(user_client, "Tax Return 2024.pdf")
    assert response.status_code == 200

    doc_id = response.get_json()["doc_id"]
    assert re.fullmatch(r"[0-9a-f]{32}", doc_id)

    _, filepath, called_id, mode, owner_id, file_name = index_server.calls[-1]
    assert called_id == doc_id
    assert owner_id == user_client.user["id"]
    assert file_name == "Tax_Return_2024.pdf"
    assert os.path.basename(filepath) == f"{doc_id}_Tax_Return_2024.pdf"
    assert mode == "fast"


def test_same_file_name_twice_creates_two_documents(signup):
    user_client = signup()
    first = _upload(user_client, "same.pdf").get_json()["doc_id"]
    second = _upload(user_client, "same.pdf").get_json()["doc_id"]
    assert first != second
    assert len(user_client.get("/getDocuments").get_json()) == 2


def test_uploaded_file_is_kept_after_indexing(signup, index_server):
    """Originals are kept so they can be reused from My Documents."""
    _upload(signup(), mode="fast")
    assert os.path.exists(index_server.calls[-1][1])


def test_failed_upload_removes_the_saved_file(signup, index_server, monkeypatch):
    saved = []

    def failing_insert(filepath, *args):
        saved.append(filepath)
        return __import__("conftest")._Value({"error": "Could not read the document"})

    monkeypatch.setattr(index_server, "insert_into_index", failing_insert)
    assert _upload(signup()).status_code == 500
    assert not os.path.exists(saved[0])


def test_ultra_fast_upload_keeps_file_for_background_indexing(signup, index_server):
    _upload(signup(), mode="ultra-fast")
    assert os.path.exists(index_server.calls[-1][1])


def test_unknown_processing_mode_falls_back_to_ultra_fast(signup, index_server):
    _upload(signup(), mode="turbo")
    assert index_server.calls[-1][3] == "ultra-fast"


def test_upload_without_file(signup):
    assert signup().post("/uploadFile").status_code == 400


def test_oversized_upload_is_rejected(app, signup):
    app.config["MAX_CONTENT_LENGTH"] = 1024
    try:
        response = _upload(signup(), content=b"x" * 4096)
    finally:
        app.config["MAX_CONTENT_LENGTH"] = __import__("config").MAX_UPLOAD_BYTES
    assert response.status_code == 413
    assert "too large" in response.get_json()["error"]


# --- ownership -------------------------------------------------------------

def test_users_only_see_and_use_their_own_documents(signup):
    alice, bob = signup("alice@example.com"), signup("bob@example.com")
    alice_doc = _upload(alice, "alice.pdf").get_json()["doc_id"]

    assert [d["id"] for d in alice.get("/getDocuments").get_json()] == [alice_doc]
    assert bob.get("/getDocuments").get_json() == []

    assert bob.post("/chat", json={"message": "hi", "documentId": alice_doc}).status_code == 400
    assert bob.get(f"/getFullDocument/{alice_doc}").status_code == 404
    assert bob.delete(f"/documents/{alice_doc}").status_code == 400

    # Still there for Alice
    assert alice.post("/chat", json={"message": "hi", "documentId": alice_doc}).status_code == 200
    assert alice.delete(f"/documents/{alice_doc}").status_code == 200
    assert alice.get("/getDocuments").get_json() == []


def test_background_indexing_runs_as_the_requesting_user(signup, index_server):
    import time

    user_client = signup()
    doc_id = _upload(user_client, mode="ultra-fast").get_json()["doc_id"]
    assert user_client.post(f"/backgroundIndex/{doc_id}").status_code == 200

    for _ in range(50):  # runs in a thread
        if any(call[0] == "background_index_document" for call in index_server.calls):
            break
        time.sleep(0.01)
    assert ("background_index_document", doc_id, user_client.user["id"]) in index_server.calls


def test_query_searches_only_the_users_documents(signup, index_server):
    user_client = signup()
    assert user_client.get("/queryFile?text=hello").get_json() == {"text": "Answer to: hello"}
    assert index_server.calls[-1] == ("query_index", "hello", user_client.user["id"])


# --- chat ------------------------------------------------------------------

def test_chat_returns_answer(signup):
    user_client = signup()
    doc_id = _upload(user_client, "report.pdf").get_json()["doc_id"]
    response = user_client.post("/chat", json={"message": "What is on page 2?", "documentId": doc_id})
    assert response.status_code == 200
    body = response.get_json()
    assert body["response"] == "Answer to: What is on page 2?"
    assert body["document_name"] == "report.pdf"
    assert "note" in body


def test_chat_validation(signup):
    user_client = signup()
    assert user_client.post("/chat", json={"documentId": "d"}).status_code == 400
    assert user_client.post("/chat", json={"message": "hi"}).status_code == 400


# --- CORS ------------------------------------------------------------------

def test_cors_allows_only_the_frontend(client):
    allowed = client.get("/plans", headers={"Origin": "http://localhost:3000"})
    assert allowed.headers["Access-Control-Allow-Origin"] == "http://localhost:3000"
    assert allowed.headers["Access-Control-Allow-Credentials"] == "true"

    other = client.get("/plans", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in other.headers


# --- original files (My Documents) --------------------------------------------

def test_owner_can_download_the_original_file(signup):
    user_client = signup()
    doc_id = _upload(user_client, "Tax Return.pdf", content=b"%PDF-1.4 original bytes").get_json()["doc_id"]

    listed = user_client.get("/getDocuments").get_json()
    assert listed[0]["has_file"] is True

    response = user_client.get(f"/documents/{doc_id}/file")
    assert response.status_code == 200
    assert response.data == b"%PDF-1.4 original bytes"
    assert "Tax_Return.pdf" in response.headers["Content-Disposition"]


def test_other_users_cannot_download_the_file(signup):
    alice, bob = signup("alice@example.com"), signup("bob@example.com")
    doc_id = _upload(alice).get_json()["doc_id"]
    assert bob.get(f"/documents/{doc_id}/file").status_code == 404
    assert bob.get("/documents/unknown/file").status_code == 404


def test_missing_original_is_reported(signup, index_server):
    user_client = signup()
    doc_id = _upload(user_client).get_json()["doc_id"]
    os.remove(index_server.docs[doc_id]["file_path"])  # like documents uploaded before files were kept

    assert user_client.get("/getDocuments").get_json()[0]["has_file"] is False
    response = user_client.get(f"/documents/{doc_id}/file")
    assert response.status_code == 404
    assert "isn't stored" in response.get_json()["error"]


def test_file_route_only_serves_the_uploads_folder(signup, index_server, tmp_path):
    user_client = signup()
    doc_id = _upload(user_client).get_json()["doc_id"]
    outside = tmp_path / "secret.txt"
    outside.write_text("not an upload")
    index_server.docs[doc_id]["file_path"] = str(outside)

    assert user_client.get(f"/documents/{doc_id}/file").status_code == 404


def test_downloading_works_after_the_trial_ends(signup, fresh_db):
    import sqlite3

    user_client = signup()
    doc_id = _upload(user_client).get_json()["doc_id"]
    with sqlite3.connect(fresh_db) as conn:
        conn.execute("UPDATE users SET trial_ends_at = '2020-01-01T00:00:00+00:00'")
    assert user_client.get(f"/documents/{doc_id}/file").status_code == 200



# --- health check ------------------------------------------------------------

def test_health_needs_no_login(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "index_server": True}


def test_health_reports_an_unreachable_index_server(client, index_server, monkeypatch):
    def down():
        raise ConnectionRefusedError("index server is down")

    monkeypatch.setattr(index_server, "ping", down)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.get_json() == {"status": "degraded", "index_server": False}


def test_unexpected_errors_do_not_reveal_internals(signup, index_server, monkeypatch):
    """A crash's details (paths, library errors) go to the log, not to the browser."""
    user_client = signup()

    def crash(*args, **kwargs):
        raise RuntimeError("secret detail: /opt/dokkiman/app/dokkiman/server/saved_index")

    monkeypatch.setattr(index_server, "chat_with_document", crash)
    monkeypatch.setattr(index_server, "get_full_document_content", crash)
    for response in (
        user_client.post("/chat", json={"message": "hi", "documentId": "d1"}),
        user_client.get("/getFullDocument/d1"),
    ):
        assert response.status_code == 500
        assert "secret detail" not in response.get_json()["error"]
        assert "/opt/" not in response.get_json()["error"]


# --- viewing documents (My Documents) ------------------------------------------

def test_a_pdf_is_shown_in_the_browser_not_downloaded(signup):
    user_client = signup()
    doc_id = _upload(user_client, content=b"%PDF-1.4 original bytes").get_json()["doc_id"]

    response = user_client.get(f"/documents/{doc_id}/preview")
    assert response.status_code == 200
    assert response.data == b"%PDF-1.4 original bytes"
    assert response.mimetype == "application/pdf"
    assert "attachment" not in response.headers.get("Content-Disposition", "")


def test_only_the_owner_can_view_a_document(signup):
    alice, bob = signup("alice@example.com"), signup("bob@example.com")
    doc_id = _upload(alice).get_json()["doc_id"]
    assert bob.get(f"/documents/{doc_id}/preview").status_code == 404
    assert bob.get("/documents/unknown/preview").status_code == 404


def _docx_bytes():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", "<w:document/>")
    return buffer.getvalue()


def test_a_word_document_is_converted_once_and_the_copy_goes_with_it(signup, monkeypatch, tmp_path):
    import flask_demo

    conversions = []

    def convert(input_path, output_path):
        conversions.append(input_path)
        with open(output_path, "wb") as out:
            out.write(b"%PDF-1.4 converted")

    monkeypatch.setattr(flask_demo.converter, "convert_docx_to_pdf", convert)
    user_client = signup()
    doc_id = _upload(user_client, "Offer letter.docx", content=_docx_bytes()).get_json()["doc_id"]

    for _ in range(2):
        response = user_client.get(f"/documents/{doc_id}/preview")
        assert response.status_code == 200 and response.data == b"%PDF-1.4 converted"
    assert len(conversions) == 1
    assert [p.name for p in (tmp_path / "previews").iterdir()] == [f"{doc_id}.pdf"]

    assert user_client.delete(f"/documents/{doc_id}").status_code == 200
    assert list((tmp_path / "previews").iterdir()) == []


def test_a_failed_word_conversion_says_to_download_it(signup, monkeypatch, tmp_path):
    import flask_demo

    def fail(input_path, output_path):
        raise flask_demo.ConversionError("LibreOffice is not installed")

    monkeypatch.setattr(flask_demo.converter, "convert_docx_to_pdf", fail)
    user_client = signup()
    doc_id = _upload(user_client, "Offer letter.docx", content=_docx_bytes()).get_json()["doc_id"]

    response = user_client.get(f"/documents/{doc_id}/preview")
    assert response.status_code == 500
    assert "Download it" in response.get_json()["error"]
    assert "LibreOffice" not in response.get_json()["error"]
    assert not any((tmp_path / "previews").iterdir())


def test_other_files_are_not_previewed_as_pdf(signup):
    user_client = signup()
    doc_id = _upload(user_client, "notes.txt", content=b"plain notes").get_json()["doc_id"]
    assert user_client.get(f"/documents/{doc_id}/preview").status_code == 415


# --- copying documents (My Documents) ------------------------------------------

def test_a_copy_has_its_own_file_and_name_and_stays_in_the_folder(signup, index_server):
    user_client = signup()
    doc_id = _upload(user_client, "Lease.pdf", content=b"%PDF-1.4 lease").get_json()["doc_id"]
    folder = user_client.post("/folders", json={"name": "214 Willow Lane"}).get_json()
    folder_id = folder.get("id") or folder["folder"]["id"]
    user_client.post("/folders/move", json={"folder_id": folder_id, "document_ids": [doc_id]})

    response = user_client.post(f"/documents/{doc_id}/copy")
    assert response.status_code == 201
    copy = response.get_json()
    assert copy["filename"] == "Copy of Lease.pdf" and copy["folder_id"] == folder_id
    assert copy["doc_id"] != doc_id

    listed = {d["id"]: d for d in user_client.get("/getDocuments").get_json()}
    assert listed[copy["doc_id"]]["filename"] == "Copy of Lease.pdf"
    assert listed[copy["doc_id"]]["folder_id"] == folder_id
    assert user_client.get(f"/documents/{copy['doc_id']}/file").data == b"%PDF-1.4 lease"

    # Deleting the copy leaves the original
    assert user_client.delete(f"/documents/{copy['doc_id']}").status_code == 200
    assert user_client.get(f"/documents/{doc_id}/file").data == b"%PDF-1.4 lease"


def test_only_the_owner_can_copy_a_document(signup):
    alice, bob = signup("alice@example.com"), signup("bob@example.com")
    doc_id = _upload(alice).get_json()["doc_id"]
    assert bob.post(f"/documents/{doc_id}/copy").status_code == 404
    assert bob.get("/getDocuments").get_json() == []


def test_a_copy_counts_toward_the_document_limit(signup, monkeypatch):
    import flask_demo

    user_client = signup()
    doc_id = _upload(user_client).get_json()["doc_id"]
    monkeypatch.setattr(flask_demo, "document_limit_error",
                        lambda user_id, count: (flask_demo.jsonify({"error": "Limit reached"}), 403) if count >= 1 else None)
    response = user_client.post(f"/documents/{doc_id}/copy")
    assert response.status_code == 403
    assert len(user_client.get("/getDocuments").get_json()) == 1


# --- renaming documents (My Documents) ------------------------------------------

def test_renaming_keeps_the_file_type_and_tidies_the_name(signup):
    user_client = signup()
    doc_id = _upload(user_client, "lease.pdf").get_json()["doc_id"]

    response = user_client.patch(f"/documents/{doc_id}", json={"name": "  214 Willow / Lease\n2027 "})
    assert response.status_code == 200
    assert response.get_json()["filename"] == "214 Willow - Lease 2027.pdf"
    assert user_client.get("/getDocuments").get_json()[0]["filename"] == "214 Willow - Lease 2027.pdf"
    # Typing the extension doesn't double it
    assert user_client.patch(f"/documents/{doc_id}", json={"name": "Final.PDF"}).get_json()["filename"] == "Final.PDF"
    # The downloaded file has the new name
    assert "Final.PDF" in user_client.get(f"/documents/{doc_id}/file").headers["Content-Disposition"]


def test_a_rename_needs_a_name_and_your_own_document(signup):
    alice, bob = signup("alice@example.com"), signup("bob@example.com")
    doc_id = _upload(alice).get_json()["doc_id"]
    assert alice.patch(f"/documents/{doc_id}", json={"name": "  "}).status_code == 400
    assert alice.patch(f"/documents/{doc_id}", json={"name": "x" * 300}).status_code == 400
    assert bob.patch(f"/documents/{doc_id}", json={"name": "Mine now"}).status_code == 404
    assert alice.get("/getDocuments").get_json()[0]["filename"] == "report.pdf"
