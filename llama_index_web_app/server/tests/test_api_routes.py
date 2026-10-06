"""API routes: uploads, document ownership, chat, CORS and request limits."""

import io
import os
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


def test_uploaded_file_is_removed_after_indexing(signup, index_server):
    _upload(signup(), mode="fast")
    assert not os.path.exists(index_server.calls[-1][1])


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
