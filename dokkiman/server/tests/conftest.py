"""
Shared test setup.

Tests never call OpenAI and never touch the real accounts database, index or
uploads: everything runs in a temporary directory, the index uses LlamaIndex's
mock embedding/LLM, and API tests talk to an in-memory fake index server.
"""

import os
import sys
import tempfile

import pytest

SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, SERVER_DIR)

# Must be set before the server modules are imported. Tests that write files
# (uploads, the index) also switch into their own temp directory.
_SANDBOX = tempfile.mkdtemp(prefix="rag-tests-")
os.environ.update(
    USERS_DB_PATH=os.path.join(_SANDBOX, "instance", "users.db"),
    FLASK_SECRET_KEY="test-secret-key",
    INDEX_SERVER_AUTHKEY="test-authkey",
    ALLOWED_ORIGINS="http://localhost:3000",
    OPENAI_API_KEY="sk-test-not-used",
    GOOGLE_CLIENT_ID="test-client.apps.googleusercontent.com",
    # Most tests create accounts with email + password; test_google_sign_in.py covers the default
    PASSWORD_LOGIN_ENABLED="true",
    # Billing tests switch Stripe on with fake keys; the real API is never called
    STRIPE_MODE="test",
    STRIPE_SECRET_KEY="",
    STRIPE_SECRET_TEST_KEY="",
    STRIPE_WEBHOOK_SECRET="",
)


class _Value:
    """Mimics a multiprocessing proxy result: the real code calls ._getvalue()."""

    def __init__(self, value):
        self._value = value

    def _getvalue(self):
        return self._value


class FakeIndexServer:
    """In-memory stand-in for index_server.py, enforcing the same ownership rules."""

    def __init__(self):
        self.docs = {}
        self.calls = []

    def _owned(self, doc_id, owner_id):
        doc = self.docs.get(doc_id)
        return doc if doc and doc["owner_id"] == owner_id else None

    def insert_into_index(self, filepath, doc_id, processing_mode, owner_id, file_name):
        self.calls.append(("insert_into_index", filepath, doc_id, processing_mode, owner_id, file_name))
        self.docs[doc_id] = {"owner_id": owner_id, "file_name": file_name, "file_path": filepath}
        return _Value({"success": True, "doc_id": doc_id, "processing_mode": processing_mode})

    def get_documents_list(self, owner_id):
        return _Value([
            {"id": doc_id, "filename": doc["file_name"], "has_file": os.path.exists(doc["file_path"])}
            for doc_id, doc in self.docs.items() if doc["owner_id"] == owner_id
        ])

    def get_document_file(self, doc_id, owner_id):
        doc = self._owned(doc_id, owner_id)
        if not doc:
            return _Value({"error": "Document not found"})
        if not os.path.exists(doc["file_path"]):
            return _Value({"error": "The original file for this document isn't stored."})
        return _Value({"path": doc["file_path"], "file_name": doc["file_name"]})

    def chat_with_document(self, message, document_id, owner_id):
        self.calls.append(("chat_with_document", message, document_id, owner_id))
        if not self._owned(document_id, owner_id):
            return _Value({"error": f"Document '{document_id}' not found", "response": None})
        return _Value({"response": f"Answer to: {message}", "document_id": document_id,
                       "document_name": self.docs[document_id]["file_name"], "note": None})

    def get_full_document_content(self, doc_id, owner_id):
        if not self._owned(doc_id, owner_id):
            return _Value({"error": "Document not found"})
        return _Value({"doc_id": doc_id, "full_text": "text"})

    def delete_document(self, doc_id, owner_id):
        if not self._owned(doc_id, owner_id):
            return _Value({"error": f"Document with ID '{doc_id}' not found", "success": False})
        del self.docs[doc_id]
        return _Value({"success": True, "doc_id": doc_id})

    def query_index(self, query_text, owner_id):
        self.calls.append(("query_index", query_text, owner_id))
        return _Value(f"Answer to: {query_text}")

    def background_index_document(self, doc_id, owner_id):
        self.calls.append(("background_index_document", doc_id, owner_id))
        return _Value(bool(self._owned(doc_id, owner_id)))

    def ping(self):
        return _Value(True)

    def claim_guest_documents(self, guest_id, owner_id):
        moved = 0
        for doc in self.docs.values():
            if doc["owner_id"] == guest_id:
                doc["owner_id"] = owner_id
                moved += 1
        return _Value(moved)

    def document_counts(self):
        counts = {}
        for doc in self.docs.values():
            if doc["owner_id"]:
                counts[doc["owner_id"]] = counts.get(doc["owner_id"], 0) + 1
        return _Value(counts)

    def claim_unowned_documents(self, owner_id):
        claimed = 0
        for doc in self.docs.values():
            if not doc["owner_id"]:
                doc["owner_id"] = owner_id
                claimed += 1
        return _Value(claimed)


@pytest.fixture
def make_pdf(tmp_path):
    """Create a PDF whose page N contains 'This is page N. <marker>'."""
    import fitz

    def _make(pages=3, name="sample.pdf", marker="Sample text"):
        path = tmp_path / name
        doc = fitz.open()
        for number in range(1, pages + 1):
            page = doc.new_page()
            page.insert_text((72, 72), f"This is page {number}. {marker} for page {number}.")
        doc.save(path)
        doc.close()
        return path

    return _make


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """A new, empty accounts database for each test."""
    import auth
    import db

    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "instance" / "users.db"))
    auth.init_db()
    return db.DB_PATH


@pytest.fixture
def index_server():
    """The in-memory fake index server used by the API."""
    return FakeIndexServer()


@pytest.fixture
def app(fresh_db, index_server, monkeypatch, tmp_path):
    import flask_demo

    monkeypatch.setattr(flask_demo, "manager", index_server)
    monkeypatch.chdir(tmp_path)  # uploads are saved under ./documents
    flask_demo.app.config["TESTING"] = True
    return flask_demo.app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def signup(app):
    """Create an account with its own logged-in client: signup('a@x.com') -> client."""

    def _signup(email="user@example.com", password="password-123"):
        user_client = app.test_client()
        response = user_client.post("/auth/signup", json={"email": email, "password": password})
        assert response.status_code == 201, response.get_json()
        user_client.user = response.get_json()["user"]
        return user_client

    return _signup
